import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import type Phaser from 'phaser';
import type { DungeonObject, Point } from '../dungeon/model';
import type { SideScrollScene } from './SideScrollScene';
import { dungeon, keywords, narration } from './content';
import { slots, slotInserted, messages, identityText } from './sideScroll';
import { stageInput } from './stageInput';
import type { PrologueStore } from './store';
export function PrologueDungeon({store,reduced,onTitle}:{store:PrologueStore;reduced:boolean;onTitle:()=>void}) {
 const p=useStore(store,s=>s.progress),error=useStore(store,s=>s.actionError);
 const host=useRef<HTMLDivElement>(null),scene=useRef<SideScrollScene|null>(null);
 const [pause,setPause]=useState(false),[nearby,setNearby]=useState<DungeonObject|null>(null),[loaded,setLoaded]=useState(false),[loadError,setLoadError]=useState(false);
 const [selected,setSelected]=useState('companion'),[notice,setNotice]=useState('');
 const words=[...keywords.filter(k=>p.keywords.includes(k.id)),...(['unsealed','placed'].includes(p.environment.identity)?[{id:identityText.tokenId,label:identityText.label}]:[])];
 const word=words.find(k=>k.id===selected)??null;
 const latest=useRef({p,pause,reduced,word});latest.current={p,pause,reduced,word};
 const focus=()=>host.current?.focus();
 const checkpoint=()=>{if(scene.current)store.getState().checkpoint(scene.current.position());};
 const interact=(o:DungeonObject,point:Point,remove:boolean)=>{
  const before=store.getState().progress;
  const message=store.getState().touch(o.id,latest.current.word?.id??null,remove,point);
  setNotice(message??'');
  if(JSON.stringify(before.environment)!==JSON.stringify(store.getState().progress.environment))scene.current?.gesture(o,remove);
 };
 const interactRef=useRef(interact);interactRef.current=interact;
 useEffect(()=>{
  let disposed=false,game:Phaser.Game|undefined;const element=host.current!;
  const paused=()=>latest.current.pause||!!latest.current.p.cue||latest.current.p.dungeon.stability===0||document.hidden||!element.contains(document.activeElement);
  void Promise.all([import('phaser'),import('./SideScrollScene'),document.fonts.load('400 22px "Memory Serif"').catch(()=>[])]).then(([{default:Phaser},{SideScrollScene}])=>{
   if(disposed)return;
   const instance=new SideScrollScene({read:()=>store.getState().progress,paused,reduced:()=>latest.current.reduced,word:()=>latest.current.word,
    interact:(o,pos,remove)=>interactRef.current(o,pos,remove),nearby:o=>{if(!disposed)setNearby(o);},checkpoint:pos=>store.getState().checkpoint(pos),
    fall:()=>{store.getState().fall();setNotice(messages.fall);},ready:()=>{if(!disposed){setLoaded(true);element.focus();}}
   });scene.current=instance;
   game=new Phaser.Game({type:Phaser.AUTO,parent:element,input:stageInput(element),width:1280,height:720,backgroundColor:'#18131b',scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},physics:{default:'arcade',arcade:{gravity:{x:0,y:0},debug:false}},audio:{noAudio:true},scene:[instance]});
  }).catch(()=>{if(!disposed)setLoadError(true);});
  const preventWheel=(event:WheelEvent)=>event.preventDefault();element.addEventListener('wheel',preventWheel,{passive:false});
  const save=()=>{if(scene.current)store.getState().checkpoint(scene.current.position());};window.addEventListener('pagehide',save);window.addEventListener('blur',save);
  return()=>{disposed=true;element.removeEventListener('wheel',preventWheel);window.removeEventListener('pagehide',save);window.removeEventListener('blur',save);scene.current=null;game?.destroy(true);element.replaceChildren();};
 },[store]);
 useEffect(()=>{if(p.doorOpensAt===null)return;const timer=setTimeout(()=>store.getState().settle(),Math.max(0,p.doorOpensAt-Date.now())+20);return()=>clearTimeout(timer);},[p.doorOpensAt,store]);
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),6000);return()=>clearTimeout(timer);},[notice]);
 const room=dungeon.rooms.find(r=>r.id===p.dungeon.roomId)!;
 const slot=slots.find(s=>s.objectId===nearby?.id);
 const select=(id:string)=>{setSelected(id);focus();};
 const cycle=(direction:number)=>{if(!words.length)return;const current=words.findIndex(w=>w.id===selected);select(words[(Math.max(0,current)+direction+words.length)%words.length].id);};
 const act=(remove:boolean)=>{if(nearby&&scene.current){focus();interact(nearby,scene.current.position(),remove);}};
 let actionLabel=nearby?.title??'문장 가까이 다가가세요';
 if(slot)actionLabel=slot.mode==='toggle'&&slotInserted(slot,p.environment)?slot.restore:slot.verb;
 if(nearby?.id==='identity_belief'&&['unsealed','placed'].includes(p.environment.identity))actionLabel='가려진 이름 끼우기';
 if(nearby?.id==='altar_seal')actionLabel=!p.sealAttempted?'봉인에 손대기':!p.sealFlipped?'종이 뒤집기':'나레이터의 손 잡기';
 return <section className="pro-dungeon side-dungeon" onKeyDown={e=>{
  if(e.key==='Escape'){e.stopPropagation();if(pause){setPause(false);requestAnimationFrame(focus);}else if(!p.cue){checkpoint();setPause(true);}}
  if(e.target===host.current){const number=Number(e.key);if(Number.isInteger(number)&&number>=1&&number<=words.length)select(words[number-1].id);}
 }}>
  <div className="pro-dungeon-head"><div><small>{room.subtitle}</small><h1>{room.name}</h1></div><button onClick={()=>{checkpoint();setPause(true);}}>잠시 멈춤</button></div>
  <div className="dungeon-frame side-frame" onWheel={e=>{if(!pause&&!p.cue&&e.deltaY)cycle(e.deltaY>0?1:-1);}}>
   <div ref={host} className="phaser-host" tabIndex={0} role="application" aria-label="횡스크롤 심상던전. 좌우 이동, Space 점프, 숫자 키로 단어 선택, E 끼우기 또는 조사, R 뽑기, Escape 일시정지" onPointerDown={focus}/>
   {!loaded&&<div className="dungeon-loading">{loadError?'무대를 불러오지 못했습니다. 새로고침해 주세요.':'종이 무대를 펼치는 중…'}</div>}
   {!pause&&!p.cue&&loaded&&<div className="side-context"><button disabled={!nearby} onClick={()=>act(false)}><kbd>E</kbd> {actionLabel}</button>{(slot||nearby?.id==='identity_belief'&&p.environment.identity==='placed')&&<button onClick={()=>act(true)}><kbd>R</kbd> {slot?.restore??'이름 뽑기'}</button>}</div>}
   {(notice||error)&&!p.cue&&!pause&&<p className="side-notice" role="status">{error??notice}</p>}
   {p.cue&&<div className={`side-narration cue-${p.cue.id}`}><small>이야기</small><p>{narration[p.cue.id][p.cue.index]}</p><button autoFocus onClick={()=>{store.getState().cueNext();requestAnimationFrame(focus);}}>계속 듣기</button></div>}
   {pause&&<div className="pro-overlay"><article className="pro-paper" role="dialog" aria-modal="true" aria-label="공연 일시정지"><h2>공연을 잠시 멈추다</h2><p>좌우 이동 · Space 낮은 점프<br/>숫자 키 / 휠 단어 선택 · E 끼우기 · R 뽑기</p><p>단어는 소모되지 않습니다. 끼운 문장은 자동 저장됩니다.</p><button autoFocus onClick={()=>{setPause(false);requestAnimationFrame(focus);}}>계속 탐험하기</button><button onClick={()=>{checkpoint();onTitle();}}>타이틀로</button></article></div>}
   {p.dungeon.stability===0&&<div className="pro-overlay"><article className="pro-paper"><h2>접힌 무대 펼치기</h2><p>이전 저장의 단어와 편집은 남아 있습니다.</p><button onClick={()=>{store.getState().retry();focus();}}>이 구역에서 다시 시작</button></article></div>}
  </div>
  <div className="side-wordbelt" aria-label="모아 둔 단어"><span>손에 들 말<br/><small>숫자 / 휠</small></span>{words.map((k,i)=><button key={k.id} className={k.id===selected?'selected':''} aria-pressed={k.id===selected} onClick={()=>select(k.id)}><kbd>{i+1}</kbd>{k.label}</button>)}{!words.length&&<p>입구의 접힌 대화에서 놓친 말을 주울 수 있습니다.</p>}</div>
  <div className="pro-dungeon-foot"><p>{room.objective}</p><span>A / D 이동 · Space 점프 · E 상호작용 · R 뽑기</span></div>
 </section>;
}
