import storyRaw from '../content/prologue/story.json' with { type: 'json' };
import worldRaw from '../content/prologue/world.json' with { type: 'json' };
import { parseScenario } from '../domain/scenario.ts';
import { parseMindEvents } from '../domain/mind/editing.ts';
import { parseDungeon } from '../dungeon/model.ts';
import { record, safeId } from '../domain/validation.ts';
export type SceneName='theatre'|'ruins'|'village';
export type Mode='dialogue'|'rewrite'|'questions'|'infiltrate'|'name'|'transfer'|'village';
export interface NodeMeta { scene:SceneName; mode:Mode; before?:string; guardVisible?:boolean; event?:'guard_max'|'guard_zero'|'transfer'; questionId?:string; segments?:{id:string;text:string;keywordId?:string}[] }
export type StateKey='wall'|'bridge'|'punctuation'|'negation'|'door'|'seal'|'order'|'identity'|'memory';
export const STATE_VALUES:Record<StateKey,readonly string[]>={wall:['solid','crossed'],bridge:['folded','open'],punctuation:['exclaim','question'],negation:['attached','detached'],door:['closed','waiting','open'],seal:['locked','broken'],order:['original','swapped'],identity:['sealed','resisting','unsealed','placed','rewritten'],memory:['unseen','seen']};
export interface RuleOption {id:string;label:string;text:string;value:string;resultId:string;keywordId?:string;delayMs?:number}
export interface SentenceRule { id:string;objectId:string;title:string;kind:string;stateKey:StateKey;options:RuleOption[] }
export interface TextObject {id:string;roomId:string;text:string;x:number;y:number;w:number;h:number;format:'bold'|'strike'|'underline'|'bracket'|'plain';stateKey?:StateKey}
export const scenario=parseScenario(storyRaw.scenario);
export const identityEvent=parseMindEvents([storyRaw.identity],scenario)[0];
export const dungeon=parseDungeon(worldRaw.dungeon);
export const keywords=storyRaw.keywords, questions=storyRaw.questions, village=storyRaw.village;
function check(condition:unknown,where:string):asserts condition {if(!condition)throw new Error(`프롤로그 데이터 오류: ${where}`);}
const nodeIds=new Set(scenario.nodes.map(n=>n.id)),keywordIds=new Set(keywords.map(k=>k.id));
check(keywordIds.size===keywords.length,'keyword IDs');
for(const q of questions)check(safeId(q.id)&&nodeIds.has(q.nodeId),'question');
for(const [id,m] of Object.entries(storyRaw.meta)) {
 check(nodeIds.has(id)&&record(m)&&['theatre','ruins','village'].includes(m.scene)&&['dialogue','rewrite','questions','infiltrate','name','transfer','village'].includes(m.mode),'node meta');
 const raw:Record<string,unknown>=m;
 if(raw.event!==undefined)check(['guard_max','guard_zero','transfer'].includes(String(raw.event)),'event');
 if(raw.questionId!==undefined)check(questions.some(q=>q.id===raw.questionId),'question ref');
 if(raw.segments!==undefined){check(Array.isArray(raw.segments),'segments');const seen=new Set<string>();for(const s of raw.segments){check(record(s)&&safeId(s.id)&&!seen.has(s.id)&&typeof s.text==='string','segment');seen.add(s.id);if(s.keywordId!==undefined)check(keywordIds.has(String(s.keywordId)),'keyword ref');}}
}
check(Object.keys(storyRaw.meta).length===scenario.nodes.length,'missing node meta');
export const meta=storyRaw.meta as Record<string,NodeMeta>;
const objectIds=new Set(dungeon.rooms.flatMap(r=>r.objects.map(o=>o.id))),resultIds=new Set<string>(),ruleIds=new Set<string>();
for(const r of worldRaw.sentenceRules){
 check(safeId(r.id)&&!ruleIds.has(r.id)&&objectIds.has(r.objectId)&&Object.hasOwn(STATE_VALUES,r.stateKey),'rule');ruleIds.add(r.id);
 const options=new Set<string>();
 for(const o of r.options){check(safeId(o.id)&&!options.has(o.id)&&safeId(o.resultId)&&!resultIds.has(o.resultId)&&STATE_VALUES[r.stateKey as StateKey].includes(o.value),'rule option');options.add(o.id);resultIds.add(o.resultId);const v:Record<string,unknown>=o;if(v.keywordId!==undefined)check(keywordIds.has(String(v.keywordId)),'option keyword');if(v.delayMs!==undefined)check(typeof v.delayMs==='number'&&Number.isFinite(v.delayMs)&&v.delayMs>0,'delay');}
}
const textIds=new Set<string>();
for(const t of worldRaw.texts){check(safeId(t.id)&&!textIds.has(t.id)&&dungeon.rooms.some(r=>r.id===t.roomId)&&['bold','strike','underline','bracket','plain'].includes(t.format),'text object');textIds.add(t.id);check([t.x,t.y,t.w,t.h].every(Number.isFinite)&&t.w>0&&t.h>0,'text rect');const raw:Record<string,unknown>=t;if(raw.stateKey!==undefined)check(Object.hasOwn(STATE_VALUES,String(raw.stateKey)),'text state');}
export const rules=worldRaw.sentenceRules as SentenceRule[],texts=worldRaw.texts as TextObject[];
export const narration=worldRaw.narration,reverseMemory=worldRaw.reverseMemory,resistanceTexts=worldRaw.resistanceTexts;
