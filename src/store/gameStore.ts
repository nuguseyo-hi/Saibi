import { canEnter, initialDungeon, initialInfiltration, applyPuzzle, settleDoors, hitDungeon, objectAvailable, safePosition, validPosition } from '../dungeon/model.ts';
import type { DungeonData, Point } from '../dungeon/model.ts';
import { createStore } from 'zustand/vanilla';
import { getDialogue, getNextNode, resolveNode } from '../domain/scenario.ts';
import type { Scenario } from '../domain/scenario.ts';
import { applyEffects } from '../domain/flags.ts';
import type { CharacterFlags } from '../domain/flags.ts';
import { commitDraft } from '../domain/mind/editing.ts';
import type { EditDraft, MindEvent } from '../domain/mind/editing.ts';
import type { Progress, LogEntry } from '../domain/progress.ts';
import type { SavePort } from '../services/storage.ts';
export type { LogEntry } from '../domain/progress.ts';

interface GameStore extends Omit<Progress, 'screen'> {
  screen: 'title' | 'dialogue' | 'mindEdit' | 'dungeon' | 'dungeonResult'; checkpoint: Progress | null;
  saveStatus: 'idle' | 'saved' | 'error' | 'memory'; saveError: string | null; actionError: string | null;
  start: () => void; resume: () => void;
  advance: (expectedNodeId: string) => void;
  choose: (expectedNodeId: string, choiceId: string) => void;
  confirmEdit: (sessionId: string, draft: EditDraft) => void;
  cancelEdit: (sessionId: string) => void;
  retrySave: () => void;
  returnToTitle: () => void;
  checkpointDungeon: (position: Point) => void;
  inspectDungeon: (objectId: string, position: Point) => boolean;
  travelDungeon: (objectId: string, position: Point) => void;
  solveDungeonPuzzle: (objectId: string, optionId: string) => void;
  settleDungeonDoors: () => void;
  dungeonHit: (enemyId: string, position: Point, now: number) => void;
  openDungeonCore: (objectId: string, position: Point) => void;
  finishDungeon: () => void;
  retreatDungeon: () => void;
  nextNight: () => void;
  debugDungeon: () => void;
}
export function createGameStore(scenario: Scenario, events: MindEvent[] = [], storage?: SavePort, options: { dungeon?: DungeonData; development?: boolean } = {}) {
  const config = options.dungeon;
  const flags = (): CharacterFlags => Object.fromEntries(scenario.characters.map(c => [c.id, Object.fromEntries((c.flagKeys ?? []).map(key => [key, false]))]));
  const entry = (id: string): LogEntry => {
    const n = getDialogue(scenario, id);
    return { speaker: n.speaker, text: n.text, kind: 'dialogue' };
  };
  const initialNode = resolveNode(scenario, scenario.startNodeId, flags());
  const initial = (): Progress => ({ screen: 'dialogue', nodeId: initialNode.id, activeCharacterId: initialNode.characterId ?? scenario.characters[0].id,
    revision: 1, dungeon: null, infiltration: config ? { [config.characterId]: initialInfiltration(config) } : {}, characterFlags: flags(), editResults: [], log: [entry(initialNode.id)], activeMind: null });
  const loaded = storage?.read() ?? { progress: null, error: null };
  return createStore<GameStore>()((set, get) => {
    const persist = (p: Progress) => {
      const error = storage?.write(p) ?? null;
      set({ ...p, checkpoint: structuredClone(p), saveStatus: error ? 'error' : storage ? 'saved' : 'memory', saveError: error, actionError: null });
    };
    const snapshot = (s: GameStore): Progress => ({ screen: s.screen === 'title' ? 'dialogue' : s.screen, nodeId: s.nodeId,
      dungeon: s.dungeon, infiltration: s.infiltration, activeCharacterId: s.activeCharacterId, revision: s.revision, characterFlags: s.characterFlags, editResults: s.editResults, log: s.log, activeMind: s.activeMind });
    const move = (s: GameStore, id: string, newFlags = s.characterFlags, log = s.log): Progress => {
      const n = resolveNode(scenario, id, newFlags);
      return { ...snapshot(s), screen: 'dialogue', activeMind: null, nodeId: n.id,
        activeCharacterId: n.characterId ?? s.activeCharacterId, characterFlags: newFlags,
        revision: s.revision + 1, log: [...log, entry(n.id)] };
    };
    const enterDungeon = (s: GameStore, bypass = false) => {
      if (!config) return;
      const state = s.infiltration[config.characterId] ?? initialInfiltration(config);
      if (!bypass && !canEnter(config, state)) { set({ actionError: '경계도가 높거나 오늘 밤의 침투 기회를 모두 사용했습니다. 다음 밤에 다시 시도하세요.' }); return; }
      const fresh = initialDungeon(config);
      const dungeon = s.dungeon?.id === config.id ? { ...fresh, fragments: s.dungeon.fragments, inspected: s.dungeon.inspected, puzzles: s.dungeon.puzzles } : fresh;
      persist({ ...snapshot(s), screen: 'dungeon', nodeId: config.sourceNodeId, activeCharacterId: config.characterId, dungeon,
        infiltration: { ...s.infiltration, [config.characterId]: { ...state, attempts: state.attempts + 1 } }, revision: s.revision + 1,
        activeMind: { id: `session-${s.revision + 1}`, eventId: config.coreEventId, sourceNodeId: config.sourceNodeId } });
    };
    const nearObject = (id: string, position: Point) => {
      const s = get(), d = s.dungeon;
      if (!config || s.screen !== 'dungeon' || !d || d.status !== 'exploring') return null;
      const room = config.rooms.find(r => r.id === d.roomId)!;
      const object = room.objects.find(o => o.id === id);
      return object && validPosition(position, room) && Math.hypot(object.x-position.x,object.y-position.y) <= config.rules.interactionRadius + 8 ? { object, room, d, s } : null;
    };
    return {
      ...(loaded.progress ?? initial()), screen: loaded.progress?.screen ?? 'title',
      checkpoint: loaded.progress, saveStatus: loaded.error ? 'error' : loaded.progress ? 'saved' : 'idle', saveError: loaded.error, actionError: null,
      start: () => persist(initial()),
      resume: () => { const p = get().checkpoint; if (p) set({ ...structuredClone(p), actionError: null }); },
      advance: expectedNodeId => {
        const s = get();
        if (s.screen !== 'dialogue' || s.nodeId !== expectedNodeId) return;
        const n = getDialogue(scenario, s.nodeId);
        if (config && n.id === config.sourceNodeId) { enterDungeon(s); return; }
        if (n.mindEventId) {
          const event = events.find(e => e.id === n.mindEventId && e.characterId === n.characterId);
          if (!event) { set({ actionError: '사고 편집 이벤트를 찾을 수 없습니다.' }); return; }
          persist({ ...snapshot(s), screen: 'mindEdit', activeCharacterId: event.characterId, revision: s.revision + 1,
            activeMind: { id: `session-${s.revision + 1}`, eventId: event.id, sourceNodeId: n.id } });
          return;
        }
        const next = getNextNode(scenario, s.nodeId);
        if (next) persist(move(s, next));
      },
      choose: (expectedNodeId, choiceId) => {
        const s = get();
        if (s.screen !== 'dialogue' || s.nodeId !== expectedNodeId) return;
        const next = getNextNode(scenario, s.nodeId, choiceId);
        const choice = getDialogue(scenario, s.nodeId).choices?.find(c => c.id === choiceId);
        if (next && choice) persist(move(s, next, applyEffects(s.characterFlags, choice.effects ?? []), [...s.log, { speaker: 'player', text: choice.text, kind: 'choice' }]));
      },
      confirmEdit: (sessionId, draft) => {
        const s = get();
        if (s.screen !== 'mindEdit' || s.activeMind?.id !== sessionId || s.editResults.some(r => r.sessionId === sessionId)) return;
        const event = events.find(e => e.id === s.activeMind!.eventId);
        const node = getDialogue(scenario, s.activeMind.sourceNodeId);
        if (!event || !node.next) return;
        try {
          const { result, effects } = commitDraft(event, draft, sessionId);
          if (config && s.dungeon?.status === 'editing' && event.id === config.coreEventId) {
            const outcome = config.outcome.find(o => result.resultIds.includes(o.resultId));
            if (!outcome) throw new Error('Unknown dungeon result');
            persist({ ...snapshot(s), screen: 'dungeonResult', characterFlags: applyEffects(s.characterFlags, effects), editResults: [...s.editResults, result],
              revision: s.revision + 1, dungeon: { ...s.dungeon, status: 'completed', outcomeId: outcome.resultId } });
            return;
          }
          const p = move(s, node.next, applyEffects(s.characterFlags, effects));
          persist({ ...p, editResults: [...s.editResults, result] });
        } catch { set({ actionError: '편집 내용이 유효하지 않습니다. 원문으로 되돌린 뒤 다시 선택해 주세요.' }); }
      },
      cancelEdit: sessionId => {
        const s = get();
        if (s.screen !== 'mindEdit' || s.activeMind?.id !== sessionId) return;
        if (s.dungeon?.status === 'editing') { persist({ ...snapshot(s), screen: 'dungeon', dungeon: { ...s.dungeon, status: 'exploring' }, revision: s.revision + 1 }); return; }
        persist({ ...snapshot(s), screen: 'dialogue', nodeId: s.activeMind.sourceNodeId, activeMind: null, revision: s.revision + 1 });
      },
      checkpointDungeon: position => {
        const s = get(); if (!config || s.screen !== 'dungeon' || !s.dungeon) return;
        const room = config.rooms.find(r => r.id === s.dungeon!.roomId)!;
        persist({ ...snapshot(s), dungeon: { ...s.dungeon, position: safePosition(position,room) } });
      },
      inspectDungeon: (objectId, position) => {
        const hit = nearObject(objectId,position); if (!hit || !objectAvailable(hit.d,hit.object)) return false;
        const { s,d,object } = hit;
        const fragments = object.fragmentId && !d.fragments.includes(object.fragmentId) ? [...d.fragments,object.fragmentId] : d.fragments;
        persist({ ...snapshot(s), dungeon: { ...d, position, fragments, inspected: d.inspected.includes(objectId) ? d.inspected : [...d.inspected,objectId] }, revision: s.revision + 1 });
        return true;
      },
      travelDungeon: (objectId, position) => {
        const hit = nearObject(objectId,position); if (!hit || hit.object.kind !== 'door' || !objectAvailable(hit.d,hit.object)) return;
        persist({ ...snapshot(hit.s), dungeon: { ...hit.d, roomId: hit.object.targetRoom!, position: hit.object.spawn! }, revision: hit.s.revision + 1 });
      },
      solveDungeonPuzzle: (objectId, optionId) => {
        const s = get(); if (!config || !s.dungeon) return;
        const hit = nearObject(objectId,s.dungeon.position);
        if (!hit || !hit.d.inspected.includes(objectId) || !objectAvailable(hit.d,hit.object)) return;
        const puzzle = config.puzzles.find(p=>p.id===hit.object.puzzleId); if (!puzzle) return;
        try { persist({ ...snapshot(s), dungeon: applyPuzzle(hit.d,puzzle,optionId,Date.now()), revision: s.revision + 1 }); }
        catch { set({actionError:'허용되지 않은 퍼즐 선택입니다.'}); }
      },
      settleDungeonDoors: () => {
        const s = get(); if (!s.dungeon || s.screen !== 'dungeon') return;
        const d = settleDoors(s.dungeon,Date.now()); if (d !== s.dungeon) persist({ ...snapshot(s), dungeon: d, revision: s.revision + 1 });
      },
      dungeonHit: (enemyId, position, now) => {
        const s=get(); if (!config || s.screen !== 'dungeon' || !s.dungeon) return;
        const room=config.rooms.find(r=>r.id===s.dungeon!.roomId)!;
        const spawn=room.enemies.find(e=>e.id===enemyId), type=config.enemyTypes.find(e=>e.id===spawn?.typeId);
        if (!type || !Number.isFinite(now)) return;
        const d=hitDungeon(s.dungeon,type.damage,now,config.rules.immunityMs); if(d===s.dungeon)return;
        const infiltration=structuredClone(s.infiltration);
        if(d.status==='failed')infiltration[config.characterId].guard+=config.rules.guardPenalty;
        persist({ ...snapshot(s), screen:d.status==='failed'?'dungeonResult':'dungeon', dungeon:{...d,position:safePosition(position,room)}, infiltration, revision:s.revision+1 });
      },
      openDungeonCore: (objectId,position) => {
        const hit=nearObject(objectId,position); if(!hit || hit.object.kind!=='core' || !objectAvailable(hit.d,hit.object) || !config || hit.d.fragments.length !== config.fragments.length)return;
        persist({...snapshot(hit.s),screen:'mindEdit',dungeon:{...hit.d,status:'editing',position},revision:hit.s.revision+1});
      },
      finishDungeon: () => {
        const s=get(); if(!config || s.screen!=='dungeonResult' || !s.dungeon)return;
        persist(move(s,s.dungeon.status==='completed'?config.successNext:config.sourceNodeId));
      },
      retreatDungeon: () => {
        const s=get(); if(!config || s.screen!=='dungeon')return;
        persist(move(s,config.sourceNodeId));
      },
      nextNight: () => {
        const s=get(); if(!config || s.screen!=='dialogue' || s.nodeId!==config.sourceNodeId)return;
        const state=s.infiltration[config.characterId]??initialInfiltration(config);
        persist({...snapshot(s),infiltration:{...s.infiltration,[config.characterId]:{guard:config.rules.initialGuard,attempts:0,night:state.night+1}},revision:s.revision+1});
      },
      debugDungeon: () => {
        if(!config || !options.development)return;
        const s=get(); set({...initial(),nodeId:config.sourceNodeId,log:[entry(config.sourceNodeId)],revision:s.revision+1});
        enterDungeon(get(),true);
      },
      returnToTitle: () => set({ screen: 'title', activeMind: null, actionError: null }),
      retrySave: () => {
        const s = get();
        if (!s.checkpoint) return;
        const error = storage?.write(s.checkpoint) ?? null;
        set({ saveError: error, saveStatus: error ? 'error' : storage ? 'saved' : 'memory' });
      },
    };
  });
}
