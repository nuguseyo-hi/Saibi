import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import type Phaser from 'phaser';
import type { DungeonObject, Point } from '../dungeon/model';
import type { SideScrollScene } from './SideScrollScene';
import { dungeon, narration } from './content';
import { inkUI, readRealm } from './strikes';
import type { InkStroke, InkRoom, Realm } from './strikes';
import { stageInput } from './stageInput';
import type { PrologueStore } from './store';

export function PrologueDungeon({store,reduced,onTitle}:{store:PrologueStore;reduced:boolean;onTitle:()=>void}) {
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
   instance.collapse(()=>{if(scene.current!==instance)return;setNotice(store.getState().touch(o.id,null,false,point)??'');busy.current=false;setPerforming(false);});return;
  }
  setNotice(store.getState().touch(o.id,null,false,point)??'');
 };
 const edit=(stroke:InkStroke|null,point:Point)=>{if(busy.current)return;setNotice(store.getState().editStroke(store.getState().progress.dungeon.roomId,stroke,point)??'');};
 const interactRef=useRef(interact),editRef=useRef(edit);interactRef.current=interact;editRef.current=edit;
 useEffect(()=>{
  let disposed=false,game:Phaser.Game|undefined;const element=host.current!;
  const paused=()=>latest.current.performing||latest.current.pause||!!latest.current.p.cue||latest.current.p.dungeon.stability===0||document.hidden||!element.contains(document.activeElement);
  void Promise.all([import('phaser'),import('./SideScrollScene'),document.fonts.load('400 28px "Memory Serif"').catch(()=>[])]).then(([{default:Phaser},{SideScrollScene}])=>{
   if(disposed)return;
   const instance=new SideScrollScene({read:()=>store.getState().progress,paused,reduced:()=>latest.current.reduced,
    interact:(o,pos)=>interactRef.current(o,pos),nearby:o=>{if(!disposed)setNearby(o);},checkpoint:pos=>store.getState().checkpoint(pos),
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
 const realm=preview?.room===room.id?preview.realm:readRealm(room.id,p.ink[room.id as InkRoom],p.environment.identity);
 const pauseGame=()=>{scene.current?.cancelInk();checkpoint();setPause(true);};
 return <section className="pro-dungeon side-dungeon strike-dungeon" onKeyDown={e=>{
  if(performing)return;
  if(e.key==='Escape'){e.stopPropagation();if(pause){setPause(false);requestAnimationFrame(focus);}else if(!p.cue)pauseGame();}
 }}>
  <div className="pro-dungeon-head"><div><small>{room.subtitle}</small><h1>{room.name}</h1></div><button disabled={performing} onClick={pauseGame}>잠시 멈춤</button></div>
  <div className="dungeon-frame side-frame">
   <div ref={host} className="phaser-host" tabIndex={0} role="application" aria-label="심상세계. 좌우 이동, Space 점프. 취소선 가운데와 양 끝을 마우스로 끌어 편집. Q와 방향키로도 편집. E 조사, R 취소선 복원." onPointerDownCapture={focus}/>
   {!loaded&&<div className="dungeon-loading">{loadError?'무대를 불러오지 못했습니다. 새로고침해 주세요.':'기억의 문장을 펼치는 중…'}</div>}
   {!pause&&!p.cue&&loaded&&!performing&&<aside className={`side-mind mood-${realm.mood}`} aria-live="polite"><small>{inkUI.bodyLabel}{preview?' · 편집 중':''}</small><p>“{realm.reaction}”</p><span>{room.id==='chapel'?`${realm.lightOn?'빛이 남아 있다':'빛이 사라졌다'} · ${realm.bridgeSolid?'다리가 이어진다':'다리가 끊어진다'}`:room.id==='altar'?realm.selfPresent?realm.faithIntact?'오래된 신앙':realm.mood==='rewritten'?'새로운 신앙이 자리 잡았다':'신앙의 자리가 비어 있다':'자아가 흐려진다':realm.wallSolid?'기억이 길을 막는다':'기억의 장벽이 풀렸다'}</span></aside>}
   {!pause&&!p.cue&&loaded&&!performing&&!preview&&nearby&&<div className="side-context"><button onClick={()=>{focus();if(scene.current)interact(nearby,scene.current.position());}}><kbd>E</kbd> {nearby.title}</button></div>}
   {(notice||error)&&!p.cue&&!pause&&<p className="side-notice" role="status">{error??notice}</p>}
   {p.cue&&<div className={`side-narration cue-${p.cue.id}`}><small>이야기</small><p>{narration[p.cue.id][p.cue.index]}</p><button autoFocus disabled={!cueReady} onClick={()=>{store.getState().cueNext();requestAnimationFrame(focus);}}>계속 듣기</button></div>}
   {pause&&<div className="pro-overlay"><article className="pro-paper" role="dialog" aria-modal="true" aria-label="공연 일시정지"><h2>공연을 잠시 멈추다</h2><p>{inkUI.hint}</p><p>{inkUI.keyboard}</p><p>놓은 취소선은 자동 저장됩니다. 끌던 취소선은 취소할 수 있습니다.</p><button autoFocus onClick={()=>{setPause(false);requestAnimationFrame(focus);}}>계속 탐험하기</button><button onClick={()=>{checkpoint();onTitle();}}>타이틀로</button></article></div>}
   {p.dungeon.stability===0&&<div className="pro-overlay"><article className="pro-paper"><h2>접힌 무대 펼치기</h2><button onClick={()=>{store.getState().retry();focus();}}>이 구역에서 다시 시작</button></article></div>}
  </div>
  <div className="ink-controls"><p>{inkUI.hint}</p><div><button disabled={!loaded||!!p.cue||performing||pause} onClick={()=>{focus();scene.current?.beginInk();}}>Q · 키보드로 집기</button><button disabled={!loaded||!!p.cue||performing||pause} onClick={()=>{focus();scene.current?.resetInk();}}>R · 취소선 복원</button></div><small>{preview?inkUI.keyboard:'A / D 이동 · Space 점프 · E 조사 · Q 취소선 편집'}</small></div>
  <div className="pro-dungeon-foot"><p>{room.objective}</p></div>
 </section>;
}
