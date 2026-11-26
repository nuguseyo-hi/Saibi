import {chapel} from './chapel';
import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import type Phaser from 'phaser';
import type { DungeonObject, Point } from '../dungeon/model';
import type { SideScrollScene } from './SideScrollScene';
import { corridor } from './corridor';
import type { CorridorSlot } from './corridor';
import { dungeon, narration, keywords } from './content';
import { inkUI, readRealm } from './strikes';
import type { InkStroke, InkRoom, Realm } from './strikes';
import { stageInput } from './stageInput';
import type { PrologueStore } from './store';

export function PrologueDungeon({store,reduced,onTitle}:{store:PrologueStore;reduced:boolean;onTitle:()=>void}) {
 const [selected,setSelected]=useState<string|null>(null);const selectedRef=useRef<string|null>(null);selectedRef.current=selected;
 const p=useStore(store,s=>s.progress),error=useStore(store,s=>s.actionError);
 const host=useRef<HTMLDivElement>(null),scene=useRef<SideScrollScene|null>(null),busy=useRef(false);
 const [pause,setPause]=useState(false),[nearby,setNearby]=useState<DungeonObject|null>(null),[loaded,setLoaded]=useState(false),[loadError,setLoadError]=useState(false);
 const [notice,setNotice]=useState(''),[performing,setPerforming]=useState(false),[readyCue,setReadyCue]=useState('');
 const [preview,setPreview]=useState<{room:string;realm:Realm}|null>(null);
 const cueReady=reduced||!p.cue||p.cue.index>0||readyCue===p.cue.id;
 useEffect(()=>{if(!p.cue||p.cue.index!==0)return;const id=p.cue.id,timer=setTimeout(()=>setReadyCue(id),1200);return()=>clearTimeout(timer);},[p.cue?.id,p.cue?.index]);
 const latest=useRef({p,pause,reduced,performing});latest.current={p,pause,reduced,performing};
 const focus=()=>host.current?.focus();
 const checkpoint=()=>{if(scene.current)store.getState().checkpoint(scene.current.position());};
 const interact=(o:DungeonObject,point:Point)=>{
  if(busy.current)return;
  const before=store.getState().progress;
  if(o.id==='final_threshold'&&before.environment.identity==='placed'&&scene.current){
   const instance=scene.current;busy.current=true;setPerforming(true);
   instance.collapse(()=>{if(scene.current!==instance)return;if(before.dungeon.roomId==='betrayal'&&['trust_bridge','betrayal_door'].includes(o.id)){insert(o.id==='trust_bridge'?'bridge':'door',false,point);return;}
  setNotice(store.getState().touch(o.id,null,false,point)??'');busy.current=false;setPerforming(false);});return;
  }
  if(before.dungeon.roomId==='betrayal'&&['trust_bridge','betrayal_door'].includes(o.id)){insert(o.id==='trust_bridge'?'bridge':'door',false,point);return;}
  setNotice(store.getState().touch(o.id,null,false,point)??'');
 };
 const insert=(slot:CorridorSlot,remove:boolean,point:Point,word=selectedRef.current)=>{
  if(busy.current)return;
  const message=store.getState().touch(slot==='bridge'?'trust_bridge':'betrayal_door',word,remove,point);setNotice(message??'');
  if(message===corridor.ui.wrong||message===corridor.ui.missing)scene.current?.rejectWord(keywords.find(k=>k.id===word)?.label??'…');
 };
 const insertRef=useRef(insert);insertRef.current=insert;
 const edit=(stroke:InkStroke|null,point:Point)=>{if(busy.current)return;setNotice(store.getState().editStroke(store.getState().progress.dungeon.roomId,stroke,point)??'');};
 const interactRef=useRef(interact),editRef=useRef(edit);interactRef.current=interact;editRef.current=edit;
 useEffect(()=>{
  let disposed=false,game:Phaser.Game|undefined;const element=host.current!;
  const paused=()=>latest.current.performing||latest.current.pause||!!latest.current.p.cue||latest.current.p.dungeon.stability===0||document.hidden||!element.contains(document.activeElement);
  void Promise.all([import('phaser'),import('./SideScrollScene'),document.fonts.load('400 28px "Memory Serif"').catch(()=>[])]).then(([{default:Phaser},{SideScrollScene}])=>{
   if(disposed)return;
   const instance=new SideScrollScene({read:()=>store.getState().progress,paused,reduced:()=>latest.current.reduced,
    corridor:(slot,remove,pos)=>insertRef.current(slot,remove,pos),interact:(o,pos)=>interactRef.current(o,pos),nearby:o=>{if(!disposed)setNearby(o);},checkpoint:pos=>store.getState().checkpoint(pos),
    edit:(stroke,point)=>editRef.current(stroke,point),preview:realm=>{if(!disposed)setPreview(realm?{room:store.getState().progress.dungeon.roomId,realm}:null);},
    fall:()=>{store.getState().fall();setNotice(inkUI.safe);},ready:()=>{if(!disposed){setLoaded(true);element.focus();}}
   });scene.current=instance;
   game=new Phaser.Game({type:Phaser.AUTO,parent:element,input:stageInput(element),width:1280,height:720,backgroundColor:'#18131b',scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},physics:{default:'arcade',arcade:{gravity:{x:0,y:0},debug:false}},audio:{noAudio:true},scene:[instance]});
  }).catch(()=>{if(!disposed)setLoadError(true);});
  const save=()=>{if(scene.current)store.getState().checkpoint(scene.current.position());};window.addEventListener('pagehide',save);window.addEventListener('blur',save);
  return()=>{disposed=true;window.removeEventListener('pagehide',save);window.removeEventListener('blur',save);scene.current=null;game?.destroy(true);element.replaceChildren();};
 },[store]);
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),5000);return()=>clearTimeout(timer);},[notice]);
 const room=dungeon.rooms.find(r=>r.id===p.dungeon.roomId)!;
 const realm=preview?.room===room.id?preview.realm:readRealm(room.id,p.ink[room.id as InkRoom],p.environment.identity,p.chapel);
 const isCorridor=room.id==='betrayal';
 const available=keywords.filter(k=>p.keywords.includes(k.id));
 const disabled=!loaded||!!p.cue||performing||pause||p.dungeon.stability===0;
 const pauseGame=()=>{scene.current?.cancelInk();checkpoint();setPause(true);};
 return <section className="pro-dungeon side-dungeon strike-dungeon" onKeyDown={e=>{
  if(performing)return;
  if(isCorridor&&!disabled){if(/^[1-5]$/.test(e.key)){const word=available[Number(e.key)-1];if(word){setSelected(word.id);e.preventDefault();}return;}if(e.key.toLowerCase()==='r'){e.preventDefault();scene.current?.removeCorridor();return;}}
  if(room.id==='chapel'&&e.key.toLowerCase()==='r'&&p.chapel.inserted&&!disabled){e.preventDefault();if(scene.current)setNotice(store.getState().touch('chapel_slot',null,true,scene.current.position())??'');return;}
  if(e.key==='Escape'){e.stopPropagation();if(pause){setPause(false);requestAnimationFrame(focus);}else if(!p.cue)pauseGame();}
 }}>
  <div className="pro-dungeon-head"><div><small>{room.subtitle}</small><h1>{room.name}</h1></div><button disabled={performing} onClick={pauseGame}>잠시 멈춤</button></div>
  <div className="dungeon-frame side-frame">
   <div ref={host} className="phaser-host" tabIndex={0} role="application" aria-label={isCorridor?'배신의 회랑. 단어를 빈칸으로 끌거나 숫자로 선택 후 E 삽입, R 회수. 좌우 이동, Space 점프.':"심상세계. 좌우 이동, Space 점프. 취소선 가운데와 양 끝을 마우스로 끌어 편집. Q와 방향키로도 편집. E 조사, R 취소선 복원."} onPointerDownCapture={focus} onDragOver={e=>{if((isCorridor||room.id==='chapel')&&!disabled)e.preventDefault();}} onDrop={e=>{e.preventDefault();if(disabled)return;if(room.id==='chapel'){focus();if(e.dataTransfer.getData('text/saibi-word')==='darkness'&&scene.current?.dropChapel(e.clientX,e.clientY))setNotice(store.getState().touch('chapel_slot','darkness',false,scene.current.position())??'');return;}if(!isCorridor)return;const word=e.dataTransfer.getData('text/saibi-word');if(!available.some(k=>k.id===word))return;focus();const target=scene.current?.dropCorridor(e.clientX,e.clientY);if(target&&scene.current)insert(target,false,scene.current.position(),word);}}/>
   {!loaded&&<div className="dungeon-loading">{loadError?'무대를 불러오지 못했습니다. 새로고침해 주세요.':'기억의 문장을 펼치는 중…'}</div>}
   {room.id==='altar'&&!pause&&!p.cue&&loaded&&!performing&&<aside className={`side-mind mood-${realm.mood}`} aria-live="polite"><small>{inkUI.bodyLabel}{preview?' · 편집 중':''}</small><p>“{realm.reaction}”</p><span>{realm.selfPresent?realm.faithIntact?'오래된 신앙':realm.mood==='rewritten'?'새로운 신앙이 자리 잡았다':'신앙의 자리가 비어 있다':'자아가 흐려진다'}</span></aside>}
   {!pause&&!p.cue&&loaded&&!performing&&!preview&&nearby&&<div className="side-context"><button onClick={()=>{focus();if(scene.current)interact(nearby,scene.current.position());}}><kbd>E</kbd> {nearby.title}</button></div>}
   {(notice||error)&&!p.cue&&!pause&&<p className="side-notice" role="status">{error??notice}</p>}
   {p.cue&&<div className={`side-narration cue-${p.cue.id}`}><small>이야기</small><p>{narration[p.cue.id][p.cue.index]}</p><button autoFocus disabled={!cueReady} onClick={()=>{store.getState().cueNext();requestAnimationFrame(focus);}}>계속 듣기</button></div>}
   {pause&&<div className="pro-overlay"><article className="pro-paper" role="dialog" aria-modal="true" aria-label="공연 일시정지"><h2>공연을 잠시 멈추다</h2><p>{isCorridor?corridor.ui.hint:inkUI.hint}</p><p>{isCorridor?corridor.ui.keyboard:inkUI.keyboard}</p><p>{corridor.ui.limit}</p><p>{isCorridor?'넣거나 뺀 단어는 자동 저장됩니다.':'놓은 취소선은 자동 저장됩니다. 끌던 취소선은 취소할 수 있습니다.'}</p><button autoFocus onClick={()=>{setPause(false);requestAnimationFrame(focus);}}>계속 탐험하기</button><button onClick={()=>{checkpoint();onTitle();}}>타이틀로</button></article></div>}
   {p.dungeon.stability===0&&!p.cue&&<div className="pro-overlay"><article className="pro-paper"><h2>접힌 무대 펼치기</h2><p>{isCorridor?corridor.ui.retry:''}</p><button onClick={()=>{store.getState().retry();focus();}}>이 구역에서 다시 시작</button></article></div>}
  </div>
  {isCorridor?<div className="corridor-controls"><div className="corridor-inventory" aria-label="대화에서 얻은 단어">{available.map((k,i)=><button key={k.id} disabled={disabled} draggable={!disabled} aria-pressed={selected===k.id} onDragStart={e=>{setSelected(k.id);e.dataTransfer.setData('text/saibi-word',k.id);}} onClick={()=>{setSelected(k.id);focus();}}><kbd>{i+1}</kbd> {k.label}</button>)}</div><p>{corridor.ui.hint}</p><small>{corridor.ui.keyboard}</small><span className="corridor-life" aria-live="polite">{corridor.ui.life} {'♥'.repeat(p.dungeon.stability)}{'♡'.repeat(3-p.dungeon.stability)}</span><p className="corridor-limit">{corridor.ui.limit}</p></div>:<div className="ink-controls">{room.id==='chapel'&&<><p>{chapel.ui.hint}</p>{p.chapel.collected&&<button disabled={disabled} draggable={!disabled&&!p.chapel.inserted} onDragStart={e=>e.dataTransfer.setData('text/saibi-word','darkness')} onClick={()=>{focus();if(scene.current)setNotice(store.getState().touch('chapel_slot','darkness',p.chapel.inserted,scene.current.position())??'');}}>{p.chapel.inserted?'어둠 뽑기':'어둠 끼우기'}</button>}</>}<p>{inkUI.hint}</p><div><button disabled={!loaded||!!p.cue||performing||pause} onClick={()=>{focus();scene.current?.beginInk();}}>Q · 키보드로 집기</button><button disabled={!loaded||!!p.cue||performing||pause} onClick={()=>{focus();scene.current?.resetInk();}}>R · 취소선 복원</button></div><small>{preview?inkUI.keyboard:'A / D 이동 · Space 점프 · E 조사 · Q 취소선 편집'}</small></div>}
  <div className="pro-dungeon-foot"><p>{room.objective}</p></div>
 </section>;
}
