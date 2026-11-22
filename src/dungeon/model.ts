import { record, safeId, nonempty } from '../domain/validation.ts';
export interface Point { x: number; y: number }
export interface Rect extends Point { w: number; h: number }
export interface EnemyType { id: string; text: string; behavior: 'chase' | 'charge'; speed: number; detection: number; radius: number; damage: number; windupMs: number; chargeMs: number; cooldownMs: number }
export interface DungeonObject extends Point {
  id: string; kind: 'inspect' | 'fragment' | 'puzzle' | 'door' | 'core'; title: string; text: string;
  fragmentId?: string; puzzleId?: string; targetRoom?: string; spawn?: Point;
  requiresPuzzle?: string; requiresFragments?: number;
}
export interface RoomData { backgroundImage?: string; id: string; name: string; subtitle: string; objective: string; palette: string[]; width: number; height: number; start: Point; obstacles: Rect[]; objects: DungeonObject[]; enemies: { id: string; typeId: string; x: number; y: number; patrol: Point }[]; whispers: string[] }
export interface PuzzleOption { id: string; label: string; replacement: string; suffix: string; effect: 'closed' | 'delayed' | 'open'; delayMs: number }
export interface PuzzleData { id: string; title: string; prefix: string; regionId: string; original: string; suffix: string; hint: string; defaultOption: string; options: PuzzleOption[] }
export interface DungeonData {
  id: string; characterId: string; name: string; sourceNodeId: string; coreEventId: string; successNext: string;
  rules: { initialGuard: number; maxGuard: number; maxAttempts: number; guardPenalty: number; stability: number; immunityMs: number; playerSpeed: number; interactionRadius: number };
  fragments: { id: string; title: string; text: string }[]; enemyTypes: EnemyType[]; puzzles: PuzzleData[]; rooms: RoomData[];
  outcome: { resultId: string; title: string; text: string; appearance: 'revelation' | 'illusion' | 'unchanged' }[];
}
export interface DungeonProgress {
  id: string; roomId: string; position: Point; stability: number; fragments: string[]; inspected: string[];
  puzzles: Record<string, { optionId: string; opensAt: number | null; open: boolean }>;
  status: 'exploring' | 'editing' | 'completed' | 'failed'; lastHitAt: number; outcomeId: string | null;
}
export interface InfiltrationState { guard: number; night: number; attempts: number }
export function initialInfiltration(d: DungeonData): InfiltrationState { return { guard: d.rules.initialGuard, night: 1, attempts: 0 }; }
export function canEnter(d: DungeonData, state: InfiltrationState) { return state.guard <= d.rules.maxGuard && state.attempts < d.rules.maxAttempts; }
export function initialDungeon(d: DungeonData): DungeonProgress {
  return { id: d.id, roomId: d.rooms[0].id, position: { ...d.rooms[0].start }, stability: d.rules.stability, fragments: [], inspected: [], puzzles: {}, status: 'exploring', lastHitAt: 0, outcomeId: null };
}
export function objectAvailable(d: DungeonProgress, object: DungeonObject) {
  return (!object.requiresPuzzle || d.puzzles[object.requiresPuzzle]?.open === true) && d.fragments.length >= (object.requiresFragments ?? 0);
}
export function applyPuzzle(d: DungeonProgress, puzzle: PuzzleData, optionId: string, now: number): DungeonProgress {
  const option = puzzle.options.find(o => o.id === optionId);
  if (!option) throw new Error('잘못된 퍼즐 옵션');
  return { ...d, puzzles: { ...d.puzzles, [puzzle.id]: { optionId, open: option.effect === 'open', opensAt: option.effect === 'delayed' ? now + option.delayMs : null } } };
}
export function settleDoors(d: DungeonProgress, now: number): DungeonProgress {
  let next = d;
  for (const [id, p] of Object.entries(d.puzzles)) if (!p.open && p.opensAt !== null && now >= p.opensAt) {
    next = { ...next, puzzles: { ...next.puzzles, [id]: { ...p, open: true } } };
  }
  return next;
}
export function hitDungeon(d: DungeonProgress, amount: number, now: number, immunityMs: number): DungeonProgress {
  if (d.status !== 'exploring' || now - d.lastHitAt < immunityMs) return d;
  const stability = Math.max(0, d.stability - amount);
  return { ...d, stability, lastHitAt: now, status: stability === 0 ? 'failed' : 'exploring' };
}
export function direction(x: number, y: number, speed: number): Point {
  const length = Math.hypot(x, y);
  return length ? { x: x / length * speed, y: y / length * speed } : { x: 0, y: 0 };
}
export function validPosition(p: Point, room: RoomData, radius = 18): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 44 + radius && p.y >= 44 + radius && p.x <= room.width - 44 - radius && p.y <= room.height - 44 - radius
    && !room.obstacles.some(o => p.x + radius > o.x && p.x - radius < o.x + o.w && p.y + radius > o.y && p.y - radius < o.y + o.h);
}
export function safePosition(p: Point, room: RoomData): Point { return validPosition(p, room) ? p : { ...room.start }; }
export function validateDungeonProgress(input: unknown, data: DungeonData): input is DungeonProgress {
  if (!record(input) || input.id !== data.id || !['exploring', 'editing', 'completed', 'failed'].includes(String(input.status))) return false;
  const room = data.rooms.find(r => r.id === input.roomId);
  if (!room || !record(input.position) || !validPosition(input.position as unknown as Point, room)) return false;
  if (!Number.isInteger(input.stability) || Number(input.stability) < 0 || Number(input.stability) > data.rules.stability || !Number.isFinite(input.lastHitAt)) return false;
  if ((input.status === 'failed') !== (input.stability === 0)) return false;
  if (!Array.isArray(input.fragments) || new Set(input.fragments).size !== input.fragments.length || !input.fragments.every(id => data.fragments.some(f => f.id === id))) return false;
  if (!Array.isArray(input.inspected) || new Set(input.inspected).size !== input.inspected.length || !input.inspected.every(id => data.rooms.some(r => r.objects.some(o => o.id === id)))) return false;
  if (!record(input.puzzles)) return false;
  for (const [id, p] of Object.entries(input.puzzles)) {
    const definition = data.puzzles.find(x => x.id === id);
    if (!definition || !record(p) || typeof p.open !== 'boolean' || !(p.opensAt === null || Number.isFinite(p.opensAt))) return false;
    const option = definition.options.find(o => o.id === p.optionId);
    if (!option || (option.effect === 'closed' && (p.open || p.opensAt !== null)) || (option.effect === 'open' && (!p.open || p.opensAt !== null)) || (option.effect === 'delayed' && p.opensAt === null)) return false;
  }
  if (input.outcomeId !== null && !data.outcome.some(o => o.resultId === input.outcomeId)) return false;
  if (input.status === 'completed' && input.outcomeId === null) return false;
  if (['editing', 'completed'].includes(String(input.status)) && (input.fragments.length !== data.fragments.length || !room.objects.some(o => o.kind === 'core'))) return false;
  return true;
}
export function parseDungeon(raw: unknown): DungeonData {
  function fail(path: string): never { throw new Error(`던전 데이터 오류: ${path}`); }
  const positive = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0;
  const point = (v: unknown): v is Point => record(v) && typeof v.x === 'number' && Number.isFinite(v.x) && typeof v.y === 'number' && Number.isFinite(v.y);
  const list = (v: unknown, key: string) => { if (!Array.isArray(v) || !v.length) fail(key); return v as unknown[]; };
  if (!record(raw)) fail('root');
  for (const k of ['id','characterId','sourceNodeId','coreEventId','successNext']) if (!safeId(raw[k])) fail(k);
  if (!nonempty(raw.name) || !record(raw.rules)) fail('name/rules');
  for (const key of ['initialGuard','maxGuard','maxAttempts','guardPenalty','stability','immunityMs','playerSpeed','interactionRadius']) if (!positive(raw.rules[key])) fail(`rules.${key}`);
  if (!Number.isInteger(raw.rules.stability) || !Number.isInteger(raw.rules.maxAttempts)) fail('integer rules');
  const ids = new Set<string>();
  const id = (v: unknown) => { if (!safeId(v) || ids.has(v)) fail('중복/잘못된 ID'); ids.add(v as string); };
  for (const f of list(raw.fragments, 'fragments')) { if (!record(f) || !nonempty(f.title) || !nonempty(f.text)) fail('fragment'); id(f.id); }
  for (const e of list(raw.enemyTypes, 'enemyTypes')) {
    if (!record(e) || !nonempty(e.text) || !['chase','charge'].includes(String(e.behavior))) fail('enemy'); id(e.id);
    for (const k of ['speed','detection','radius','damage','windupMs','chargeMs','cooldownMs']) if (!positive(e[k])) fail(`enemy.${k}`);
  }
  for (const p of list(raw.puzzles, 'puzzles')) {
    if (!record(p)) fail('puzzle'); id(p.id); id(p.regionId);
    for (const k of ['title','original','hint','defaultOption']) if (!nonempty(p[k])) fail(`puzzle.${k}`);
    if (typeof p.prefix !== 'string' || typeof p.suffix !== 'string') fail('puzzle text');
    const optionIds = new Set<string>();
    for (const o of list(p.options, 'options')) {
      if (!record(o) || !safeId(o.id) || optionIds.has(o.id) || !nonempty(o.label) || !nonempty(o.replacement) || typeof o.suffix !== 'string' || !['closed','delayed','open'].includes(String(o.effect)) || typeof o.delayMs !== 'number' || !Number.isFinite(o.delayMs) || o.delayMs < 0) fail('option');
      optionIds.add(o.id);
    }
    if (!optionIds.has(String(p.defaultOption))) fail('default option');
  }
  for (const r of list(raw.rooms, 'rooms')) {
    if (!record(r) || !nonempty(r.name) || !nonempty(r.subtitle) || !nonempty(r.objective) || !positive(r.width) || !positive(r.height) || !point(r.start)) fail('room'); id(r.id);
    if (r.backgroundImage !== undefined && (typeof r.backgroundImage !== 'string' || !/^\/assets\/[a-zA-Z0-9_/-]+\.(png|webp|jpg)$/.test(r.backgroundImage))) fail('background image');
    if (!Array.isArray(r.palette) || r.palette.length < 3 || !r.palette.every(c => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c))) fail('palette');
    if (!Array.isArray(r.whispers) || !r.whispers.every(nonempty) || !Array.isArray(r.obstacles) || !Array.isArray(r.enemies)) fail('room arrays');
    for (const o of r.obstacles) if (!point(o) || !record(o) || !positive(o.w) || !positive(o.h)) fail('obstacle');
    for (const o of list(r.objects,'objects')) {
      if (!record(o) || !point(o) || !['inspect','fragment','puzzle','door','core'].includes(String(o.kind)) || !nonempty(o.title) || !nonempty(o.text)) fail('object'); id(o.id);
      if (o.kind === 'door' && (!safeId(o.targetRoom) || !point(o.spawn))) fail('door');
      if (o.kind === 'fragment' && !safeId(o.fragmentId)) fail('fragment reference');
      if (o.kind === 'puzzle' && !safeId(o.puzzleId)) fail('puzzle reference');
      if (o.requiresPuzzle !== undefined && !safeId(o.requiresPuzzle)) fail('required puzzle');
      if (o.requiresFragments !== undefined && (!Number.isInteger(o.requiresFragments) || Number(o.requiresFragments) < 0 || Number(o.requiresFragments) > (raw.fragments as unknown[]).length)) fail('required fragments');
    }
    for (const e of r.enemies) { if (!record(e) || !point(e) || !point(e.patrol) || !safeId(e.typeId)) fail('enemy spawn'); id(e.id); }
  }
  for (const o of list(raw.outcome,'outcome')) if (!record(o) || !safeId(o.resultId) || !nonempty(o.title) || !nonempty(o.text) || !['revelation','illusion','unchanged'].includes(String(o.appearance))) fail('outcome');
  const d = raw as unknown as DungeonData;
  for (const r of d.rooms) {
    if (!validPosition(r.start,r)) fail(`room start ${r.id}`);
    for (const o of r.objects) {
      if (!validPosition(o,r,0)) fail(`object position ${o.id}`);
      if (o.targetRoom) { const target = d.rooms.find(x=>x.id===o.targetRoom); if (!target || !o.spawn || !validPosition(o.spawn,target)) fail('door target'); }
      if (o.fragmentId && !d.fragments.some(f=>f.id===o.fragmentId)) fail('fragment ref');
      if (o.puzzleId && !d.puzzles.some(p=>p.id===o.puzzleId)) fail('puzzle ref');
      if (o.requiresPuzzle && !d.puzzles.some(p=>p.id===o.requiresPuzzle)) fail('gate ref');
    }
    for (const e of r.enemies) if (!d.enemyTypes.some(t=>t.id===e.typeId) || !validPosition(e,r) || !validPosition(e.patrol,r)) fail('enemy placement');
  }
  return d;
}
