import { STATE_VALUES } from './content.ts';
import type { StateKey, TextObject, SentenceRule } from './content.ts';
export type EnvironmentState=Record<StateKey,string>;
export const initialEnvironment=():EnvironmentState=>Object.fromEntries(Object.entries(STATE_VALUES).map(([key,values])=>[key,values[0]])) as EnvironmentState;
export function textPhysics(t:TextObject,state:EnvironmentState) {
 const value=t.stateKey?state[t.stateKey]:undefined;
 let format=t.format,visible=true,solid=format==='bold';
 if(t.stateKey==='wall'){format=value==='crossed'?'strike':'bold';solid=value!=='crossed';}
 if(t.stateKey==='bridge'){format='underline';solid=value!=='open';}
 if(t.stateKey==='negation'){format=value==='detached'?'strike':'bold';solid=value!=='detached';}
 if(t.stateKey==='door'){solid=value!=='open';format=solid?'bold':'strike';}
 if(t.stateKey==='seal'){solid=value!=='broken';format=value==='broken'?'strike':'bold';}
 if(t.stateKey==='identity'){visible=value==='resisting';solid=visible&&t.format==='bold';}
 return {format,visible,solid,unfolded:t.stateKey==='bridge'&&value==='open'};
}
export function applyRule(state:EnvironmentState,rule:SentenceRule,optionId:string,owned:string[]):EnvironmentState {
 const option=rule.options.find(o=>o.id===optionId);
 if(!option||option.keywordId&&!owned.includes(option.keywordId))throw new Error('이 편집에 필요한 키워드를 먼저 수집하세요.');
 return {...state,[rule.stateKey]:option.value};
}
export function exitAvailable(id:string,s:EnvironmentState){
 if(id==='to_chapel')return s.bridge==='open'&&s.memory==='seen';
 if(id==='to_altar')return s.seal==='broken';
 return true;
}
