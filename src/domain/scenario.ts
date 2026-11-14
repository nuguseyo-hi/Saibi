export interface Character {
  id: string;
  name: string;
  description: string;
  standing: string;
}
export interface Choice { id: string; text: string; next: string }
export interface DialogueNode {
  id: string;
  speaker: string;
  characterId?: string;
  text: string;
  next?: string;
  choices?: Choice[];
  ending?: string;
}
export interface Scenario {
  id: string;
  title: string;
  subtitle: string;
  chapter: string;
  location: string;
  background: string;
  startNodeId: string;
  characters: Character[];
  nodes: DialogueNode[];
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function fail(path: string): never { throw new Error(`시나리오 데이터 오류: ${path}`); }
function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function fields(value: Record<string, unknown>, names: string[], path: string) {
  for (const name of names) if (!nonempty(value[name])) fail(`${path}.${name}`);
}
export function parseScenario(input: unknown): Scenario {
  if (!record(input)) fail('root');
  fields(input, ['id', 'title', 'subtitle', 'chapter', 'location', 'background', 'startNodeId'], 'root');
  if (!Array.isArray(input.characters)) fail('characters');
  const characters = new Set<string>();
  for (const [i, c] of input.characters.entries()) {
    if (!record(c)) fail(`characters[${i}]`);
    fields(c, ['id', 'name', 'description', 'standing'], `characters[${i}]`);
    if (characters.has(String(c.id)) || ['narrator', 'player'].includes(String(c.id))) fail(`characters[${i}].id 중복/예약어`);
    characters.add(String(c.id));
  }
  if (!Array.isArray(input.nodes) || input.nodes.length === 0) fail('nodes');
  const ids = new Set<string>();
  const references: string[] = [String(input.startNodeId)];
  for (const [i, n] of input.nodes.entries()) {
    const path = `nodes[${i}]`;
    if (!record(n)) fail(path);
    fields(n, ['id', 'speaker', 'text'], path);
    if (ids.has(String(n.id))) fail(`${path}.id 중복`);
    ids.add(String(n.id));
    if (!characters.has(String(n.speaker)) && !['narrator', 'player'].includes(String(n.speaker))) fail(`${path}.speaker`);
    if (n.characterId !== undefined && !characters.has(String(n.characterId))) fail(`${path}.characterId`);
    const transitions = [n.next, n.choices, n.ending].filter(x => x !== undefined);
    if (transitions.length !== 1) fail(`${path}: next/choices/ending 중 하나만 필요`);
    if (n.next !== undefined) {
      if (!nonempty(n.next)) fail(`${path}.next`);
      references.push(n.next);
    }
    if (n.ending !== undefined && !nonempty(n.ending)) fail(`${path}.ending`);
    if (n.choices !== undefined) {
      if (!Array.isArray(n.choices) || n.choices.length < 1) fail(`${path}.choices`);
      const choices = new Set<string>();
      for (const [j, c] of n.choices.entries()) {
        if (!record(c)) fail(`${path}.choices[${j}]`);
        fields(c, ['id', 'text', 'next'], `${path}.choices[${j}]`);
        if (choices.has(String(c.id))) fail(`${path}.choices[${j}].id 중복`);
        choices.add(String(c.id));
        references.push(String(c.next));
      }
    }
  }
  for (const id of references) if (!ids.has(id)) fail(`존재하지 않는 노드 참조: ${id}`);
  return input as unknown as Scenario;
}

export function getNode(scenario: Scenario, id: string): DialogueNode {
  const node = scenario.nodes.find(n => n.id === id);
  if (!node) throw new Error(`노드를 찾을 수 없습니다: ${id}`);
  return node;
}
export function getNextNode(scenario: Scenario, nodeId: string, choiceId?: string): string | null {
  const node = getNode(scenario, nodeId);
  if (node.ending) return null;
  if (node.choices) return node.choices.find(c => c.id === choiceId)?.next ?? null;
  return choiceId === undefined ? node.next ?? null : null;
}
