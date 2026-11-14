import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { parseScenario, getNextNode } from '../src/domain/scenario.ts';
import { createGameStore } from '../src/store/gameStore.ts';

const data = JSON.parse(readFileSync(new URL('./fixtures/legacy-intro.json', import.meta.url), 'utf8'));
const scenario = parseScenario(data);

test('JSON content and local placeholder paths are valid', () => {
  assert.ok(existsSync(`public${scenario.background}`));
  for (const c of scenario.characters) assert.ok(existsSync(`public${c.standing}`));
});
test('invalid references, duplicate IDs, unknown speakers and mixed transitions are rejected', () => {
  for (const mutate of [
    (d: typeof data) => { d.nodes[0].next = 'missing'; },
    (d: typeof data) => { d.nodes[1].id = d.nodes[0].id; },
    (d: typeof data) => { d.nodes[0].speaker = 'missing'; },
    (d: typeof data) => { d.nodes[0].choices = []; },
    (d: typeof data) => { d.nodes[3].choices[1].id = d.nodes[3].choices[0].id; },
  ]) {
    const copy = structuredClone(data);
    mutate(copy);
    assert.throws(() => parseScenario(copy), /시나리오 데이터 오류/);
  }
});
test('choice nodes cannot be advanced without a valid choice', () => {
  assert.equal(getNextNode(scenario, 'question'), null);
  assert.equal(getNextNode(scenario, 'question', 'invented'), null);
  assert.equal(getNextNode(scenario, 'arrival', 'comfort'), null);
});
for (const branch of ['comfort', 'curiosity']) {
  test(`${branch}: title → dialogue → choice → distinct ending`, () => {
    const store = createGameStore(scenario);
    assert.equal(store.getState().screen, 'title');
    store.getState().advance('arrival');
    assert.equal(store.getState().nodeId, 'arrival');
    store.getState().start();
    for (const id of ['arrival', 'greeting', 'welcome']) store.getState().advance(id);
    assert.equal(store.getState().nodeId, 'question');
    store.getState().advance('question');
    store.getState().choose('question', 'invalid');
    assert.equal(store.getState().nodeId, 'question');
    store.getState().choose('question', branch);
    assert.equal(store.getState().nodeId, `${branch}_reply`);
    store.getState().choose('question', branch);
    assert.equal(store.getState().log.filter(e => e.kind === 'choice').length, 1);
    store.getState().advance(`${branch}_reply`);
    assert.equal(store.getState().nodeId, `${branch}_end`);
    store.getState().advance(`${branch}_end`);
    assert.equal(store.getState().nodeId, `${branch}_end`);
    assert.equal(store.getState().log.length, 7);
    store.getState().returnToTitle();
    store.getState().start();
    assert.equal(store.getState().nodeId, 'arrival');
    assert.equal(store.getState().log.length, 1);
  });
}
test('stale input does not skip a node and independent runs do not leak state', () => {
  const a = createGameStore(scenario);
  const b = createGameStore(scenario);
  a.getState().start();
  a.getState().advance('arrival');
  a.getState().advance('arrival');
  assert.equal(a.getState().nodeId, 'greeting');
  assert.equal(a.getState().log.length, 2);
  assert.equal(b.getState().screen, 'title');
  assert.deepEqual(scenario, data);
});
