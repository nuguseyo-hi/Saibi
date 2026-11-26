import raw from '../content/prologue/corridor.json' with { type:'json' };
import type { Point } from '../dungeon/model.ts';
import { record } from '../domain/validation.ts';
export interface CorridorState {bridgeWord:'companion'|null;doorWord:'betrayal'|null}
export type CorridorSlot='bridge'|'door';
export const corridor=raw;
for(const slot of [raw.bridge,raw.door]){
 if(![slot.x,slot.y,slot.w,slot.h].every(Number.isFinite)||slot.w<=0||slot.h<=0||!slot.id)throw new Error('회랑 슬롯 오류');
}
for(const lines of [raw.intro,raw.hint,raw.doorHint,raw.sun,raw.exit])if(!lines.length||lines.some(s=>!s.trim()))throw new Error('회랑 대사 오류');
export const emptyCorridor=():CorridorState=>({bridgeWord:null,doorWord:null});
export function validCorridor(v:unknown):v is CorridorState{return record(v)&&Object.keys(v).length===2&&(v.bridgeWord===null||v.bridgeWord==='companion')&&(v.doorWord===null||v.doorWord==='betrayal');}
export function corridorSlotAt(p:Point):CorridorSlot|null {
 return (['bridge','door'] as const).find(id=>{const s=raw[id];return Math.abs(p.x-s.x)<s.w/2+50&&Math.abs(p.y-s.y)<s.h/2+45;})??null;
}
