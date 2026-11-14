import { fail, fields, nonempty, record, safeId } from './validation.ts';
import { matches, validateEffects, validateFlagReference } from './flags.ts';
import type { CharacterFlags, FlagCondition, FlagEffect, FlagRegistry } from './flags.ts';

export interface Character { id: string; name: string; description: string; standing: string; flagKeys?: string[] }
export interface Choice { id: string; text: string; next: string; effects?: FlagEffect[] }
export interface DialogueNode {
  type?: 'dialogue'; id: string; speaker: string; characterId?: string; text: string;
  presentation?: 'church' | 'confession'; next?: string; choices?: Choice[]; ending?: string; mindEventId?: string;
}
export interface BranchNode { type: 'branch'; id: string; branches: { condition: FlagCondition; next: string }[]; fallbackNext: string }
export type ScenarioNode = DialogueNode | BranchNode;
export interface Scenario {
  id: string; contentVersion?: string; title: string; subtitle: string; chapter: string; location: string;
  background: string; startNodeId: string; characters: Character[]; nodes: ScenarioNode[];
}
export function flagRegistry(scenario: Pick<Scenario, 'characters'>): FlagRegistry {
  return Object.fromEntries(scenario.characters.map(c => [c.id, c.flagKeys ?? []]));
}
export function parseScenario(input: unknown): Scenario {
  if (!record(input)) fail('root');
  fields(input, ['id', 'title', 'subtitle', 'chapter', 'location', 'background', 'startNodeId'], 'root');
  if (input.contentVersion !== undefined && !nonempty(input.contentVersion)) fail('contentVersion');
  if (!Array.isArray(input.characters) || input.characters.length === 0) fail('characters');
  const characters = new Set<string>();
  const registry: FlagRegistry = {};
  for (const [i, c] of input.characters.entries()) {
    if (!record(c)) fail(`characters[${i}]`);
    fields(c, ['id', 'name', 'description', 'standing'], `characters[${i}]`);
    if (!safeId(c.id) || characters.has(c.id) || ['narrator', 'player'].includes(c.id)) fail(`characters[${i}].id 중복/예약어`);
    if (c.flagKeys !== undefined && (!Array.isArray(c.flagKeys) || !c.flagKeys.every(safeId) || new Set(c.flagKeys).size !== c.flagKeys.length)) fail(`characters[${i}].flagKeys`);
    characters.add(c.id);
    registry[c.id] = (c.flagKeys ?? []) as string[];
  }
  if (!Array.isArray(input.nodes) || input.nodes.length === 0) fail('nodes');
  const ids = new Set<string>();
  const references: string[] = [String(input.startNodeId)];
  for (const [i, n] of input.nodes.entries()) {
    const path = `nodes[${i}]`;
    if (!record(n) || !safeId(n.id) || ids.has(n.id)) fail(`${path}.id 중복/누락`);
    ids.add(n.id);
    if (n.type === 'branch') {
      if (!Array.isArray(n.branches) || n.branches.length === 0 || !nonempty(n.fallbackNext)) fail(`${path}.branches/fallbackNext`);
      references.push(n.fallbackNext);
      for (const b of n.branches) {
        if (!record(b) || !nonempty(b.next)) fail(`${path}.branches.next`);
        validateFlagReference(b.condition, registry, `${path}.condition`);
        references.push(b.next);
      }
      continue;
    }
    if (n.type !== undefined && n.type !== 'dialogue') fail(`${path}.type`);
    fields(n, ['speaker', 'text'], path);
    if (!characters.has(String(n.speaker)) && !['narrator', 'player'].includes(String(n.speaker))) fail(`${path}.speaker`);
    if (n.characterId !== undefined && !characters.has(String(n.characterId))) fail(`${path}.characterId`);
    if (n.presentation !== undefined && !['church', 'confession'].includes(String(n.presentation))) fail(`${path}.presentation`);
    if ([n.next, n.choices, n.ending].filter(x => x !== undefined).length !== 1) fail(`${path}: next/choices/ending 중 하나만 필요`);
    if (n.next !== undefined) { if (!nonempty(n.next)) fail(`${path}.next`); references.push(n.next); }
    if (n.ending !== undefined && !nonempty(n.ending)) fail(`${path}.ending`);
    if (n.mindEventId !== undefined && (!safeId(n.mindEventId) || !n.next || !n.characterId)) fail(`${path}.mindEventId: next와 characterId 필요`);
    if (n.choices !== undefined) {
      if (!Array.isArray(n.choices) || n.choices.length < 1) fail(`${path}.choices`);
      const choices = new Set<string>();
      for (const [j, c] of n.choices.entries()) {
        if (!record(c)) fail(`${path}.choices[${j}]`);
        fields(c, ['id', 'text', 'next'], `${path}.choices[${j}]`);
        if (!safeId(c.id) || choices.has(c.id)) fail(`${path}.choices[${j}].id 중복`);
        if (c.effects !== undefined) validateEffects(c.effects, registry, `${path}.choices[${j}].effects`);
        choices.add(c.id); references.push(String(c.next));
      }
    }
  }
  for (const id of references) if (!ids.has(id)) fail(`존재하지 않는 노드 참조: ${id}`);
  const scenario = input as unknown as Scenario;
  // Reject cycles made entirely of automatic branch nodes (all possible edges).
  function walk(id: string, path: Set<string>) {
    const n = getNode(scenario, id);
    if (n.type !== 'branch') return;
    if (path.has(id)) fail(`자동 분기 순환: ${id}`);
    const visited = new Set(path).add(id);
    for (const next of [...n.branches.map(b => b.next), n.fallbackNext]) walk(next, visited);
  }
  for (const n of scenario.nodes) walk(n.id, new Set());
  return scenario;
}
export function getNode(scenario: Scenario, id: string): ScenarioNode {
  const node = scenario.nodes.find(n => n.id === id);
  if (!node) throw new Error(`노드를 찾을 수 없습니다: ${id}`);
  return node;
}
export function getDialogue(scenario: Scenario, id: string): DialogueNode {
  const n = getNode(scenario, id);
  if (n.type === 'branch') throw new Error(`표시할 수 없는 자동 분기 노드: ${id}`);
  return n;
}
export function resolveNode(scenario: Scenario, id: string, flags: CharacterFlags): DialogueNode {
  const seen = new Set<string>();
  let n = getNode(scenario, id);
  while (n.type === 'branch') {
    if (seen.has(n.id)) throw new Error('자동 분기 순환');
    seen.add(n.id);
    n = getNode(scenario, n.branches.find(b => matches(b.condition, flags))?.next ?? n.fallbackNext);
  }
  return n;
}
export function getNextNode(scenario: Scenario, nodeId: string, choiceId?: string): string | null {
  const node = getNode(scenario, nodeId);
  if (node.type === 'branch' || node.ending || node.mindEventId) return null;
  if (node.choices) return node.choices.find(c => c.id === choiceId)?.next ?? null;
  return choiceId === undefined ? node.next ?? null : null;
}
