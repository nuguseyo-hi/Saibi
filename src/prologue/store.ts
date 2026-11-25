import { createStore } from 'zustand/vanilla';
import { getDialogue, getNextNode } from '../domain/scenario.ts';
import { commitDraft } from '../domain/mind/editing.ts';
import type { EditDraft, EditResult } from '../domain/mind/editing.ts';
import { initialDungeon, validPosition, safePosition } from '../dungeon/model.ts';
import type { DungeonProgress, Point } from '../dungeon/model.ts';
import type { StorageLike } from '../services/storage.ts';
import { record } from '../domain/validation.ts';
import { scenario, meta, dungeon, keywords, questions, rules, identityEvent, STATE_VALUES, narration } from './content.ts';
import { applyRule, initialEnvironment, exitAvailable } from './environment.ts';
import type { EnvironmentState } from './environment.ts';
import { safeSidePosition, surfaces, physics, slots, stageObject } from './sideScroll.ts';
import { emptyInk, validInk, validStroke, projectInk, roomEnvironment, readRealm, canReachInk, migrateInk, inkUI } from './strikes.ts';
import type { InkState, InkStroke, InkRoom } from './strikes.ts';
export const PROLOGUE_SAVE_KEY='saibi.prologue.v1';
export interface PrologueState {
 phase:'story'|'dungeon'|'core'|'village'|'church';nodeId:string;guard:number;questions:string[];keywords:string[];
 ink:InkState;environment:EnvironmentState;dungeon:DungeonProgress;events:string[];editResult:EditResult|null;resistance:number;
 name:string;playableId:'vessel'|'inquisitor';completed:boolean;rejectedNode:string|null;doorOpensAt:number|null;
 cue:{id:keyof typeof narration;index:number}|null;sealFlipped:boolean;sealAttempted:boolean;
 log:{speaker:string;text:string}[];visited:string[];revision:number;
}
const initial=():PrologueState=>({phase:'story',nodeId:scenario.startNodeId,guard:90,questions:[],keywords:[],ink:emptyInk(),environment:projectInk(emptyInk(),initialEnvironment()),dungeon:initialDungeon(dungeon),events:[],editResult:null,resistance:0,name:'',playableId:'vessel',completed:false,rejectedNode:null,doorOpensAt:null,cue:null,sealFlipped:false,sealAttempted:false,log:[{speaker:'narrator',text:getDialogue(scenario,scenario.startNodeId).text}],visited:[],revision:1});
const unique=(v:unknown,allowed:string[]):v is string[]=>Array.isArray(v)&&new Set(v).size===v.length&&v.every(x=>typeof x==='string'&&allowed.includes(x));
const validName=(name:unknown):name is string=>typeof name==='string'&&[...name.trim()].length>=1&&[...name.trim()].length<=20&&!/[\u0000-\u001f\u007f]/u.test(name);
export function decodePrologue(raw:string):PrologueState {
 const e:unknown=JSON.parse(raw);if(!record(e)||e.version!==1||!['first-act-1','first-act-side-2','first-act-strike-3'].includes(String(e.contentVersion))||!record(e.state))throw new Error('호환되지 않는 프롤로그 저장입니다.');
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
 if((s.environment.identity==='rewritten')!==(s.editResult!==null)||s.completed!==(s.playableId==='inquisitor')||(s.completed&&(!s.editResult||!validName(s.name)))||(s.phase==='core'&&!['unsealed','placed'].includes(String(s.environment.identity)))||(['dungeon','core'].includes(String(s.phase))&&s.guard!==0)||(['village','church'].includes(String(s.phase))&&!s.completed))throw new Error('인과관계 불일치');
 if(e.contentVersion==='first-act-strike-3'&&!validInk(s.ink))throw new Error('잘못된 취소선 저장');
 const decoded=s as unknown as PrologueState;
 if(e.contentVersion!=='first-act-strike-3'){
  decoded.ink=migrateInk(decoded.environment,decoded.dungeon.roomId);
  decoded.environment=projectInk(decoded.ink,decoded.environment);decoded.doorOpensAt=null;
  if(e.contentVersion==='first-act-1')decoded.dungeon.position={...dungeon.rooms.find(r=>r.id===decoded.dungeon.roomId)!.start};
 }else{
  const projected=projectInk(decoded.ink,decoded.environment);
  if(['wall','bridge','door','punctuation','negation'].some(key=>projected[key as keyof EnvironmentState]!==decoded.environment[key as keyof EnvironmentState]))throw new Error('취소선과 환경 상태 불일치');
 }
 decoded.dungeon.position=safeRealmPosition(decoded,decoded.dungeon.position,decoded.dungeon.roomId);
 return decoded;
}
/** Removing a floor returns the observer to the nearest surviving edge, not a distant spawn. */
export function safeRealmPosition(p:Pick<PrologueState,'ink'|'environment'>,point:Point,roomId:string):Point {
 const env=roomEnvironment(roomId,p.ink,p.environment),safe=safeSidePosition(point,roomId,env);
 if(Math.abs(safe.x-point.x)<1)return safe;
 const choices=surfaces(roomId,env).map(r=>({x:Math.max(r.x+physics.bodyWidth/2+4,Math.min(r.x+r.w-physics.bodyWidth/2-4,point.x)),y:r.y-physics.bodyHeight/2})).sort((a,b)=>Math.hypot(a.x-point.x,a.y-point.y)-Math.hypot(b.x-point.x,b.y-point.y));
 for(const candidate of choices){const checked=safeSidePosition(candidate,roomId,env);if(Math.abs(candidate.x-checked.x)<1)return checked;}
 return safe;
}
export function createPrologueStore(storage?:StorageLike) {
 let loaded:PrologueState|null=null,error:string|null=null;
 try{const raw=storage?.getItem(PROLOGUE_SAVE_KEY);if(raw)loaded=decodePrologue(raw);}catch{error='프롤로그 저장을 읽지 못했습니다. 기존 저장은 보존됩니다. 새 공연 시작 시에만 교체됩니다.';}
 return createStore<{
  progress:PrologueState;hasSave:boolean;error:string|null;actionError:string|null;
  start:()=>void;advance:(nodeId:string)=>void;choose:(nodeId:string,choiceId:string)=>void;ask:(id:string)=>void;collect:(id:string)=>void;finishQuestions:()=>void;enter:()=>void;name:(value:string)=>void;
  editStroke:(roomId:string,stroke:InkStroke|null,position:Point)=>string|null;
  touch:(id:string,word:string|null,remove:boolean,p:Point)=>string|null;fall:()=>void;checkpoint:(p:Point)=>void;travel:(id:string,p:Point)=>void;inspect:(id:string,p:Point)=>boolean;commitRule:(id:string,option:string)=>void;settle:()=>void;hit:(id:string,p:Point,now:number)=>void;retry:()=>void;
  beginResistance:(keyword:string)=>void;beginSeal:()=>void;flip:()=>void;help:()=>void;cueNext:()=>void;core:()=>void;confirmCore:(draft:EditDraft)=>void;cancelCore:()=>void;visit:(id:string)=>void;church:()=>void;village:()=>void;retrySave:()=>void;
 }>()((set,get)=>{
  const persist=(p:PrologueState)=>{let error:string|null=null;try{storage?.setItem(PROLOGUE_SAVE_KEY,JSON.stringify({version:1,contentVersion:'first-act-strike-3',state:p}));}catch{error='자동 저장에 실패했습니다. 새로고침 전에 저장을 재시도하세요.';}set({progress:p,hasSave:true,error,actionError:null});};
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
  const near=(id:string,point:Point)=>{const p=get().progress,r=dungeon.rooms.find(r=>r.id===p.dungeon.roomId)!;const source=r.objects.find(o=>o.id===id),o=source?stageObject(source,p.environment):null;return ['dungeon','core'].includes(p.phase)&&!p.cue&&p.dungeon.stability>0&&validPosition(point,r)&&o&&Math.hypot(point.x-o.x,point.y-o.y)<=dungeon.rules.interactionRadius+8?o:null;};
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
   fall:()=>{const p=get().progress;if(!['dungeon','core'].includes(p.phase)||p.cue)return;const room=dungeon.rooms.find(r=>r.id===p.dungeon.roomId)!;change({...p,dungeon:{...p.dungeon,position:safeRealmPosition(p,room.start,room.id)}});},
   editStroke:(roomId,stroke,position)=>{
    const p=get().progress;
    if(!['dungeon','core'].includes(p.phase)||p.cue||p.dungeon.stability===0||roomId!==p.dungeon.roomId||!canReachInk(roomId,position))return inkUI.near;
    if(stroke!==null&&!validStroke(stroke,roomId))return inkUI.invalid;
    if(JSON.stringify(p.ink[roomId as InkRoom])===JSON.stringify(stroke))return inkUI.same;
    const ink={...p.ink,[roomId]:stroke?{a:{...stroke.a},b:{...stroke.b}}:null},environment=projectInk(ink,p.environment);
    const next={...p,ink,environment,doorOpensAt:null};
    if(roomId==='altar'&&p.environment.identity!=='rewritten'){
     const mind=readRealm(roomId,stroke);
     if(!mind.faithIntact&&mind.selfPresent){
      if(p.events.includes('identity_unsealed')){next.phase='core';environment.identity='placed';}
      else{next.phase='dungeon';environment.identity='resisting';next.resistance=1;next.cue={id:'resistance',index:0};}
     }else if(['placed','unsealed','resisting'].includes(p.environment.identity)){environment.identity='unsealed';next.phase='core';next.resistance=0;}
    }
    const safe=safeRealmPosition(next,position,roomId);next.dungeon={...p.dungeon,position:safe};
    change(next);
    if(Math.abs(safe.x-position.x)>10)return inkUI.safe;
    return stroke===null?inkUI.reset:roomId==='altar'&&environment.identity==='placed'?inkUI.ready:inkUI.saved;
   },
   touch:(id,_word,remove,position)=>{
    const p=get().progress,o=near(id,position);if(!o||remove)return null;
    if(slots.some(slot=>slot.objectId===id)||id==='identity_belief')return inkUI.hint;
    if(o.kind==='door'){get().travel(id,position);return null;}
    if(!get().inspect(id,position))return get().actionError;
    if(id==='keyword_cache')return inkUI.memory;
    if(id==='altar_seal'){
     if(p.environment.seal==='broken')return o.text;
     if(!readRealm('chapel',p.ink.chapel).bridgeSolid)return inkUI.finalNeed;
     change({...get().progress,sealAttempted:true,cue:{id:'seal',index:0}});return null;
    }
    if(id==='final_threshold'){
     if(p.environment.identity!=='placed')return inkUI.finalNeed;
     change({...get().progress,phase:'core'});get().confirmCore({identity:'apostle'});return null;
    }
    return o.text;
   },
   checkpoint:position=>{const p=get().progress;if(!['dungeon','core'].includes(p.phase))return;const safe=safeRealmPosition(p,position,p.dungeon.roomId);if(Math.hypot(safe.x-p.dungeon.position.x,safe.y-p.dungeon.position.y)<1)return;change({...p,dungeon:{...p.dungeon,position:safe}});},
   travel:(id,position)=>{const p=get().progress,o=near(id,position);if(!o||o.kind!=='door')return;if(!exitAvailable(id,p.environment)){set({actionError:id==='to_chapel'?'다리를 펼치고 건너편 인형의 기억을 확인하세요.':'봉인 뒤의 무대를 먼저 펼치세요.'});return;}change({...p,phase:'dungeon',dungeon:{...p.dungeon,roomId:o.targetRoom!,position:safeRealmPosition(p,o.spawn!,o.targetRoom!)}});},
   inspect:(id,position)=>{const p=get().progress,o=near(id,position);if(!o)return false;
    if(id==='altar_seal'&&(p.environment.negation!=='detached'||p.environment.door!=='open')){set({actionError:'빛이 지탱하는 길을 유지하며 문을 통과해 오세요.'});return false;}
    if(id==='keyword_cache')return true;
    if(id==='betrayal_memory'){if(p.environment.bridge!=='open'){set({actionError:'다리를 지탱하는 문장을 되돌려 보세요.'});return false;}change({...p,dungeon:{...p.dungeon,position},cue:{id:'memory',index:0}});return true;}
    change({...p,dungeon:{...p.dungeon,position}});return true;
   },
   commitRule:(id,optionId)=>{const p=get().progress,r=rules.find(r=>r.id===id);if(!r||!near(r.objectId,p.dungeon.position))return;
    try{const environment=applyRule(p.environment,r,optionId,p.keywords),option=r.options.find(o=>o.id===optionId)!;if(environment[r.stateKey]===p.environment[r.stateKey])return;
     const position=safeSidePosition(p.dungeon.position,p.dungeon.roomId,environment);
     change({...p,environment,events:event(p.events,option.resultId),doorOpensAt:r.stateKey==='door'?(option.value==='waiting'?Date.now()+(option.delayMs??4000):null):p.doorOpensAt,dungeon:{...p.dungeon,position}});
    }catch(e){set({actionError:e instanceof Error?e.message:'편집 실패'});}
   },
   settle:()=>{const p=get().progress;if(p.environment.door==='waiting'&&p.doorOpensAt!==null&&Date.now()>=p.doorOpensAt)change({...p,environment:{...p.environment,door:'open'},doorOpensAt:null});},
   hit:(id,position,now)=>{const p=get().progress,r=dungeon.rooms.find(r=>r.id===p.dungeon.roomId)!;if(p.phase!=='dungeon'||p.cue||p.dungeon.stability===0||!Number.isFinite(now)||now-p.dungeon.lastHitAt<1000||!(r.enemies.some(e=>e.id===id)||id==='resistance_enemy')||(id==='refusal_charger'&&p.environment.punctuation==='question'))return;change({...p,dungeon:{...p.dungeon,position:safePosition(position,r),stability:Math.max(0,p.dungeon.stability-1),lastHitAt:now}});},
   retry:()=>{const p=get().progress;if(p.phase!=='dungeon'||p.dungeon.stability!==0)return;const room=dungeon.rooms.find(r=>r.id===p.dungeon.roomId)!;change({...p,dungeon:{...p.dungeon,position:room.start,stability:3,lastHitAt:Date.now()}});},
   beginResistance:keyword=>{const p=get().progress;if(!near('identity_belief',p.dungeon.position)||!p.keywords.includes(keyword)||!['sun','apostle','betrayal'].includes(keyword)||p.environment.identity!=='sealed')return;if(p.environment.order!=='swapped'){set({actionError:inkUI.finalNeed});return;}change({...p,environment:{...p.environment,identity:'resisting'},resistance:1,cue:{id:'resistance',index:0}});},
   beginSeal:()=>{const p=get().progress;if(!near('altar_seal',p.dungeon.position)||p.environment.negation!=='detached'||p.environment.door!=='open')return;change({...p,sealAttempted:true});},
   flip:()=>{const p=get().progress;if(p.phase==='dungeon'&&p.sealAttempted&&p.dungeon.roomId==='chapel')change({...p,sealFlipped:!p.sealFlipped});},
   help:()=>{const p=get().progress;if(p.phase!=='dungeon')return;if(p.dungeon.roomId==='chapel'&&p.sealAttempted&&p.environment.seal==='locked')change({...p,cue:{id:'seal',index:0}});else if(p.environment.identity==='resisting')change({...p,cue:{id:'resistance',index:0}});},
   cueNext:()=>{const p=get().progress,c=p.cue;if(!c||p.phase!=='dungeon')return;if(c.index<narration[c.id].length-1){change({...p,cue:{...c,index:c.index+1}});return;}
    if(c.id==='memory')change({...p,cue:null,environment:{...p.environment,memory:'seen'},events:event(p.events,'memory_seen')});
    if(c.id==='seal')change({...p,cue:null,environment:{...p.environment,seal:'broken'},sealFlipped:false,events:event(p.events,'seal_broken')});
    if(c.id==='resistance')change({...p,cue:null,phase:'core',environment:{...p.environment,identity:readRealm('altar',p.ink.altar).selfPresent&&!readRealm('altar',p.ink.altar).faithIntact?'placed':'unsealed'},resistance:0,events:event(p.events,'identity_unsealed')});
   },
   core:()=>{const p=get().progress;if(near('identity_belief',p.dungeon.position)&&['unsealed','placed'].includes(p.environment.identity))change({...p,phase:'core'});},
   confirmCore:draft=>{const p=get().progress;if(p.phase!=='core'||p.editResult)return;const mind=readRealm('altar',p.ink.altar);if(p.environment.identity!=='placed'||mind.faithIntact||!mind.selfPresent){set({actionError:inkUI.finalNeed});return;}try{const {result}=commitDraft(identityEvent,draft,'first-identity');if(draft.identity!=='apostle'){set({actionError:'공연은 아직 끝나지 않았습니다. 가려진 이름의 사도를 선택하세요.'});return;}change(move({...p,editResult:result,environment:{...p.environment,identity:'rewritten'},events:event(p.events,'identity_committed')},'return_0'));}catch{set({actionError:'허용되지 않은 사고 편집입니다.'});}},
   cancelCore:()=>{const p=get().progress;if(p.phase==='core')change({...p,phase:'dungeon'});},
   visit:id=>{const p=get().progress;if(p.phase==='village'&&['church','square','road'].includes(id)&&!p.visited.includes(id))change({...p,visited:[...p.visited,id]});},
   church:()=>{const p=get().progress;if(p.phase==='village'&&p.completed)change({...p,phase:'church'});},
   village:()=>{const p=get().progress;if(p.phase==='church')change({...p,phase:'village'});},
   retrySave:()=>{if(get().hasSave)persist(get().progress);},
  };
 });
}
export type PrologueStore=ReturnType<typeof createPrologueStore>;
