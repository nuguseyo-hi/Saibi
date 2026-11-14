import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseScenario, resolveNode } from '../src/domain/scenario.ts';
import type { EditDraft } from '../src/domain/mind/editing.ts';
import { createDraft, commitDraft, parseMindEvents } from '../src/domain/mind/editing.ts';
import { createGameStore } from '../src/store/gameStore.ts';
import { createSavePort, decodeSave, SAVE_KEY } from '../src/services/storage.ts';
import type { StorageLike } from '../src/services/storage.ts';

const rawScenario = JSON.parse(readFileSync(new URL('../src/content/scenarios/intro.json', import.meta.url), 'utf8'));
const rawEvents = JSON.parse(readFileSync(new URL('../src/content/mind-scenes/bells.json', import.meta.url), 'utf8'));
const scenario = parseScenario(rawScenario);
const events = parseMindEvents(rawEvents, scenario);
const event = events[0];
function memory() {
  const values = new Map<string, string>();
  const storage: StorageLike = { getItem: k => values.get(k) ?? null, setItem: (k, v) => { values.set(k, v); } };
  return { values, storage, port: createSavePort(() => storage, scenario, events) };
}
function reachMind(store: ReturnType<typeof createGameStore>, choice = 'comfort') {
  store.getState().start();
  for (const id of ['arrival', 'greeting', 'welcome']) store.getState().advance(id);
  store.getState().choose('question', choice);
  for (const id of [`${choice}_reply`, `${choice}_end`, 'confession_intro', 'bell_memory']) store.getState().advance(id);
  assert.equal(store.getState().screen, 'mindEdit');
  return store.getState().activeMind!.id;
}

