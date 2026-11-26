import raw from '../content/prologue/strikes.json' with { type: 'json' };
import type { CorridorState } from './corridor.ts';
import type { Point } from '../dungeon/model.ts';
import type { EnvironmentState } from './environment.ts';
import { record } from '../domain/validation.ts';

export interface InkStroke { a:Point; b:Point }
export type InkRoom='betrayal'|'chapel'|'altar';
export type InkState=Record<InkRoom,InkStroke|null>;
export interface InkWord {id:string;text:string;x:number;y:number;w:number;h:number;entity:string|null;action:string|null}
export interface StrikeRoom {id:string;anchor:Point;reach:number;bounds:{x:number;y:number;w:number;h:number};park:InkStroke;title:string;words:InkWord[];connectors:{text:string;x:number;y:number}[];reactions:{default:string;[key:string]:string|undefined}}
const ids:InkRoom[]=['betrayal','chapel','altar'];
const point=(p:unknown):p is Point=>record(p)&&Object.keys(p).length===2&&typeof p.x==='number'&&typeof p.y==='number'&&Number.isFinite(p.x)&&Number.isFinite(p.y);
function check(value:unknown,message:string):asserts value {if(!value)throw new Error(`취소선 데이터 오류: ${message}`);}
check(raw.rooms.length===3&&new Set(raw.rooms.map(r=>r.id)).size===3,'rooms');
check(raw.halfWidth>0&&raw.minLength>0&&raw.maxLength>raw.minLength,'ink geometry');
for(const room of raw.rooms){
 check(ids.includes(room.id as InkRoom)&&point(room.anchor)&&room.reach>0,'room');
 check(Object.values(room.bounds).every(Number.isFinite)&&room.bounds.w>0&&room.bounds.h>0,'bounds');
 check(new Set(room.words.map(w=>w.id)).size===room.words.length&&room.words.length>0,'word IDs');
 for(const w of room.words){check(typeof w.text==='string'&&w.text.length>0&&[w.x,w.y,w.w,w.h].every(Number.isFinite)&&w.w>0&&w.h>0,'word');check(w.entity===null||['companion','self','memory','bridge','light','door','sun','doubt'].includes(w.entity),'entity');check(w.action===null||['blocks','supports','locks','serves','binds'].includes(w.action),'action');}
 check(Object.values(room.reactions).every(v=>typeof v==='string'),'reactions');
 for(const c of room.connectors)check(typeof c.text==='string'&&Number.isFinite(c.x)&&Number.isFinite(c.y),'connector');
}
export const strikeRooms:StrikeRoom[]=raw.rooms;
export const inkUI=raw.ui,inkWidth=raw.halfWidth;
export const strikeRoom=(id:string)=>strikeRooms.find(r=>r.id===id)!;
export const emptyInk=():InkState=>({betrayal:null,chapel:null,altar:null});
export function validStroke(value:unknown,id:string):value is InkStroke {
 if(!record(value)||Object.keys(value).length!==2||!point(value.a)||!point(value.b))return false;
 const room=strikeRoom(id);if(!room)return false;
 const {bounds:b}=room,len=Math.hypot(value.b.x-value.a.x,value.b.y-value.a.y);
 return len>=raw.minLength&&len<=raw.maxLength&&[value.a,value.b].every(p=>p.x>=b.x&&p.x<=b.x+b.w&&p.y>=b.y&&p.y<=b.y+b.h);
}
for(const room of strikeRooms)check(validStroke(room.park,room.id),'park');
export function validInk(value:unknown):value is InkState {return record(value)&&Object.keys(value).length===3&&ids.every(id=>value[id]===null||validStroke(value[id],id));}
export function distanceToInk(p:Point,s:InkStroke):number {
 const dx=s.b.x-s.a.x,dy=s.b.y-s.a.y,length=dx*dx+dy*dy;
 const t=length?Math.max(0,Math.min(1,((p.x-s.a.x)*dx+(p.y-s.a.y)*dy)/length)):0;
 return Math.hypot(p.x-s.a.x-t*dx,p.y-s.a.y-t*dy);
}
export function wordCoverage(word:InkWord,stroke:InkStroke|null):'none'|'partial'|'full' {
 if(!stroke)return 'none';
 const samples=[word.x+5,word.x+word.w/2,word.x+word.w-5].map(x=>distanceToInk({x,y:word.y},stroke)<=inkWidth);
 return samples.every(Boolean)?'full':samples.some(Boolean)?'partial':'none';
}
export function strokeAcross(room:string,wordId:string):InkStroke {
 const word=strikeRoom(room).words.find(w=>w.id===wordId)!;
 return {a:{x:word.x-6,y:word.y},b:{x:word.x+word.w+6,y:word.y}};
}
export interface Realm {
 canceled:string[];lightOn:boolean;bridgePresent:boolean;bridgeSolid:boolean;doorPresent:boolean;doorLocked:boolean;wallSolid:boolean;
 selfPresent:boolean;companionPresent:boolean;faithIntact:boolean;bound:boolean;reaction:string;mood:'held'|'doubt'|'faded'|'released'|'rewritten';
}
export function readRealm(id:string,ink:InkStroke|null,identity='sealed'):Realm {
 const room=strikeRoom(id),canceled=room.words.filter(w=>wordCoverage(w,ink)==='full').map(w=>w.id);
 const exists=(entity:string)=>!room.words.some(w=>w.entity===entity&&canceled.includes(w.id));
 const works=(action:string)=>!room.words.some(w=>w.action===action&&canceled.includes(w.id));
 const lightOn=id!=='chapel'||exists('light'),bridgePresent=exists('bridge')&&(id!=='betrayal'||exists('memory'));
 const bridgeSolid=bridgePresent&&works('supports')&&lightOn;
 const selfPresent=exists('self'),companionPresent=exists('companion'),faithIntact=exists('sun')&&works('serves');
 const wallSolid=selfPresent&&companionPresent&&works('blocks'),doorPresent=exists('door'),doorLocked=doorPresent&&lightOn&&works('locks');
 const bound=selfPresent&&exists('doubt')&&works('binds');
 let key='default',mood:Realm['mood']='held';
 if(!selfPresent){key='self';mood='faded';}
 else if(id==='betrayal'){
  if(!bridgePresent)key='bridge';else if(!bridgeSolid)key='supports';else if(!companionPresent)key='companion';else if(!wallSolid)key='released';
 }else if(id==='chapel'){
  if(!lightOn)key='dark';else if(!bridgePresent)key='bridge';else if(!bridgeSolid)key='supports';else if(!doorPresent)key='door';else if(!doorLocked)key='released';
 }else{
  if(!faithIntact){key=['placed','rewritten'].includes(identity)?'rewritten':'faith';mood=key==='rewritten'?'rewritten':'doubt';}
  else if(!exists('doubt'))key='doubt';else if(!bound)key='freed';
 }
 if(mood==='held'&&key!=='default')mood=key==='released'||key==='freed'?'released':'doubt';
 return {canceled,lightOn,bridgePresent,bridgeSolid,doorPresent,doorLocked,wallSolid,selfPresent,companionPresent,faithIntact,bound,reaction:room.reactions[key]??room.reactions.default,mood};
}
export function projectInk(ink:InkState,base:EnvironmentState,corridor?:CorridorState):EnvironmentState {
 const first=readRealm('betrayal',ink.betrayal),chapel=readRealm('chapel',ink.chapel);
 return {...base,wall:corridor?'crossed':first.wallSolid?'solid':'crossed',punctuation:'question',bridge:(corridor?!!corridor.bridgeWord:first.bridgeSolid)?'open':'folded',negation:'detached',door:chapel.doorLocked?'closed':'open'};
}
export function roomEnvironment(id:string,ink:InkState,base:EnvironmentState,corridor?:CorridorState):EnvironmentState {
 const env=projectInk(ink,base,corridor);
 return id==='chapel'?{...env,bridge:readRealm(id,ink.chapel).bridgeSolid?'open':'folded'}:env;
}
export function canReachInk(id:string,p:Point):boolean {const room=strikeRoom(id);return !!room&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.hypot(p.x-room.anchor.x,p.y-room.anchor.y)<=room.reach;}
/** Translate known previous puzzle outcomes into visible, editable strokes. */
export function migrateInk(environment:EnvironmentState,room:string):InkState {
 const ink=emptyInk();
 if(environment.wall==='crossed'||environment.memory==='seen'||room!=='betrayal')ink.betrayal=strokeAcross('betrayal','blocks');
 if(environment.door==='open'||environment.seal==='broken'||room==='altar')ink.chapel=strokeAcross('chapel','locks');
 if(['resisting','placed','rewritten'].includes(environment.identity))ink.altar=strokeAcross('altar','sun');
 return ink;
}
