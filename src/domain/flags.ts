import { fail, record, safeId } from './validation.ts';
export type CharacterFlags = Record<string, Record<string, boolean>>;
export interface FlagCondition { type: 'flag'; characterId: string; key: string; equals: boolean }
export interface FlagEffect { type: 'setFlag'; characterId: string; key: string; value: boolean }
export type FlagRegistry = Record<string, string[]>;
export function validateFlagReference(value: unknown, registry: FlagRegistry, path: string, effect = false): void {
  if (!record(value) || value.type !== (effect ? 'setFlag' : 'flag') || !safeId(value.characterId) || !safeId(value.key)
    || !registry[value.characterId]?.includes(value.key) || typeof value[effect ? 'value' : 'equals'] !== 'boolean') fail(path);
}
export function validateEffects(value: unknown, registry: FlagRegistry, path: string): void {
  if (!Array.isArray(value)) fail(path);
  const keys = new Set<string>();
  for (const [i, item] of value.entries()) {
    validateFlagReference(item, registry, `${path}[${i}]`, true);
    const e = item as FlagEffect;
    const key = `${e.characterId}:${e.key}`;
    if (keys.has(key)) fail(`${path}: 중복 플래그 효과`);
    keys.add(key);
  }
}
export function matches(condition: FlagCondition, flags: CharacterFlags) {
  return (flags[condition.characterId]?.[condition.key] ?? false) === condition.equals;
}
export function applyEffects(flags: CharacterFlags, effects: FlagEffect[]): CharacterFlags {
  const next = structuredClone(flags);
  for (const e of effects) next[e.characterId] = { ...next[e.characterId], [e.key]: e.value };
  return next;
}
