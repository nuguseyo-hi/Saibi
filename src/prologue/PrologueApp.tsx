import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useStore } from 'zustand';
import LegacyGame from '../App';
import { ChoiceList, DialogueBox, DialogueLog } from '../components/Dialogue';
import { getDialogue } from '../domain/scenario';
import { scenario, meta, keywords, questions, village } from './content';
import { createPrologueStore } from './store';
import { PrologueDungeon } from './PrologueDungeon';
import { EDIT_DURATION, RewriteText, RoleHandoff } from './PrologueEditing';
import './prologue.css';
const store=createPrologueStore({getItem:key=>window.localStorage.getItem(key),setItem:(key,value)=>window.localStorage.setItem(key,value)});
function Curtain({id}:{id:string}) {return <div className={`pro-curtain curtain-${id}`} aria-hidden="true"><img src="/assets/prologue/curtain.svg" alt=""/></div>;}
export default function PrologueApp(){
 const game=useStore(store),p=game.progress;
 const [menu,setMenu]=useState(!game.hasSave),[legacy,setLegacy]=useState(false),[confirm,setConfirm]=useState(false),[log,setLog]=useState(false),[ledger,setLedger]=useState(false),[name,setName]=useState(''),[location,setLocation]=useState<string|null>(null);
 const [reduced,setReduced]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 const n=getDialogue(scenario,p.nodeId),m=meta[p.nodeId];
 const [rewriteFinished,setRewriteFinished]=useState(''),[handoffReady,setHandoffReady]=useState(''),[curtain,setCurtain]=useState('');
 const [flight,setFlight]=useState<{text:string;x:number;y:number;dx:number;dy:number}|null>(null);
 const collect=(id:string,button:HTMLButtonElement)=>{if(p.keywords.includes(id))return;const from=button.getBoundingClientRect(),to=document.querySelector('.pro-toolbar')!.getBoundingClientRect();if(!reduced)setFlight({text:keywords.find(k=>k.id===id)!.label,x:from.left,y:from.top,dx:to.right-from.left-80,dy:to.top-from.top});game.collect(id);};
 const transitionBusy=useRef(false),transitionTimers=useRef<ReturnType<typeof setTimeout>[]>([]);
 useEffect(()=>()=>transitionTimers.current.forEach(clearTimeout),[]);
 const edited=m.mode!=='rewrite'||reduced||rewriteFinished===p.nodeId;
 useEffect(()=>{if(m.mode!=='rewrite')return;const timer=setTimeout(()=>setRewriteFinished(p.nodeId),EDIT_DURATION);return()=>clearTimeout(timer);},[p.nodeId,m.mode]);
 const transition=(action:()=>void)=>{
  if(transitionBusy.current)return;
  if(reduced){action();return;}
  transitionBusy.current=true;setCurtain('closing');
  transitionTimers.current.push(setTimeout(()=>{action();setCurtain('opening');transitionTimers.current.push(setTimeout(()=>{setCurtain('');transitionBusy.current=false;},550));},550));
 };
 const next=()=>{
  if(transitionBusy.current)return;
  if(!edited){setRewriteFinished(p.nodeId);return;}
  if(m.mode==='transfer'&&handoffReady!==p.nodeId){document.querySelector<HTMLElement>('.role-control')?.focus();return;}
  const nextId=n.next;
  if(nextId&&meta[nextId].scene!==m.scene)transition(()=>game.advance(p.nodeId));else game.advance(p.nodeId);
 };
 const speaker=(id:string)=>id==='inquisitor'?(p.name||'???'):id==='player'?'당신':'이야기';
 useEffect(()=>{const handler=(e:KeyboardEvent)=>{if(menu||legacy||log||ledger||p.phase!=='story'||e.repeat||!['Enter',' '].includes(e.key)||(e.target as HTMLElement).closest('button,input,textarea,dialog'))return;e.preventDefault();next();};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[game,p.phase,p.nodeId,menu,legacy,log,ledger,edited,handoffReady]);
 if(legacy||p.phase==='church')return <div className="legacy-integration"><button className="back-village" onClick={()=>{if(p.phase==='church')game.village();else setMenu(true);setLegacy(false);}}> {p.phase==='church'?`${p.name} · 세루스로 돌아가기`:'프롤로그 타이틀로'}</button><LegacyGame playerName={p.completed?p.name:undefined}/></div>;
 const start=()=>{game.start();setMenu(false);setConfirm(false);setName('');};
 const title=()=>{setMenu(true);setLog(false);setLedger(false);};
 const scene=['dungeon','core'].includes(p.phase)?'dungeon':m.scene;
 const visual=<div className={`pro-stage scene-${m.scene} ${m.mode==='infiltrate'?'await-touch':''} ${m.mode==='transfer'?'transferring':''}`}>
   <img className="pro-backdrop" src={`/assets/prologue/${m.scene}.svg`} alt=""/>
   {m.scene==='theatre'?<><div className="puppeteer-shadow"/><img className="stage-hand left" src="/assets/prologue/hand.svg" alt="얼굴 없는 인형사의 손"/><img className="stage-hand right" src="/assets/prologue/hand.svg" alt=""/><div className="sun-puppet"><span>☀</span><i/></div><img className="theatre-puppet" src="/assets/prologue/inquisitor.svg" alt="실에 매달린 금발 인형"/><div className="puppet-thread"/></>:
   m.scene==='ruins'?<>{p.playableId==='vessel'&&<img className="pro-actor vessel" src="/assets/prologue/vessel.svg" alt="얼굴이 보이지 않는 검은 로브의 인물"/>}{m.mode!=='transfer'&&<button disabled={m.mode!=='infiltrate'} className={`pro-actor inquisitor ${m.mode==='infiltrate'?'can-enter':''}`} onClick={()=>transition(game.enter)} aria-label="금발 인물의 심상세계로 침투"><img src="/assets/prologue/inquisitor.svg" alt="손상된 갑옷을 입은 금발 인물"/>{m.mode==='infiltrate'&&<span>그의 마음에 손을 대기</span>}</button>}{m.mode==='transfer'&&<RoleHandoff name={p.name} ready={()=>setHandoffReady(p.nodeId)}/>}{m.guardVisible&&<div className={`pro-guard ${m.event==='guard_zero'?'guard-rewrite':''}`}><span>경계도</span><div><i style={{width:`${m.event==='guard_zero'&&!edited?100:p.guard}%`}}/></div><b>{m.event==='guard_zero'&&!edited?100:p.guard}/100</b>{m.event==='guard_zero'&&<em aria-hidden="true">100/100</em>}</div>}</>:
   <img className="pro-actor village-traveler" src="/assets/prologue/priest.svg" alt={`${p.name}, 최초의 사도`}/>}
 </div>;
 return <main className={`prologue-app ${reduced?'reduced-effects':''} phase-${p.phase} scene-${scene} ${curtain?'is-transitioning':''}`} >
  <header className="pro-header"><span>THE FIRST ACT <i/> {menu?'기억은 누구의 것인가':p.phase==='village'?`제1장 · ${p.name}`:'프롤로그 · 최초의 사도'}</span><nav><button aria-pressed={reduced} onClick={()=>setReduced(v=>!v)}>연출 {reduced?'약하게':'보통'}</button>{!menu&&<button onClick={title}>타이틀</button>}</nav></header>
  {menu?<section className="pro-title"><img src="/assets/prologue/theatre.svg" alt="붉은 막과 조잡한 인형극 무대"/><div><p>당신의 자리는 아직, 객석에 있습니다.</p><h1>니알라토텝의 사도</h1><p className="pro-subtitle">THE APOSTLE · PROLOGUE</p>{confirm?<div className="pro-confirm"><p>프롤로그 저장을 교체하고 새 공연을 시작할까요?<br/>기존 에밀리아 테스트 저장은 유지됩니다.</p><button onClick={()=>setConfirm(false)}>취소</button><button onClick={()=>transition(start)}>새 공연 시작</button></div>:<><button className="pro-main-button" onClick={()=>game.hasSave||game.error?setConfirm(true):transition(start)}>막을 올리다</button>{game.hasSave&&<button onClick={()=>setMenu(false)}>이어서 관람하기</button>}<button className="pro-legacy-link" onClick={()=>setLegacy(true)}>기존 에밀리아 테스트 이어하기</button></>}</div></section>:
   (p.phase==='dungeon'||p.phase==='core')?<PrologueDungeon store={store} reduced={reduced} onTitle={title}/>:
   p.phase==='village'?<section className="pro-village"><img src="/assets/prologue/village.svg" alt="변방 마을 세루스"/><img className="village-avatar" src="/assets/prologue/priest.svg" alt={`${p.name}, 이제 당신이 조작하는 최초의 사도`}/><div><p>DAY 01 · 세루스</p><h1>{p.name}, 당신의 사명</h1><p>나는 니알라토텝의 사도다.</p><div className="village-locations">{village.map(v=><button key={v.id} onClick={()=>{game.visit(v.id);setLocation(v.id);}}>{v.name}<small>{p.visited.includes(v.id)?'조사한 장소':'조사하기'}</small></button>)}</div>{location&&<article><h2>{village.find(v=>v.id===location)?.name}</h2><p>{village.find(v=>v.id===location)?.text}</p></article>}<button className="pro-main-button" onClick={game.church}>밤 · 교회에서 방문자 맞이하기</button><small>이후의 교회는 기존 에밀리아 테스트 시나리오로 연결됩니다.</small></div></section>:
   <section className="pro-story" key={m.scene}>
    {visual}
    {m.mode==='transfer'&&<p className="identity-transfer">이제 당신은, {p.name}입니다.</p>}
    <div className="pro-dialogue">
     {p.nodeId==='forced_yes'&&<div className="choices rewritten-choices" aria-label="수정된 대답">{getDialogue(scenario,'rescue').choices!.map((choice,i)=><button disabled className="choice" key={choice.id}><span className="choice-index">0{i+1}</span><span>{choice.id==='no'?<RewriteText before={choice.text} after={n.text} done={edited}/>:choice.text}</span><span aria-hidden="true">↗</span></button>)}</div>}
     {n.choices&&<ChoiceList choices={n.choices} choose={id=>game.choose(n.id,id)}/>}
     {m.mode==='questions'&&<div className="question-menu">{questions.map(q=><button key={q.id} onClick={()=>game.ask(q.id)}>{p.questions.includes(q.id)?'✓ ':''}{q.text}</button>)}<button disabled={p.questions.length!==questions.length} onClick={game.finishQuestions}>질문을 마치다 · {p.questions.length}/3</button></div>}
     {m.mode==='name'&&<form className="pro-name" onSubmit={e=>{e.preventDefault();game.name(name);}}><label htmlFor="apostle-name">새로운 이름</label><input id="apostle-name" value={name} onChange={e=>setName(e.target.value)} maxLength={20} autoComplete="off" autoFocus placeholder="1~20자"/><button type="submit">이름을 주다</button></form>}
     <DialogueBox hint={m.mode==='transfer'&&handoffReady!==p.nodeId?'좌우 방향키로 금발 인물을 움직여 보세요.':m.mode==='rewrite'&&!edited?'다음 또는 Enter로 편집을 완성하고, 한 번 더 누르면 진행합니다.':m.mode==='questions'?'세 질문을 모두 확인하면 다음 장면으로 진행할 수 있습니다.':m.mode==='infiltrate'?'금발 인물을 클릭해 심상세계로 들어가세요.':m.mode==='name'?'이름을 입력하고 확인하세요.':undefined} node={p.nodeId==='forced_yes'?{...n,text:getDialogue(scenario,'rescue').text}:n} speaker={speaker(p.nodeId==='forced_yes'?'narrator':n.speaker)} disabledNext={!['dialogue','rewrite','transfer'].includes(m.mode)||(m.mode==='transfer'&&handoffReady!==p.nodeId)} onNext={next} content={m.mode==='rewrite'?(p.nodeId==='forced_yes'?getDialogue(scenario,'rescue').text:<RewriteText before={m.before??(p.rejectedNode?getDialogue(scenario,p.rejectedNode).text:'')} after={n.text} done={edited} hand={m.event==='guard_zero'}/>):m.segments?<>{m.segments.map(s=>s.keywordId?<button className={`collect-word ${p.keywords.includes(s.keywordId)?'collected':''}`} key={s.id} onClick={event=>collect(s.keywordId!,event.currentTarget)} aria-label={`${s.text} ${p.keywords.includes(s.keywordId)?'수집됨':'키워드 수집'}`}>{s.text}{p.keywords.includes(s.keywordId)&&<sup>✓</sup>}</button>:<span key={s.id}>{s.text}</span>)}</>:undefined}/>
     {game.actionError&&<p role="alert">{game.actionError}</p>}
     <div className="pro-toolbar"><span>{m.mode==='infiltrate'?'금발 인물에 마우스를 올리고 클릭하세요.':m.segments?'밑줄 친 단어를 클릭해 기억하세요. 다음 대사로 넘어가도 읽은 키워드는 보관됩니다.':'클릭 또는 Enter로 진행'}</span><div><button onClick={()=>setLedger(true)}>키워드 {p.keywords.length}/5</button><button onClick={()=>setLog(true)}>대화 기록</button></div></div>
    </div>
   </section>}
  {curtain&&<Curtain id={curtain}/>}
  {flight&&<span className="keyword-flight" aria-hidden="true" onAnimationEnd={()=>setFlight(null)} style={{left:flight.x,top:flight.y,'--flight-x':`${flight.dx}px`,'--flight-y':`${flight.dy}px`} as CSSProperties}>{flight.text}</span>}
  <div className={`pro-save ${game.error?'error':''}`} role="status">{game.error?<>{game.error}{game.hasSave&&<button onClick={game.retrySave}>저장 재시도</button>}</>:game.hasSave?'진행 자동 저장됨':''}</div>
  {log&&<DialogueLog entries={p.log.map(l=>({...l,kind:'dialogue'}))} name={speaker} close={()=>setLog(false)}/>}
  {ledger&&<div className="pro-ledger-overlay" role="dialog" aria-modal="true" aria-label="키워드 목록"><article className="pro-paper"><h2>마음에 닿는 말</h2><div className="keyword-ledger">{keywords.map(k=><span key={k.id} className={p.keywords.includes(k.id)?'owned':''}>{p.keywords.includes(k.id)?k.label:'아직 모르는 말'}</span>)}</div><p>대화에서 읽은 키워드는 다음 대사로 넘어갈 때 보관됩니다. 심상세계에서는 이 말들을 문장에 넣을 수 있습니다.</p><button autoFocus onClick={()=>setLedger(false)}>닫기</button></article></div>}
 </main>;
}
