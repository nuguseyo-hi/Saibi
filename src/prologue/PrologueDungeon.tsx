import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import type Phaser from 'phaser';
import type { DungeonScene } from '../dungeon/DungeonScene';
import type { DungeonObject, Point } from '../dungeon/model';
import { dungeon, rules, keywords, narration, reverseMemory } from './content';
import { applyRule, exitAvailable } from './environment';
import type { PrologueStore } from './store';
export function PrologueDungeon({store,reduced,onTitle}:{store:PrologueStore;reduced:boolean;onTitle:()=>void}) {
 const p=useStore(store,s=>s.progress),error=useStore(store,s=>s.actionError);
 const host=useRef<HTMLDivElement>(null),scene=useRef<DungeonScene|null>(null);
 const [panel,setPanel]=useState<DungeonObject|'pause'|'keywords'|null>(null),[option,setOption]=useState(''),[nearby,setNearby]=useState<DungeonObject|null>(null),[loaded,setLoaded]=useState(false),[loadError,setLoadError]=useState(false);
 const rule=panel&&typeof panel==='object'?rules.find(r=>r.objectId===panel.id):undefined;
 let environment=p.environment;
 try{if(rule&&option)environment=applyRule(p.environment,rule,option,p.keywords);}catch{/* Unowned words never affect even the preview. */}
 const latest=useRef({p,panel,environment,reduced});latest.current={p,panel,environment,reduced};
 const focus=()=>host.current?.focus();
 const close=()=>{setPanel(null);setOption('');requestAnimationFrame(focus);};
 const checkpoint=()=>{if(scene.current)store.getState().checkpoint(scene.current.position());};
 useEffect(()=>{
  let disposed=false,game:Phaser.Game|undefined;const element=host.current!;
  const paused=()=>!!latest.current.panel||!!latest.current.p.cue||latest.current.p.dungeon.stability===0||document.hidden||!element.contains(document.activeElement);
  const interact=(o:DungeonObject,point:Point)=>{
   if(o.kind==='door'){store.getState().travel(o.id,point);return;}
   if(!store.getState().inspect(o.id,point))return;
   if(o.id==='betrayal_memory')return;
   if(o.id==='identity_belief'&&store.getState().progress.environment.identity==='unsealed'){store.getState().core();return;}
   const r=rules.find(r=>r.objectId===o.id);setOption(r?.options.find(x=>x.value===store.getState().progress.environment[r.stateKey])?.id??r?.options[0].id??'');setPanel(o);
  };
  void Promise.all([import('phaser'),import('../dungeon/DungeonScene'),import('./TextWorld'),document.fonts.load('400 20px "Memory Serif"').catch(()=>[])]).then(([{default:Phaser},{DungeonScene},{attachTextWorld}])=>{
   if(disposed)return;
   const instance=new DungeonScene(dungeon,{
    read:()=>store.getState().progress.dungeon,paused,interact,nearby:setNearby,checkpoint:pos=>store.getState().checkpoint(pos),
    hit:(id,pos,time)=>{if(!paused())store.getState().hit(id,pos,time);},ready:()=>{if(!disposed)setLoaded(true);},sound:()=>{},
    enemyQuestion:id=>id==='refusal_charger'&&latest.current.environment.punctuation==='question',
    exitAllowed:id=>exitAvailable(id,latest.current.environment),syncPositionKey:()=>{const d=store.getState().progress.dungeon;return `${d.roomId}:${d.position.x}:${d.position.y}`;},
    reducedMotion:()=>latest.current.reduced,
    extend:(scene,player,room)=>attachTextWorld(scene,player,room,()=>latest.current.environment,()=>{if(!paused())store.getState().hit('resistance_enemy',{x:player.x,y:player.y},Date.now());},paused),
   });scene.current=instance;
   game=new Phaser.Game({type:Phaser.AUTO,parent:element,width:1280,height:720,backgroundColor:'#15111c',scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},physics:{default:'arcade',arcade:{gravity:{x:0,y:0},debug:false}},audio:{noAudio:true},scene:[instance]});element.focus();
  }).catch(()=>{if(!disposed)setLoadError(true);});
  const save=()=>{if(scene.current)store.getState().checkpoint(scene.current.position());};window.addEventListener('pagehide',save);window.addEventListener('blur',save);
  return()=>{disposed=true;window.removeEventListener('pagehide',save);window.removeEventListener('blur',save);scene.current=null;game?.destroy(true);element.replaceChildren();};
 },[store]);
 useEffect(()=>{if(p.doorOpensAt===null)return;const timer=setTimeout(()=>store.getState().settle(),Math.max(0,p.doorOpensAt-Date.now())+20);return()=>clearTimeout(timer);},[p.doorOpensAt,store]);
 const room=dungeon.rooms.find(r=>r.id===p.dungeon.roomId)!;
 const specific=typeof panel==='object'&&panel?panel.id:null;
 return <section className="pro-dungeon" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();if(panel)close();else if(!p.cue){checkpoint();setPanel('pause');}}if(e.target===host.current&&e.key.startsWith('Arrow'))e.preventDefault();}}>
  <div className="pro-dungeon-head"><div><small>{room.subtitle}</small><h1>{room.name}</h1></div><div>안정도 <b>{'◆'.repeat(p.dungeon.stability)}{'◇'.repeat(3-p.dungeon.stability)}</b><span>저항 {p.resistance}</span><button onClick={()=>{checkpoint();setPanel('keywords');}}>키워드 {p.keywords.length}/5</button><button onClick={()=>{checkpoint();setPanel('pause');}}>잠시 멈춤</button></div></div>
  <div className="dungeon-frame"><div ref={host} className="phaser-host" tabIndex={0} role="application" aria-label="WASD 또는 방향키 이동, E 조사, Escape 일시정지" onPointerDown={focus}/>
   {!loaded&&<div className="dungeon-loading">{loadError?'무대를 불러오지 못했습니다. 새로고침해 주세요.':'접힌 기억을 펼치는 중…'}</div>}
   {!panel&&!p.cue&&nearby&&<div className="interaction-prompt"><kbd>E</kbd>{nearby.title}</div>}
   {error&&!panel&&<p className="pro-world-error" role="alert">{error}</p>}
   {p.dungeon.stability===0?<div className="pro-overlay"><article className="pro-paper"><h2>무대가 잠시 접혔다</h2><p>괜찮아요, 관객 분. 아직 공연은 끝나지 않았답니다.</p><p>찾은 단어와 확정한 편집은 남습니다.</p><button onClick={()=>{store.getState().retry();close();}}>안정도를 회복하고 이 구역에서 다시 시작</button></article></div>:
    p.cue?<div className={`pro-overlay cue-${p.cue.id}`}><article className="pro-paper">
      {p.cue.id==='memory'&&<div className="memory-puppets"><img src="/assets/prologue/inquisitor.svg" alt="함께 싸운 인형"/><img src="/assets/prologue/inquisitor.svg" alt="등을 돌리는 인형"/></div>}
      {p.cue.id==='seal'&&<div className="reverse-memory"><span>{reverseMemory}</span><img src="/assets/prologue/hand.svg" alt="문장을 가리는 손"/></div>}
      {p.cue.id==='resistance'&&<div className="resistance-words">아니야.　거짓말.　나는 누구인가?</div>}
      <small>이야기</small><p>{narration[p.cue.id][p.cue.index]}</p><button autoFocus onClick={()=>{store.getState().cueNext();requestAnimationFrame(focus);}}>{p.cue.index===narration[p.cue.id].length-1?'다음 장면':'계속 듣기'}</button>
    </article></div>:
    panel&&<div className="pro-overlay"><article className="pro-paper" role="dialog" aria-modal="true" aria-labelledby="world-panel-title">
     <h2 id="world-panel-title">{panel==='pause'?'공연을 잠시 멈추다':panel==='keywords'?'모아 둔 말':panel.title}</h2>
     {panel==='pause'?<><button autoFocus onClick={close}>계속 탐험하기</button><button onClick={()=>{checkpoint();onTitle();}}>타이틀로</button></>:panel==='keywords'?<><div className="keyword-ledger">{keywords.map(k=><span key={k.id} className={p.keywords.includes(k.id)?'owned':''}>{p.keywords.includes(k.id)?k.label:'아직 모르는 말'}</span>)}</div><button onClick={close}>접어 두기</button></>:rule?<>
       <p className={`rule-preview ${rule.kind==='format'&&option==='crossed'?'crossed':''}`}>{rule.options.find(o=>o.id===option)?.text}</p>
       <div className="rule-options">{rule.options.map(o=><button key={o.id} aria-pressed={o.id===option} disabled={!!o.keywordId&&!p.keywords.includes(o.keywordId)} onClick={()=>setOption(o.id)}>{o.label}{o.keywordId&&!p.keywords.includes(o.keywordId)?' · 미수집':''}</button>)}</div>
       {rule.kind==='insert'&&!p.keywords.includes('companion')&&<p>입구의 ‘접힌 대화의 기억’을 조사하면 놓친 키워드를 되찾을 수 있습니다.</p>}
       <small>주변 무대는 미리보기입니다. 취소하면 글자와 충돌 상태가 함께 되돌아갑니다.</small>
       {error&&<p role="alert">{error}</p>}<div className="pro-actions"><button onClick={close}>취소</button><button onClick={()=>{store.getState().commitRule(rule.id,option);if(!store.getState().actionError)close();}}>편집 확정</button></div>
     </>:<>
      <p className="rule-preview">{panel.text}</p>
      {specific==='sealed_belief'&&<p className="gold-seal">☀ 신성한 봉인 — 이 신념은 아직 편집할 수 없습니다.</p>}
      {specific==='altar_seal'&&<><p className="gold-seal">{p.environment.seal==='broken'?'찢어진 봉인 뒤로 길이 펼쳐졌습니다.':'☀ 신성한 문장이 편집을 거부합니다.'}</p>
        <div className={`flip-paper ${p.sealFlipped?'is-back':''}`} key={String(p.sealFlipped)}>{p.sealFlipped?reverseMemory:panel.text}</div>
        {!p.sealAttempted?<button onClick={()=>store.getState().beginSeal()}>봉인된 문장 편집 시도</button>:<><button onClick={()=>store.getState().flip()}>종이 뒤집기</button>{p.environment.seal==='locked'&&<button onClick={()=>{store.getState().help();close();}}>나레이터에게 손을 내밀기</button>}</>}
      </>}
      {specific==='identity_belief'&&<>{p.environment.identity==='sealed'?<><p>이 신념을 어떤 말로 바꾸려 하나요?</p><div className="rule-options">{keywords.filter(k=>['sun','apostle','betrayal'].includes(k.id)).map(k=><button key={k.id} disabled={!p.keywords.includes(k.id)} onClick={()=>{store.getState().beginResistance(k.id);close();}}>{k.label}</button>)}</div>{!p.keywords.includes('sun')&&!p.keywords.includes('apostle')&&!p.keywords.includes('betrayal')&&<p>첫 구역의 접힌 대화에서 단어를 되찾을 수 있습니다.</p>}</>:p.environment.identity==='resisting'?<><p>금빛 문장이 당신의 손을 밀어냅니다.</p><button onClick={()=>{store.getState().help();close();}}>나레이터의 개입을 받아들이기</button></>:null}</>}
      <button autoFocus onClick={close}>무대로 돌아가기</button>
     </>}
    </article></div>}
  </div>
  <div className="pro-dungeon-foot"><p>{room.objective}</p><span>WASD / 방향키 이동 · E 조사 · ESC 멈춤</span></div>
 </section>;
}
