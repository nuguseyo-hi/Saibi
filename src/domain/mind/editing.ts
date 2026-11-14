import { fail, fields, record, safeId } from '../validation.ts';
import { validateEffects } from '../flags.ts';
import type { FlagEffect } from '../flags.ts';
import { flagRegistry } from '../scenario.ts';
import type { Scenario } from '../scenario.ts';

export interface ThoughtSegment { id: string; text: string }
export interface ThoughtSentence { id: string; segments: ThoughtSegment[] }
export interface EditOption { id: string; label: string; text: string; resultId: string; effects: FlagEffect[] }
export interface EditRegion {
  id: string; type: 'replace' | 'delete'; targetId: string; originalText: string;
  defaultOptionId: string; options: EditOption[];
}
export interface MindEvent {
  id: string; characterId: string; title: string; description: string; originalText: string;
  sentences: ThoughtSentence[]; regions: EditRegion[];
}
export type EditDraft = Record<string, string>;
export interface EditResult {
  eventId: string; characterId: string; sessionId: string; selections: EditDraft; resultIds: string[];
  sentences: { id: string; text: string }[]; beforeText: string; afterText: string;
}
export function originalSentence(sentence: ThoughtSentence) { return sentence.segments.map(s => s.text).join(''); }
export function createDraft(event: MindEvent): EditDraft {
  return Object.fromEntries(event.regions.map(r => [r.id, r.defaultOptionId]));
}
export function optionFor(region: EditRegion, draft: EditDraft): EditOption {
  const option = region.options.find(o => o.id === draft[region.id]);
  if (!option) throw new Error(`허용하지 않은 편집 옵션: ${region.id}`);
  return option;
}
export function validateDraft(event: MindEvent, draft: unknown): asserts draft is EditDraft {
  if (!record(draft) || Object.keys(draft).length !== event.regions.length) throw new Error('편집 구간이 올바르지 않습니다.');
  for (const r of event.regions) if (!r.options.some(o => o.id === draft[r.id])) throw new Error(`허용하지 않은 편집 옵션: ${r.id}`);
}
export function editedSentence(event: MindEvent, sentence: ThoughtSentence, draft: EditDraft): string | null {
  const deletion = event.regions.find(r => r.type === 'delete' && r.targetId === sentence.id);
  if (deletion && optionFor(deletion, draft).text === '') return null;
  return sentence.segments.map(s => {
    const r = event.regions.find(r => r.type === 'replace' && r.targetId === s.id);
    return r ? optionFor(r, draft).text : s.text;
  }).join('');
}
export function commitDraft(event: MindEvent, draft: unknown, sessionId: string): { result: EditResult; effects: FlagEffect[] } {
  validateDraft(event, draft);
  const sentences = event.sentences.flatMap(s => {
    const text = editedSentence(event, s, draft);
    return text === null ? [] : [{ id: s.id, text }];
  });
  const options = event.regions.map(r => optionFor(r, draft));
  return {
    result: { eventId: event.id, characterId: event.characterId, sessionId, selections: { ...draft },
      resultIds: options.map(o => o.resultId), sentences, beforeText: event.originalText, afterText: sentences.map(s => s.text).join('\n') },
    effects: options.flatMap(o => o.effects),
  };
}
export function parseMindEvents(input: unknown, scenario: Scenario): MindEvent[] {
  if (!Array.isArray(input)) fail('mindEvents');
  const registry = flagRegistry(scenario);
  const eventIds = new Set<string>();
  for (const [i, event] of input.entries()) {
    const path = `mindEvents[${i}]`;
    if (!record(event)) fail(path);
    fields(event, ['id', 'characterId', 'title', 'description', 'originalText'], path);
    if (!safeId(event.id) || eventIds.has(event.id)) fail(`${path}.id`);
    eventIds.add(event.id);
    if (!safeId(event.characterId) || !Object.hasOwn(registry, event.characterId)) fail(`${path}.characterId`);
    if (!Array.isArray(event.sentences) || event.sentences.length === 0) fail(`${path}.sentences`);
    const targets = new Map<string, { kind: 'sentence' | 'segment'; text: string; sentenceId: string }>();
    for (const sentence of event.sentences) {
      if (!record(sentence) || !safeId(sentence.id) || targets.has(sentence.id) || !Array.isArray(sentence.segments) || sentence.segments.length === 0) fail(`${path}.sentence`);
      targets.set(sentence.id, { kind: 'sentence', text: '', sentenceId: sentence.id });
      for (const segment of sentence.segments) {
        if (!record(segment) || !safeId(segment.id) || targets.has(segment.id) || typeof segment.text !== 'string') fail(`${path}.segment`);
        targets.set(segment.id, { kind: 'segment', text: segment.text, sentenceId: sentence.id });
      }
      targets.get(sentence.id)!.text = (sentence.segments as ThoughtSegment[]).map(s => s.text).join('');
    }
    if (!Array.isArray(event.regions) || event.regions.length === 0) fail(`${path}.regions`);
    const regionIds = new Set<string>(), resultIds = new Set<string>(), usedTargets = new Set<string>();
    const effectOwners = new Map<string, string>();
    for (const r of event.regions) {
      if (!record(r)) fail(`${path}.region`);
      fields(r, ['id', 'targetId', 'originalText', 'defaultOptionId'], `${path}.region`);
      if (!safeId(r.id) || regionIds.has(r.id) || !['replace', 'delete'].includes(String(r.type))) fail(`${path}.region.id/type`);
      regionIds.add(r.id);
      const target = targets.get(String(r.targetId));
      if (!target || target.kind !== (r.type === 'delete' ? 'sentence' : 'segment') || usedTargets.has(String(r.targetId)) || target.text !== r.originalText) fail(`${path}.region.targetId/originalText`);
      usedTargets.add(String(r.targetId));
      if (!Array.isArray(r.options) || r.options.length < 2) fail(`${path}.options`);
      const optionIds = new Set<string>();
      let expectedKeys: string[] | undefined;
      for (const o of r.options) {
        if (!record(o)) fail(`${path}.option`);
        fields(o, ['id', 'label', 'resultId'], `${path}.option`);
        if (!safeId(o.id) || optionIds.has(o.id) || !safeId(o.resultId) || resultIds.has(o.resultId) || typeof o.text !== 'string') fail(`${path}.option.id/text`);
        if (r.type === 'delete' && o.text !== '' && o.text !== r.originalText) fail(`${path}: 삭제 옵션은 원문 또는 빈 문자열`);
        if (r.type === 'replace' && o.text.length === 0) fail(`${path}: 치환 옵션은 빈 문자열 불가`);
        optionIds.add(o.id); resultIds.add(o.resultId);
        validateEffects(o.effects, registry, `${path}.${r.id}.${o.id}.effects`);
        const effects = o.effects as FlagEffect[];
        const keys = effects.map(e => `${e.characterId}:${e.key}`).sort();
        if (expectedKeys && JSON.stringify(keys) !== JSON.stringify(expectedKeys)) fail(`${path}: 각 옵션은 같은 플래그 집합을 명시해야 합니다`);
        expectedKeys = keys;
        for (const e of effects) {
          if (e.characterId !== event.characterId) fail(`${path}: 다른 캐릭터의 편집 효과`);
          const key = `${e.characterId}:${e.key}`;
          if (effectOwners.has(key) && effectOwners.get(key) !== r.id) fail(`${path}: 편집 구간 간 플래그 충돌`);
          effectOwners.set(key, r.id);
        }
      }
      const options = r.options as EditOption[];
      if (options.find(o => o.id === r.defaultOptionId)?.text !== r.originalText) fail(`${path}.defaultOptionId`);
      if (r.type === 'delete' && !options.some(o => o.text === '')) fail(`${path}: 삭제 결과 필요`);
    }
    const typed = event as unknown as MindEvent;
    if (typed.sentences.map(originalSentence).join('\n') !== typed.originalText) fail(`${path}.originalText 불일치`);
    // Overlapping sentence deletion and word replacement are intentionally unsupported.
    for (const r of typed.regions.filter(r => r.type === 'replace')) {
      if (typed.regions.some(d => d.type === 'delete' && d.targetId === targets.get(r.targetId)?.sentenceId)) fail(`${path}: 겹치는 편집 구간`);
    }
  }
  const events = input as MindEvent[];
  for (const n of scenario.nodes) {
    if (n.type !== 'branch' && n.mindEventId && !events.some(e => e.id === n.mindEventId && e.characterId === n.characterId)) fail(`노드 ${n.id}.mindEventId`);
  }
  return events;
}
