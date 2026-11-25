import raw from '../content/prologue/sideScroll.json' with { type: 'json' };
import { dungeon, rules, STATE_VALUES } from './content.ts';
import type { StateKey } from './content.ts';
import type { EnvironmentState } from './environment.ts';
import type { Point, Rect } from '../dungeon/model.ts';
export interface SideGate extends Rect {key:StateKey;open:string;label:string}
export interface SideRoom {id:string;platforms:Rect[];bridge?:Rect;gates:SideGate[]}
export interface DirectSlot {objectId:string;ruleId:string;mode:'word'|'toggle';insert:string;remove:string;keywordId?:string;verb:string;restore:string}
function check(value:unknown,message:string):asserts value {if(!value)throw new Error(`횡스크롤 데이터 오류: ${message}`);}
const rect=(r:Rect)=>[r.x,r.y,r.w,r.h].every(Number.isFinite)&&r.w>0&&r.h>0;
check(Object.values(raw.physics).every(v=>Number.isFinite(v)&&v>0),'physics');
check(raw.rooms.length===dungeon.rooms.length&&new Set(raw.rooms.map(r=>r.id)).size===raw.rooms.length,'room IDs');
for(const room of raw.rooms){
 const source=dungeon.rooms.find(r=>r.id===room.id);check(source,'room');
 for(const p of [...room.platforms,...room.gates,...('bridge' in room&&room.bridge?[room.bridge]:[])])check(rect(p)&&p.x>=0&&p.x+p.w<=source.width&&p.y>=0&&p.y+p.h<=source.height,'geometry');
 for(const gate of room.gates)check(Object.hasOwn(STATE_VALUES,gate.key)&&STATE_VALUES[gate.key as StateKey].includes(gate.open),'gate state');
}
check(new Set(raw.slots.map(s=>s.objectId)).size===raw.slots.length,'slot IDs');
for(const slot of raw.slots){const rule=rules.find(r=>r.id===slot.ruleId);check(rule&&rule.objectId===slot.objectId&&['word','toggle'].includes(slot.mode),'slot');for(const id of [slot.insert,slot.remove])check(rule.options.some(o=>o.id===id),'slot option');if(slot.mode==='word')check('keywordId' in slot&&rule.options.find(o=>o.id===slot.insert)?.keywordId===slot.keywordId,'word ownership');}
check(raw.puppet.footY>0&&raw.puppet.footY<=raw.puppet.sourceHeight,'puppet baseline');
export const puppetArt=raw.puppet;
export const sideRooms=raw.rooms as SideRoom[],slots=raw.slots as DirectSlot[],physics=raw.physics,messages=raw.messages,identityText=raw.identity,scenery=raw.scenery;
export const sideRoom=(id:string)=>sideRooms.find(r=>r.id===id)!;
export function surfaces(id:string,e:EnvironmentState):Rect[]{const r=sideRoom(id);return [...r.platforms,...(r.bridge&&e.bridge==='open'?[r.bridge]:[])];}
export function closedGates(id:string,e:EnvironmentState){return sideRoom(id).gates.filter(g=>e[g.key]!==g.open);}
export function slotInserted(slot:DirectSlot,e:EnvironmentState){const rule=rules.find(r=>r.id===slot.ruleId)!;return e[rule.stateKey]===rule.options.find(o=>o.id===slot.insert)!.value;}
export function slotOption(slot:DirectSlot,e:EnvironmentState,word:string|null,remove:boolean){
 if(remove)return slot.remove;
 if(slot.mode==='toggle')return slotInserted(slot,e)?slot.remove:slot.insert;
 if(word!==slot.keywordId)throw new Error(messages.wrongWord);
 return slot.insert;
}
/** Respawn/checkpoint on a real surface, never inside a gate or over a missing bridge. */
export function safeSidePosition(point:Point,id:string,e:EnvironmentState):Point {
 const room=dungeon.rooms.find(r=>r.id===id)!;
 const fits=(p:Point)=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=80&&p.x<=room.width-80&&!closedGates(id,e).some(g=>p.x+physics.bodyWidth/2>g.x&&p.x-physics.bodyWidth/2<g.x+g.w&&p.y+physics.bodyHeight/2>g.y&&p.y-physics.bodyHeight/2<g.y+g.h);
 const candidates=surfaces(id,e).filter(r=>point.x>=r.x+physics.bodyWidth/2&&point.x<=r.x+r.w-physics.bodyWidth/2&&r.y>=point.y+physics.bodyHeight/2-12).sort((a,b)=>a.y-b.y);
 for(const ground of candidates){const p={x:point.x,y:ground.y-physics.bodyHeight/2};if(fits(p))return p;}
 return {x:room.start.x,y:physics.groundY-physics.bodyHeight/2};
}
