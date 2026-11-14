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
  screen: 'title' | 'dialogue' | 'mindEdit'; checkpoint: Progress | null;
  saveStatus: 'idle' | 'saved' | 'error' | 'memory'; saveError: string | null; actionError: string | null;
  start: () => void; resume: () => void;
  advance: (expectedNodeId: string) => void;
  choose: (expectedNodeId: string, choiceId: string) => void;
  confirmEdit: (sessionId: string, draft: EditDraft) => void;
  cancelEdit: (sessionId: string) => void;
  retrySave: () => void;
  returnToTitle: () => void;
}
export function createGameStore(scenario: Scenario, events: MindEvent[] = [], storage?: SavePort) {
  const flags = (): CharacterFlags => Object.fromEntries(scenario.characters.map(c => [c.id, Object.fromEntries((c.flagKeys ?? []).map(key => [key, false]))]));
  const entry = (id: string): LogEntry => {
    const n = getDialogue(scenario, id);
    return { speaker: n.speaker, text: n.text, kind: 'dialogue' };
  };
  const initialNode = resolveNode(scenario, scenario.startNodeId, flags());
  const initial = (): Progress => ({ screen: 'dialogue', nodeId: initialNode.id, activeCharacterId: initialNode.characterId ?? scenario.characters[0].id,
    revision: 1, characterFlags: flags(), editResults: [], log: [entry(initialNode.id)], activeMind: null });
  const loaded = storage?.read() ?? { progress: null, error: null };
  return createStore<GameStore>()((set, get) => {
    const persist = (p: Progress) => {
      const error = storage?.write(p) ?? null;
      set({ ...p, checkpoint: structuredClone(p), saveStatus: error ? 'error' : storage ? 'saved' : 'memory', saveError: error, actionError: null });
    };
    const snapshot = (s: GameStore): Progress => ({ screen: s.screen === 'mindEdit' ? 'mindEdit' : 'dialogue', nodeId: s.nodeId,
      activeCharacterId: s.activeCharacterId, revision: s.revision, characterFlags: s.characterFlags, editResults: s.editResults, log: s.log, activeMind: s.activeMind });
    const move = (s: GameStore, id: string, newFlags = s.characterFlags, log = s.log): Progress => {
      const n = resolveNode(scenario, id, newFlags);
      return { ...snapshot(s), screen: 'dialogue', activeMind: null, nodeId: n.id,
        activeCharacterId: n.characterId ?? s.activeCharacterId, characterFlags: newFlags,
        revision: s.revision + 1, log: [...log, entry(n.id)] };
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
          const p = move(s, node.next, applyEffects(s.characterFlags, effects));
          persist({ ...p, editResults: [...s.editResults, result] });
        } catch { set({ actionError: '편집 내용이 유효하지 않습니다. 원문으로 되돌린 뒤 다시 선택해 주세요.' }); }
      },
      cancelEdit: sessionId => {
        const s = get();
        if (s.screen !== 'mindEdit' || s.activeMind?.id !== sessionId) return;
        persist({ ...snapshot(s), screen: 'dialogue', nodeId: s.activeMind.sourceNodeId, activeMind: null, revision: s.revision + 1 });
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
