import raw from '../content/prologue/chapel.json' with {type:'json'};
import {record} from '../domain/validation.ts';
export interface ChapelState {collected:boolean;inserted:boolean}
export const emptyChapel=():ChapelState=>({collected:false,inserted:false});
export function validChapel(v:unknown):v is ChapelState{return record(v)&&Object.keys(v).length===2&&typeof v.collected==='boolean'&&typeof v.inserted==='boolean'&&(!v.inserted||v.collected);}
if(![raw.memory.prefix,raw.memory.word,raw.memory.suffix,...Object.values(raw.ui)].every(v=>typeof v==='string'&&v.trim().length>0)||![raw.memory.x,raw.memory.y].every(Number.isFinite))throw new Error('예배당 기억 데이터 오류');
for(const r of raw.stairs)if(![r.x,r.y,r.w,r.h].every(Number.isFinite)||r.w<=0||r.h<=0)throw new Error('예배당 계단 데이터 오류');
export const chapel=raw;
