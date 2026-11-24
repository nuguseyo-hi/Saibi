import { createStore } from 'zustand/vanilla';
import { getDialogue, getNextNode } from '../domain/scenario.ts';
import { commitDraft } from '../domain/mind/editing.ts';
import type { EditDraft, EditResult } from '../domain/mind/editing.ts';
import { initialDungeon, validPosition, safePosition } from '../dungeon/model.ts';
import type { DungeonProgress, Point } from '../dungeon/model.ts';
import type { StorageLike } from '../services/storage.ts';
import { record } from '../domain/validation.ts';
import { scenario, meta, dungeon, keywords, questions, rules, texts, identityEvent, STATE_VALUES, narration } from './content.ts';
import { applyRule, initialEnvironment, textPhysics, exitAvailable } from './environment.ts';
import type { EnvironmentState } from './environment.ts';
export const PROLOGUE_SAVE_KEY='saibi.prologue.v1';
export interface PrologueState {
 phase:'story'|'dungeon'|'core'|'village'|'church';nodeId:string;guard:number;questions:string[];keywords:string[];
 environment:EnvironmentState;dungeon:DungeonProgress;events:string[];editResult:EditResult|null;resistance:number;
 name:string;playableId:'vessel'|'inquisitor';completed:boolean;rejectedNode:string|null;doorOpensAt:number|null;
 cue:{id:keyof typeof narration;index:number}|null;sealFlipped:boolean;sealAttempted:boolean;
 log:{speaker:string;text:string}[];visited:string[];revision:number;
}
const initial=():PrologueState=>({phase:'story',nodeId:scenario.startNodeId,guard:90,questions:[],keywords:[],environment:initialEnvironment(),dungeon:initialDungeon(dungeon),events:[],editResult:null,resistance:0,name:'',playableId:'vessel',completed:false,rejectedNode:null,doorOpensAt:null,cue:null,sealFlipped:false,sealAttempted:false,log:[{speaker:'narrator',text:getDialogue(scenario,scenario.startNodeId).text}],visited:[],revision:1});
const unique=(v:unknown,allowed:string[]):v is string[]=>Array.isArray(v)&&new Set(v).size===v.length&&v.every(x=>typeof x==='string'&&allowed.includes(x));
const validName=(name:unknown):name is string=>typeof name==='string'&&[...name.trim()].length>=1&&[...name.trim()].length<=20&&!/[\u0000-\u001f\u007f]/u.test(name);
export function decodePrologue(raw:string):PrologueState {
 const e:unknown=JSON.parse(raw);if(!record(e)||e.version!==1||e.contentVersion!=='first-act-1'||!record(e.state))throw new Error('호환되지 않는 프롤로그 저장입니다.');
 const s=e.state;
 if(!['story','dungeon','core','village','church'].includes(String(s.phase))||!scenario.nodes.some(n=>n.id===s.nodeId)||![0,90,100].includes(Number(s.guard))||typeof s.guard!=='number')throw new Error('잘못된 진행');
 if(!unique(s.questions,questions.map(q=>q.id))||!unique(s.keywords,keywords.map(k=>k.id))||!unique(s.visited,['church','square','road']))throw new Error('잘못된 기억');
 if(!record(s.environment)||Object.keys(s.environment).length!==Object.keys(STATE_VALUES).length)throw new Error('잘못된 환경');
 for(const [key,values]of Object.entries(STATE_VALUES))if(!values.includes(String(s.environment[key])))throw new Error('잘못된 환경 상태');
 const d=s.dungeon;if(!record(d)||d.id!==dungeon.id||!record(d.position)||!dungeon.rooms.some(r=>r.id===d.roomId&&validPosition(d.position as unknown as Point,r))||!Number.isInteger(d.stability)||Number(d.stability)<0||Number(d.stability)>3||!Number.isFinite(d.lastHitAt))throw new Error('잘못된 던전');
 if(d.status!=='exploring'||d.outcomeId!==null||!Array.isArray(d.fragments)||d.fragments.length||!Array.isArray(d.inspected)||d.inspected.length||!record(d.puzzles)||Object.keys(d.puzzles).length)throw new Error('잘못된 던전 체크포인트');
 const allowedEvents=['guard_max','guard_zero','transfer','seal_broken','identity_unsealed','memory_seen','identity_committed',...rules.flatMap(r=>r.options.map(o=>o.resultId))];
 if(!unique(s.events,allowedEvents)||typeof s.name!=='string'||(s.name!==''&&!validName(s.name))||!['vessel','inquisitor'].includes(String(s.playableId))||typeof s.completed!=='boolean'||![0,1].includes(Number(s.resistance))||typeof s.resistance!=='number'||typeof s.sealFlipped!=='boolean'||typeof s.sealAttempted!=='boolean')throw new Error('잘못된 인물 상태');
 if(s.rejectedNode!==null&&!['reject_a','reject_b'].includes(String(s.rejectedNode)))throw new Error('잘못된 응답');
 if(s.doorOpensAt!==null&&!(typeof s.doorOpensAt==='number'&&Number.isFinite(s.doorOpensAt)&&s.doorOpensAt>0))throw new Error('잘못된 시간');
 if((s.environment.door==='waiting')!==(s.doorOpensAt!==null))throw new Error('문 시간 불일치');
 if(s.cue!==null&&(!record(s.cue)||!Object.hasOwn(narration,String(s.cue.id))||!Number.isInteger(s.cue.index)||Number(s.cue.index)<0||Number(s.cue.index)>=narration[s.cue.id as keyof typeof narration].length))throw new Error('잘못된 연출');
 if(!Array.isArray(s.log)||!s.log.length||!s.log.every(l=>record(l)&&['narrator','player','inquisitor'].includes(String(l.speaker))&&typeof l.text==='string')||!Number.isSafeInteger(s.revision)||Number(s.revision)<1)throw new Error('잘못된 로그');
 if(s.editResult!==null){if(!record(s.editResult)||s.editResult.sessionId!=='first-identity'||s.editResult.eventId!==identityEvent.id)throw new Error('잘못된 편집');const expected=commitDraft(identityEvent,s.editResult.selections,'first-identity').result;if(JSON.stringify(expected)!==JSON.stringify(s.editResult)||expected.selections.identity!=='apostle')throw new Error('편집 불일치');}
 if((s.environment.identity==='rewritten')!==(s.editResult!==null)||s.completed!==(s.playableId==='inquisitor')||(s.completed&&(!s.editResult||!validName(s.name)))||(s.phase==='core'&&s.environment.identity!=='unsealed')||(['dungeon','core'].includes(String(s.phase))&&s.guard!==0)||(['village','church'].includes(String(s.phase))&&!s.completed))throw new Error('인과관계 불일치');
 return s as unknown as PrologueState;
}
export function createPrologueStore(storage?:StorageLike) {
 let loaded:PrologueState|null=null,error:string|null=null;
 try{const raw=storage?.getItem(PROLOGUE_SAVE_KEY);if(raw)loaded=decodePrologue(raw);}catch{error='프롤로그 저장을 읽지 못했습니다. 기존 저장은 보존됩니다. 새 공연 시작 시에만 교체됩니다.';}
 return createStore<{
  progress:PrologueState;hasSave:boolean;error:string|null;actionError:string|null;
  start:()=>void;advance:(nodeId:string)=>void;choose:(nodeId:string,choiceId:string)=>void;ask:(id:string)=>void;collect:(id:string)=>void;finishQuestions:()=>void;enter:()=>void;name:(value:string)=>void;
  checkpoint:(p:Point)=>void;travel:(id:string,p:Point)=>void;inspect:(id:string,p:Point)=>boolean;commitRule:(id:string,option:string)=>void;settle:()=>void;hit:(id:string,p:Point,now:number)=>void;retry:()=>void;
  beginResistance:(keyword:string)=>void;beginSeal:()=>void;flip:()=>void;help:()=>void;cueNext:()=>void;core:()=>void;confirmCore:(draft:EditDraft)=>void;cancelCore:()=>void;visit:(id:string)=>void;church:()=>void;village:()=>void;retrySave:()=>void;
 }>()((set,get)=>{
  const persist=(p:PrologueState)=>{let error:string|null=null;try{storage?.setItem(PROLOGUE_SAVE_KEY,JSON.stringify({version:1,contentVersion:'first-act-1',state:p}));}catch{error='자동 저장에 실패했습니다. 새로고침 전에 저장을 재시도하세요.';}set({progress:p,hasSave:true,error,actionError:null});};
  const change=(p:PrologueState)=>persist({...p,revision:get().progress.revision+1});
  const move=(p:PrologueState,id:string)=>{
   const m=meta[id],n=getDialogue(scenario,id),next={...p,phase:'story' as PrologueState['phase'],nodeId:id,cue:null,log:[...p.log,{speaker:n.speaker,text:n.text}]};
   if(m.event==='guard_max'){next.guard=100;next.rejectedNode=id;}
   if(m.event==='guard_zero')next.guard=0;
   if(m.event==='transfer'){next.playableId='inquisitor';next.completed=true;}
   if(m.event&&!next.events.includes(m.event))next.events=[...next.events,m.event];
   if(m.mode==='village')next.phase='village';
   return next;
  };
  const near=(id:string,point:Point)=>{const p=get().progress,r=dungeon.rooms.find(r=>r.id===p.dungeon.roomId)!;const o=r.objects.find(o=>o.id===id);return p.phase==='dungeon'&&p.dungeon.stability>0&&validPosition(point,r)&&o&&Math.hypot(point.x-o.x,point.y-o.y)<=dungeon.rules.interactionRadius+8?o:null;};
  const event=(events:string[],id:string)=>events.includes(id)?events:[...events,id];
  return {progress:loaded??initial(),hasSave:!!loaded,error,actionError:null,
   start:()=>persist(initial()),
   advance:id=>{const p=get().progress;if(p.phase!=='story'||p.nodeId!==id||!['dialogue','rewrite','transfer'].includes(meta[id].mode))return;const next=getNextNode(scenario,id);if(next)change(move(p,next));},
   choose:(id,choiceId)=>{const p=get().progress;if(p.phase!=='story'||p.nodeId!==id)return;const n=getDialogue(scenario,id),c=n.choices?.find(c=>c.id===choiceId);if(c)change(move({...p,log:[...p.log,{speaker:'player',text:c.text}]},c.next));},
   ask:id=>{const p=get().progress,q=questions.find(q=>q.id===id);if(p.phase!=='story'||p.nodeId!=='questions'||!q)return;change(move({...p,questions:p.questions.includes(id)?p.questions:[...p.questions,id],log:[...p.log,{speaker:'player',text:q.text}]},q.nodeId));},
   collect:id=>{const p=get().progress;if(p.phase!=='story'||!meta[p.nodeId].segments?.some(s=>s.keywordId===id)||p.keywords.includes(id))return;change({...p,keywords:[...p.keywords,id]});},
   finishQuestions:()=>{const p=get().progress;if(p.phase==='story'&&p.nodeId==='questions'&&questions.every(q=>p.questions.includes(q.id)))change(move(p,'infiltrate'));},
   enter:()=>{const p=get().progress;if(p.phase!=='story'||p.nodeId!=='infiltrate'||p.guard!==0)return;change({...p,phase:'dungeon'});},
   name:value=>{const p=get().progress;if(p.phase!=='story'||meta[p.nodeId].mode!=='name')return;if(!validName(value)){set({actionError:'이름은 공백을 제외하고 1~20자로 입력해 주세요.'});return;}change(move({...p,name:value.trim()},getDialogue(scenario,p.nodeId).next!));},
   checkpoint:position=>{const p=get().progress;if(p.phase!=='dungeon')return;const room=dungeon.rooms.find(r=>r.id===p.dungeon.roomId)!;change({...p,dungeon:{...p.dungeon,position:safePosition(position,room)}});},
   travel:(id,position)=>{const p=get().progress,o=near(id,position);if(!o||o.kind!=='door')return;if(!exitAvailable(id,p.environment)){set({actionError:id==='to_chapel'?'다리를 펼치고 건너편 인형의 기억을 확인하세요.':'봉인 뒤의 무대를 먼저 펼치세요.'});return;}change({...p,dungeon:{...p.dungeon,roomId:o.targetRoom!,position:o.spawn!}});},
   inspect:(id,position)=>{const p=get().progress,o=near(id,position);if(!o)return false;
    if(id==='altar_seal'&&(p.environment.negation!=='detached'||p.environment.door!=='open')){set({actionError:'부정어를 분리하고 문을 먼저 열어야 합니다.'});return false;}
    if(id==='keyword_cache'){change({...p,keywords:keywords.map(k=>k.id),dungeon:{...p.dungeon,position}});return true;}
    if(id==='betrayal_memory'){if(p.environment.bridge!=='open'){set({actionError:'믿음의 다리를 먼저 펼치세요.'});return false;}change({...p,dungeon:{...p.dungeon,position},cue:{id:'memory',index:0}});return true;}
    change({...p,dungeon:{...p.dungeon,position}});return true;
   },
   commitRule:(id,optionId)=>{const p=get().progress,r=rules.find(r=>r.id===id);if(!r||!near(r.objectId,p.dungeon.position))return;
    try{const environment=applyRule(p.environment,r,optionId,p.keywords),option=r.options.find(o=>o.id===optionId)!;if(environment[r.stateKey]===p.environment[r.stateKey])return;
     let position=p.dungeon.position;const room=dungeon.rooms.find(r=>r.id===p.dungeon.roomId)!;
     if(texts.some(t=>t.roomId===room.id&&textPhysics(t,environment).solid&&position.x+18>t.x&&position.x-18<t.x+t.w&&position.y+18>t.y&&position.y-18<t.y+t.h))position=room.start;
     change({...p,environment,events:event(p.events,option.resultId),doorOpensAt:r.stateKey==='door'?(option.value==='waiting'?Date.now()+(option.delayMs??4000):null):p.doorOpensAt,dungeon:{...p.dungeon,position}});
    }catch(e){set({actionError:e instanceof Error?e.message:'편집 실패'});}
   },
   settle:()=>{const p=get().progress;if(p.environment.door==='waiting'&&p.doorOpensAt!==null&&Date.now()>=p.doorOpensAt)change({...p,environment:{...p.environment,door:'open'},doorOpensAt:null});},
   hit:(id,position,now)=>{const p=get().progress,r=dungeon.rooms.find(r=>r.id===p.dungeon.roomId)!;if(p.phase!=='dungeon'||p.cue||p.dungeon.stability===0||!Number.isFinite(now)||now-p.dungeon.lastHitAt<1000||!(r.enemies.some(e=>e.id===id)||id==='resistance_enemy')||(id==='refusal_charger'&&p.environment.punctuation==='question'))return;change({...p,dungeon:{...p.dungeon,position:safePosition(position,r),stability:Math.max(0,p.dungeon.stability-1),lastHitAt:now}});},
   retry:()=>{const p=get().progress;if(p.phase!=='dungeon'||p.dungeon.stability!==0)return;const room=dungeon.rooms.find(r=>r.id===p.dungeon.roomId)!;change({...p,dungeon:{...p.dungeon,position:room.start,stability:3,lastHitAt:Date.now()}});},
   beginResistance:keyword=>{const p=get().progress;if(!near('identity_belief',p.dungeon.position)||!p.keywords.includes(keyword)||!['sun','apostle','betrayal'].includes(keyword)||p.environment.identity!=='sealed')return;change({...p,environment:{...p.environment,identity:'resisting'},resistance:1,cue:{id:'resistance',index:0}});},
   beginSeal:()=>{const p=get().progress;if(!near('altar_seal',p.dungeon.position)||p.environment.negation!=='detached'||p.environment.door!=='open')return;change({...p,sealAttempted:true});},
   flip:()=>{const p=get().progress;if(p.phase==='dungeon'&&p.sealAttempted&&p.dungeon.roomId==='chapel')change({...p,sealFlipped:!p.sealFlipped});},
   help:()=>{const p=get().progress;if(p.phase!=='dungeon')return;if(p.dungeon.roomId==='chapel'&&p.sealAttempted&&p.environment.seal==='locked')change({...p,cue:{id:'seal',index:0}});else if(p.environment.identity==='resisting')change({...p,cue:{id:'resistance',index:0}});},
   cueNext:()=>{const p=get().progress,c=p.cue;if(!c||p.phase!=='dungeon')return;if(c.index<narration[c.id].length-1){change({...p,cue:{...c,index:c.index+1}});return;}
    if(c.id==='memory')change({...p,cue:null,environment:{...p.environment,memory:'seen'},events:event(p.events,'memory_seen')});
    if(c.id==='seal')change({...p,cue:null,environment:{...p.environment,seal:'broken'},sealFlipped:false,events:event(p.events,'seal_broken')});
    if(c.id==='resistance')change({...p,cue:null,phase:'core',environment:{...p.environment,identity:'unsealed'},resistance:0,events:event(p.events,'identity_unsealed')});
   },
   core:()=>{const p=get().progress;if(near('identity_belief',p.dungeon.position)&&p.environment.identity==='unsealed')change({...p,phase:'core'});},
   confirmCore:draft=>{const p=get().progress;if(p.phase!=='core'||p.editResult)return;try{const {result}=commitDraft(identityEvent,draft,'first-identity');if(draft.identity!=='apostle'){set({actionError:'공연은 아직 끝나지 않았습니다. 가려진 이름의 사도를 선택하세요.'});return;}change(move({...p,editResult:result,environment:{...p.environment,identity:'rewritten'},events:event(p.events,'identity_committed')},'return_0'));}catch{set({actionError:'허용되지 않은 사고 편집입니다.'});}},
   cancelCore:()=>{const p=get().progress;if(p.phase==='core')change({...p,phase:'dungeon'});},
   visit:id=>{const p=get().progress;if(p.phase==='village'&&['church','square','road'].includes(id)&&!p.visited.includes(id))change({...p,visited:[...p.visited,id]});},
   church:()=>{const p=get().progress;if(p.phase==='village'&&p.completed)change({...p,phase:'church'});},
   village:()=>{const p=get().progress;if(p.phase==='church')change({...p,phase:'village'});},
   retrySave:()=>{if(get().hasSave)persist(get().progress);},
  };
 });
}
export type PrologueStore=ReturnType<typeof createPrologueStore>;