test('replace targets one ID only; Korean inflection and duplicate untouched word are correct', () => {
  const result = commitDraft(event, { ...createDraft(event), bell_meaning: 'revelation' }, 'test-1').result;
  assert.equal(result.sentences[0].text, '그날 밤 내가 들었던 종소리는 계시였을 것이다.');
  assert.equal(result.sentences[2].text, '나는 우연이라는 말을 여러 번 되뇌었다.');
  assert.deepEqual(event, rawEvents[0]);
});
test('deletion removes the saved edited sentence, not other sentence IDs', () => {
  const result = commitDraft(event, { ...createDraft(event), fear_memory: 'delete' }, 'test-1').result;
  assert.equal(result.sentences.length, 2);
  assert.ok(!result.sentences.some(s => s.id === 'fear_sentence'));
  assert.ok(!result.afterText.includes('두렵다'));
  assert.ok(result.beforeText.includes('두렵다'));
});
for (const word of ['coincidence', 'revelation', 'illusion']) {
  for (const deletion of ['keep', 'delete']) {
    test(`${word} + ${deletion}: confirm → matching flags/dialogue → reload → completion`, () => {
      const m = memory();
      const store = createGameStore(scenario, events, m.port);
      const sessionId = reachMind(store);
      const draft = { bell_meaning: word, fear_memory: deletion };
      const beforeFlags = structuredClone(store.getState().characterFlags);
      // A preview computes values but does not mutate the live state or save.
      commitDraft(event, draft, sessionId);
      assert.deepEqual(store.getState().characterFlags, beforeFlags);
      store.getState().confirmEdit(sessionId, draft);
      assert.equal(store.getState().screen, 'dialogue');
      assert.equal(store.getState().nodeId, `reply_${word}`);
      const flags = store.getState().characterFlags.elin;
      assert.equal(flags.bellCoincidence, word === 'coincidence');
      assert.equal(flags.bellRevelation, word === 'revelation');
      assert.equal(flags.bellIllusion, word === 'illusion');
      assert.equal(flags.fearDeleted, deletion === 'delete');
      const expected = structuredClone(store.getState().checkpoint);
      store.getState().confirmEdit(sessionId, draft);
      assert.deepEqual(store.getState().checkpoint, expected);
      const restored = createGameStore(scenario, events, m.port);
      assert.equal(restored.getState().saveError, null);
      assert.deepEqual(restored.getState().checkpoint, expected);
      assert.equal(restored.getState().editResults.length, 1);
      restored.getState().advance(`reply_${word}`);
      assert.equal(restored.getState().nodeId, deletion === 'delete' ? 'reply_deleted' : 'reply_retained');
      restored.getState().advance(restored.getState().nodeId);
      assert.equal(restored.getState().nodeId, 'echo_comfort');
      restored.getState().advance('echo_comfort');
      assert.equal(restored.getState().nodeId, 'confession_done');
      const end = createGameStore(scenario, events, m.port);
      assert.equal(end.getState().nodeId, 'confession_done');
      assert.equal(end.getState().editResults.length, 1);
    });
  }
}
test('confession choice effects survive editing and drive a later branch', () => {
  const store = createGameStore(scenario, events);
  const session = reachMind(store, 'curiosity');
  store.getState().confirmEdit(session, createDraft(event));
  store.getState().advance('reply_coincidence');
  store.getState().advance('reply_retained');
  assert.equal(store.getState().nodeId, 'echo_curiosity');
  assert.equal(store.getState().characterFlags.elin.trustedPlayer, false);
});
test('cancel preserves original state and rejects stale confirmation after re-entry', () => {
  const m = memory(), store = createGameStore(scenario, events, m.port);
  const session = reachMind(store);
  const original = structuredClone(store.getState().characterFlags);
  store.getState().cancelEdit(session);
  assert.equal(store.getState().screen, 'dialogue');
  assert.equal(store.getState().nodeId, 'bell_memory');
  assert.deepEqual(store.getState().characterFlags, original);
  assert.deepEqual(store.getState().editResults, []);
  store.getState().advance('bell_memory');
  assert.notEqual(store.getState().activeMind!.id, session);
  store.getState().confirmEdit(session, { bell_meaning: 'revelation', fear_memory: 'delete' });
  assert.deepEqual(store.getState().editResults, []);
  assert.deepEqual(store.getState().characterFlags, original);
});
test('reload or leaving screen discards draft, retaining only the unmodified edit session', () => {
  const m = memory(), store = createGameStore(scenario, events, m.port);
  reachMind(store);
  const draft = createDraft(event); draft.bell_meaning = 'illusion'; draft.fear_memory = 'delete';
  store.getState().returnToTitle();
  store.getState().resume();
  assert.equal(store.getState().screen, 'mindEdit');
  assert.deepEqual(store.getState().editResults, []);
  const loaded = createGameStore(scenario, events, m.port);
  assert.equal(loaded.getState().screen, 'mindEdit');
  assert.deepEqual(createDraft(event), { bell_meaning: 'coincidence', fear_memory: 'keep' });
  const saved = JSON.parse(m.values.get(SAVE_KEY)!);
  assert.equal(saved.state.draft, undefined);
  assert.equal(saved.state.editResults.length, 0);
  assert.ok(!Object.values(loaded.getState().characterFlags.elin).slice(1).includes(true));
});
test('invalid options and extra or missing regions never commit', () => {
  const store = createGameStore(scenario, events);
  const session = reachMind(store);
  const invalidDrafts: EditDraft[] = [{}, { bell_meaning: 'invented', fear_memory: 'keep' }, { ...createDraft(event), extra: 'delete' }];
  for (const draft of invalidDrafts) {
    store.getState().confirmEdit(session, draft);
    assert.equal(store.getState().screen, 'mindEdit');
    assert.equal(store.getState().editResults.length, 0);
    assert.ok(store.getState().actionError);
  }
});
test('new game resets results/flags/log and overwrites the valid checkpoint', () => {
  const m = memory(), store = createGameStore(scenario, events, m.port);
  const session = reachMind(store);
  store.getState().confirmEdit(session, { bell_meaning: 'revelation', fear_memory: 'delete' });
  store.getState().start();
  const restored = createGameStore(scenario, events, m.port);
  assert.equal(restored.getState().nodeId, 'arrival');
  assert.equal(restored.getState().log.length, 1);
  assert.deepEqual(restored.getState().editResults, []);
  assert.ok(Object.values(restored.getState().characterFlags.elin).every(v => v === false));
});
test('storage write errors keep gameplay and allow retry without duplicate results', () => {
  const m = memory(); let denied = true;
  const port = createSavePort(() => ({ ...m.storage, setItem(k, v) { if (denied) throw new Error('quota'); m.storage.setItem(k, v); } }), scenario, events);
  const store = createGameStore(scenario, events, port);
  const session = reachMind(store);
  store.getState().confirmEdit(session, { bell_meaning: 'illusion', fear_memory: 'delete' });
  assert.equal(store.getState().saveStatus, 'error');
  assert.equal(store.getState().nodeId, 'reply_illusion');
  denied = false; store.getState().retrySave();
  assert.equal(store.getState().saveStatus, 'saved');
  const restored = createGameStore(scenario, events, port);
  assert.equal(restored.getState().editResults.length, 1);
  assert.equal(restored.getState().nodeId, 'reply_illusion');
});
test('blocked localStorage access does not crash startup', () => {
  const port = createSavePort(() => { throw new Error('blocked'); }, scenario, events);
  const store = createGameStore(scenario, events, port);
  assert.equal(store.getState().screen, 'title');
  assert.ok(store.getState().saveError);
  store.getState().start();
  assert.equal(store.getState().screen, 'dialogue');
});
test('corrupt / incompatible saves are rejected and preserved until explicit new game', () => {
  const m = memory(), store = createGameStore(scenario, events, m.port);
  const session = reachMind(store);
  store.getState().confirmEdit(session, createDraft(event));
  const valid = m.values.get(SAVE_KEY)!;
  const mutations = [
    (d: any) => { d.schemaVersion = 99; },
    (d: any) => { d.contentVersion = 'old'; },
    (d: any) => { d.state.nodeId = 'not-a-node'; },
    (d: any) => { d.state.characterFlags.elin.bellCoincidence = 'yes'; },
    (d: any) => { d.state.editResults[0].afterText = 'altered'; },
    (d: any) => { d.state.editResults.push(d.state.editResults[0]); },
    (d: any) => { d.state.screen = 'mindEdit'; d.state.activeMind = null; },
  ];
  const invalidSaves = ['{broken', ...mutations.map(mutate => { const d = JSON.parse(valid); mutate(d); return JSON.stringify(d); })];
  for (const raw of invalidSaves) {
    m.values.set(SAVE_KEY, raw);
    assert.throws(() => decodeSave(raw, scenario, events));
    const restored = createGameStore(scenario, events, m.port);
    assert.equal(restored.getState().screen, 'title');
    assert.equal(restored.getState().checkpoint, null);
    assert.ok(restored.getState().saveError);
    assert.equal(m.values.get(SAVE_KEY), raw);
  }
});
test('invalid event targets, overlaps, unknown flags and result IDs fail at load', () => {
  const mutations = [
    (d: any) => { d[0].regions[0].targetId = 'missing'; },
    (d: any) => { d[0].regions[0].options[1].resultId = d[0].regions[0].options[0].resultId; },
    (d: any) => { d[0].regions[0].options[0].effects[0].key = 'unknown'; },
    (d: any) => { d[0].originalText = 'wrong original'; },
    (d: any) => { d[0].regions[0].defaultOptionId = 'missing'; },
    (d: any) => { d[0].regions[1].targetId = 'bell_sentence'; },
  ];
  for (const mutate of mutations) { const d = structuredClone(rawEvents); mutate(d); assert.throws(() => parseMindEvents(d, scenario)); }
  assert.throws(() => parseMindEvents([], scenario));
});
test('automatic branch priority/fallback and cycle validation', () => {
  const f = { elin: { bellRevelation: true, bellIllusion: true } };
  assert.equal(resolveNode(scenario, 'bell_result', f).id, 'reply_revelation');
  assert.equal(resolveNode(scenario, 'bell_result', {}).id, 'reply_coincidence');
  const d = structuredClone(rawScenario);
  d.nodes.find((n: any) => n.id === 'bell_result').fallbackNext = 'bell_result';
  assert.throws(() => parseScenario(d), /자동 분기 순환/);
});
test('editing one character does not mutate another character flags', () => {
  const d = structuredClone(rawScenario);
  d.characters.push({ ...d.characters[0], id: 'other', name: '다른 방문자' });
  const s = parseScenario(d), es = parseMindEvents(rawEvents, s);
  const store = createGameStore(s, es);
  const session = reachMind(store);
  const otherBefore = structuredClone(store.getState().characterFlags.other);
  store.getState().confirmEdit(session, { bell_meaning: 'revelation', fear_memory: 'delete' });
  assert.deepEqual(store.getState().characterFlags.other, otherBefore);
  assert.equal(store.getState().activeCharacterId, 'elin');
});
