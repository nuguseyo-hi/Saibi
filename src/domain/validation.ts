export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function fail(path: string): never { throw new Error(`시나리오 데이터 오류: ${path}`); }
export function nonempty(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
export function fields(value: Record<string, unknown>, names: string[], path: string) {
  for (const name of names) if (!nonempty(value[name])) fail(`${path}.${name}`);
}
export function safeId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(value) && !['constructor', 'prototype', '__proto__'].includes(value);
}
