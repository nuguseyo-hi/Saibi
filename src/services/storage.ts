import { initialInfiltration, validateDungeonProgress } from '../dungeon/model.ts';
import type { DungeonData } from '../dungeon/model.ts';
import type { Scenario } from '../domain/scenario.ts';
import { getDialogue, flagRegistry } from '../domain/scenario.ts';
import { record, safeId } from '../domain/validation.ts';
import { commitDraft } from '../domain/mind/editing.ts';
import type { MindEvent } from '../domain/mind/editing.ts';
import type { Progress } from '../domain/progress.ts';

export const SAVE_KEY = 'nyarlathotep-vn.save.v1';
const SCHEMA_VERSION = 2;
export interface SavePort {
  read: () => { progress: Progress | null; error: string | null };
  write: (progress: Progress) => string | null;
}
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }
function invalid(): never { throw new Error('손상되었거나 현재 시나리오와 호환되지 않는 저장 데이터입니다.'); }
function same(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => same(v, b[i]));
  if (record(a) && record(b)) return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => Object.hasOwn(b, k) && same(a[k], b[k]));
  return a === b;
}
export function decodeSave(raw: string, scenario: Scenario, events: MindEvent[], dungeon?: DungeonData): Progress {
  const envelope: unknown = JSON.parse(raw);
  if (!record(envelope) || ![1, SCHEMA_VERSION].includes(envelope.schemaVersion as number) || envelope.scenarioId !== scenario.id || !record(envelope.state)) invalid();
  const legacyContent = scenario.contentVersion === 'dungeon-1' && envelope.contentVersion === 'confession-1';
  if (!legacyContent && envelope.contentVersion !== (scenario.contentVersion ?? 'legacy-1')) invalid();
  const s = envelope.state;
  if (envelope.schemaVersion === 1 || legacyContent) {
    s.dungeon ??= null; s.infiltration ??= {};
    if (record(s.characterFlags)) for (const c of scenario.characters) {
      const f=s.characterFlags[c.id];
      if(record(f)) for(const key of c.flagKeys??[]) if(!Object.hasOwn(f,key)) f[key]=false;
    }
  }
  if (dungeon && record(s.infiltration) && !Object.hasOwn(s.infiltration,dungeon.characterId)) s.infiltration[dungeon.characterId]=initialInfiltration(dungeon);
  if (!['dialogue', 'mindEdit', 'dungeon', 'dungeonResult'].includes(String(s.screen)) || !safeId(s.nodeId) || !safeId(s.activeCharacterId)
    || !scenario.characters.some(c => c.id === s.activeCharacterId) || !Number.isSafeInteger(s.revision) || Number(s.revision) < 1) invalid();
  if (!record(s.infiltration)) invalid();
  for(const [id,state] of Object.entries(s.infiltration)) {
    if(!scenario.characters.some(c=>c.id===id) || !record(state) || !Number.isInteger(state.guard) || Number(state.guard)<0 || !Number.isInteger(state.night) || Number(state.night)<1 || !Number.isInteger(state.attempts) || Number(state.attempts)<0 || (dungeon && Number(state.attempts)>dungeon.rules.maxAttempts)) invalid();
  }
  if (s.dungeon !== null && (!dungeon || !validateDungeonProgress(s.dungeon,dungeon))) invalid();
  const d=s.dungeon as Progress['dungeon'];
  if ((s.screen==='dungeon' && d?.status!=='exploring') || (s.screen==='dungeonResult' && !['failed','completed'].includes(d?.status??''))) invalid();
  if (d?.status === 'editing' && s.screen !== 'mindEdit') invalid();
  if (d && d.status !== 'completed' && d.outcomeId !== null) invalid();
  const node = getDialogue(scenario, s.nodeId);
  if (node.characterId && node.characterId !== s.activeCharacterId) invalid();
  const registry = flagRegistry(scenario);
  if (!record(s.characterFlags) || Object.keys(s.characterFlags).length !== scenario.characters.length) invalid();
  for (const c of scenario.characters) {
    const flags = s.characterFlags[c.id];
    if (!record(flags) || Object.keys(flags).length !== registry[c.id].length) invalid();
    for (const [key, value] of Object.entries(flags)) if (!registry[c.id].includes(key) || typeof value !== 'boolean') invalid();
  }
  if (!Array.isArray(s.log) || s.log.length === 0 || !Array.isArray(s.editResults)) invalid();
  for (const entry of s.log) {
    if (!record(entry) || !['dialogue', 'choice'].includes(String(entry.kind)) || typeof entry.text !== 'string'
      || !['narrator', 'player', ...scenario.characters.map(c => c.id)].includes(String(entry.speaker))) invalid();
  }
  const commits = new Set<string>();
  for (const item of s.editResults) {
    if (!record(item) || !safeId(item.sessionId) || commits.has(item.sessionId)) invalid();
    const event = events.find(e => e.id === item.eventId && e.characterId === item.characterId);
    if (!event) invalid();
    const expected = commitDraft(event, item.selections, item.sessionId).result;
    if (!same(expected, item)) invalid();
    commits.add(item.sessionId);
  }
  if (['mindEdit','dungeon','dungeonResult'].includes(String(s.screen))) {
    const session = s.activeMind;
    const core = dungeon && d && ['dungeon','dungeonResult'].includes(String(s.screen)) || (dungeon && d?.status==='editing');
    if (!record(session) || !safeId(session.id) || session.sourceNodeId !== node.id
      || session.eventId !== (core ? dungeon!.coreEventId : node.mindEventId)
      || !events.some(e => e.id === session.eventId && e.characterId === s.activeCharacterId)) invalid();
    if(core && (node.id!==dungeon!.sourceNodeId || s.activeCharacterId!==dungeon!.characterId))invalid();
    if(s.screen==='dungeonResult' && d?.status==='completed') { if(!commits.has(session.id) || !s.editResults.some(item => record(item) && item.sessionId === session.id && Array.isArray(item.resultIds) && item.resultIds.includes(d.outcomeId)))invalid(); }
    else if(commits.has(session.id))invalid();
  } else if (s.activeMind !== null) invalid();
  return s as unknown as Progress;
}
export function createSavePort(getStorage: () => StorageLike, scenario: Scenario, events: MindEvent[], dungeon?: DungeonData): SavePort {
  return {
    read() {
      try {
        const raw = getStorage().getItem(SAVE_KEY);
        return { progress: raw === null ? null : decodeSave(raw, scenario, events, dungeon), error: null };
      } catch { return { progress: null, error: '저장을 불러오지 못했습니다. 기존 저장은 유지됩니다. 새 게임을 시작하면 교체됩니다.' }; }
    },
    write(progress) {
      try {
        getStorage().setItem(SAVE_KEY, JSON.stringify({ schemaVersion: SCHEMA_VERSION, contentVersion: scenario.contentVersion ?? 'legacy-1', scenarioId: scenario.id, savedAt: new Date().toISOString(), state: progress }));
        return null;
      } catch { return '자동 저장에 실패했습니다. 현재 플레이는 유지되지만 새로고침하면 최근 진행을 잃을 수 있습니다.'; }
    },
  };
}
