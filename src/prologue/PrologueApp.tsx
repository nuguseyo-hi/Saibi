import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import LegacyGame from '../App';
import { ChoiceList, DialogueBox, DialogueLog } from '../components/Dialogue';
import { MindEditScreen } from '../screens/MindEditScreen';
import { getDialogue } from '../domain/scenario';
import { scenario, meta, keywords, questions, identityEvent, village } from './content';
import { createPrologueStore } from './store';
import { PrologueDungeon } from './PrologueDungeon';
import './prologue.css';
const store=createPrologueStore({getItem:key=>window.localStorage.getItem(key),setItem:(key,value)=>window.localStorage.setItem(key,value)});
function Curtain({id}:{id:string}) {return <div className="pro-curtain" key={id} aria-hidden="true"><img src="/assets/prologue/curtain.svg" alt=""/></div>;}
export default function PrologueApp(){
 const game=useStore(store),p=game.progress;
 const [menu,setMenu]=useState(!game.hasSave),[legacy,setLegacy]=useState(false),[confirm,setConfirm]=useState(false),[log,setLog]=useState(false),[ledger,setLedger]=useState(false),[name,setName]=useState(''),[location,setLocation]=useState<string|null>(null);
 const [reduced,setReduced]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 const n=getDialogue(scenario,p.nodeId),m=meta[p.nodeId];
 const speaker=(id:string)=>id==='inquisitor'?(p.name||'???'):id==='player'?'당신':'이야기';
 useEffect(()=>{const handler=(e:KeyboardEvent)=>{if(menu||legacy||log||ledger||p.phase!=='story'||e.repeat||!['Enter',' '].includes(e.key)||(e.target as HTMLElement).closest('button,input,textarea,dialog'))return;e.preventDefault();game.advance(p.nodeId);};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[game,p.phase,p.nodeId,menu,legacy,log,ledger]);
 if(legacy||p.phase==='church')return <div className="legacy-integration"><button className="back-village" onClick={()=>{if(p.phase==='church')game.village();else setMenu(true);setLegacy(false);}}> {p.phase==='church'?`${p.name} · 세루스로 돌아가기`:'프롤로그 타이틀로'}</button><LegacyGame playerName={p.completed?p.name:undefined}/></div>;
 const start=()=>{game.start();setMenu(false);setConfirm(false);setName('');};
 const title=()=>{setMenu(true);setLog(false);setLedger(false);};
 const scene=p.phase==='dungeon'?'dungeon':p.phase==='core'?'altar':m.scene;
 const visual=<div className={`pro-stage scene-${m.scene} ${m.mode==='infiltrate'?'await-touch':''} ${m.mode==='transfer'?'transferring':''}`}>
   <img className="pro-backdrop" src={`/assets/prologue/${m.scene}.svg`} alt=""/>
   {m.scene==='theatre'?<><div className="puppeteer-shadow"/><img className="stage-hand left" src="/assets/prologue/hand.svg" alt="얼굴 없는 인형사의 손"/><img className="stage-hand right" src="/assets/prologue/hand.svg" alt=""/><div className="sun-puppet"><span>☀</span><i/></div><img className="theatre-puppet" src="/assets/prologue/inquisitor.svg" alt="실에 매달린 금발 인형"/><div className="puppet-thread"/></>:
   m.scene==='ruins'?<>{p.playableId==='vessel'&&<img className="pro-actor vessel" src="/assets/prologue/vessel.svg" alt="얼굴이 보이지 않는 검은 로브의 인물"/>}<button disabled={m.mode!=='infiltrate'} className={`pro-actor inquisitor ${m.mode==='infiltrate'?'can-enter':''}`} onClick={game.enter} aria-label="금발 인물의 심상세계로 침투"><img src="/assets/prologue/inquisitor.svg" alt="손상된 갑옷을 입은 금발 인물"/>{m.mode==='infiltrate'&&<span>그의 마음에 손을 대기</span>}</button>{m.guardVisible&&<div className={`pro-guard ${m.event==='guard_zero'?'guard-rewrite':''}`}><span>경계도</span><div><i style={{width:`${p.guard}%`}}/></div><b>{p.guard}/100</b>{m.event==='guard_zero'&&<em aria-hidden="true">100/100</em>}</div>}</>:
   <img className="pro-actor village-traveler" src="/assets/prologue/priest.svg" alt={`${p.name}, 최초의 사도`}/>}
 </div>;
 return <main className={`prologue-app ${reduced?'reduced-effects':''} phase-${p.phase} scene-${scene}`}>
  <header className="pro-header"><span>THE FIRST ACT <i/> {menu?'기억은 누구의 것인가':p.phase==='village'?`제1장 · ${p.name}`:'프롤로그 · 최초의 사도'}</span><nav><button aria-pressed={reduced} onClick={()=>setReduced(v=>!v)}>연출 {reduced?'약하게':'보통'}</button>{!menu&&<button onClick={title}>타이틀</button>}</nav></header>
  {menu?<section className="pro-title"><img src="/assets/prologue/theatre.svg" alt="붉은 막과 조잡한 인형극 무대"/><div><p>당신의 자리는 아직, 객석에 있습니다.</p><h1>니알라토텝의 사도</h1><p className="pro-subtitle">THE APOSTLE · PROLOGUE</p>{confirm?<div className="pro-confirm"><p>프롤로그 저장을 교체하고 새 공연을 시작할까요?<br/>기존 에밀리아 테스트 저장은 유지됩니다.</p><button onClick={()=>setConfirm(false)}>취소</button><button onClick={start}>새 공연 시작</button></div>:<><button className="pro-main-button" onClick={()=>game.hasSave||game.error?setConfirm(true):start()}>막을 올리다</button>{game.hasSave&&<button onClick={()=>setMenu(false)}>이어서 관람하기</button>}<button className="pro-legacy-link" onClick={()=>setLegacy(true)}>기존 에밀리아 테스트 이어하기</button></>}</div></section>:
   p.phase==='dungeon'?<PrologueDungeon store={store} reduced={reduced} onTitle={title}/>:
   p.phase==='core'?<div className="pro-core is-dungeon-edit"><img className="core-hand" src="/assets/prologue/hand.svg" alt="봉인을 해체하는 거대한 손"/><MindEditScreen event={identityEvent} characterName={speaker('inquisitor')} error={game.actionError} confirm={game.confirmCore} cancel={game.cancelCore} cancelHint="취소하면 제단으로 돌아갑니다. 확정해야 새로운 정체성이 기억에 남습니다."/></div>:
   p.phase==='village'?<section className="pro-village"><img src="/assets/prologue/village.svg" alt="변방 마을 세루스"/><img className="village-avatar" src="/assets/prologue/priest.svg" alt={`${p.name}, 이제 당신이 조작하는 최초의 사도`}/><div><p>DAY 01 · 세루스</p><h1>{p.name}, 당신의 사명</h1><p>나는 니알라토텝의 사도다.</p><div className="village-locations">{village.map(v=><button key={v.id} onClick={()=>{game.visit(v.id);setLocation(v.id);}}>{v.name}<small>{p.visited.includes(v.id)?'조사한 장소':'조사하기'}</small></button>)}</div>{location&&<article><h2>{village.find(v=>v.id===location)?.name}</h2><p>{village.find(v=>v.id===location)?.text}</p></article>}<button className="pro-main-button" onClick={game.church}>밤 · 교회에서 방문자 맞이하기</button><small>이후의 교회는 기존 에밀리아 테스트 시나리오로 연결됩니다.</small></div></section>:
   <section className="pro-story" key={p.nodeId}>
    {visual}
    {m.mode==='rewrite'&&<div className={`pro-rewrite ${m.event==='guard_zero'?'with-hand':''}`}><span className="before-rewrite">{m.before??(p.rejectedNode?getDialogue(scenario,p.rejectedNode).text:'')}</span><span className="after-rewrite">{n.text}</span>{m.event==='guard_zero'&&<img src="/assets/prologue/hand.svg" alt="대사의 글자를 건드리는 거대한 손"/>}</div>}
    {p.nodeId==='intervention'&&p.rejectedNode&&<div className="pinned-response">{getDialogue(scenario,p.rejectedNode).text}</div>}
    {m.mode==='transfer'&&<p className="identity-transfer">이제 당신은, {p.name}입니다.</p>}
    {p.nodeId==='return_0'&&<div className="pro-collapse" aria-hidden="true"><div className="final-strings"/><img src="/assets/prologue/inquisitor.svg" alt=""/><p>{[...'나는 ■■■■■■■의 사도다.'].map((letter,i)=><span key={i} style={{animationDelay:`${i*.035}s`}}>{letter}</span>)}</p></div>}
    <div className="pro-dialogue">
     {n.choices&&<ChoiceList choices={n.choices} choose={id=>game.choose(n.id,id)}/>}
     {m.mode==='questions'&&<div className="question-menu">{questions.map(q=><button key={q.id} onClick={()=>game.ask(q.id)}>{p.questions.includes(q.id)?'✓ ':''}{q.text}</button>)}<button disabled={p.questions.length!==questions.length} onClick={game.finishQuestions}>질문을 마치다 · {p.questions.length}/3</button></div>}
     {m.mode==='name'&&<form className="pro-name" onSubmit={e=>{e.preventDefault();game.name(name);}}><label htmlFor="apostle-name">새로운 이름</label><input id="apostle-name" value={name} onChange={e=>setName(e.target.value)} maxLength={20} autoComplete="off" autoFocus placeholder="1~20자"/><button type="submit">이름을 주다</button></form>}
     <DialogueBox hint={m.mode==='questions'?'세 질문을 모두 확인하면 다음 장면으로 진행할 수 있습니다.':m.mode==='infiltrate'?'금발 인물을 클릭해 심상세계로 들어가세요.':m.mode==='name'?'이름을 입력하고 확인하세요.':undefined} node={n} speaker={speaker(n.speaker)} disabledNext={!['dialogue','rewrite','transfer'].includes(m.mode)} onNext={()=>game.advance(n.id)} content={m.segments?<>{m.segments.map(s=>s.keywordId?<button className={`collect-word ${p.keywords.includes(s.keywordId)?'collected':''}`} key={s.id} onClick={()=>game.collect(s.keywordId!)} aria-label={`${s.text} ${p.keywords.includes(s.keywordId)?'수집됨':'키워드 수집'}`}>{s.text}{p.keywords.includes(s.keywordId)&&<sup>✓</sup>}</button>:<span key={s.id}>{s.text}</span>)}</>:undefined}/>
     {game.actionError&&<p role="alert">{game.actionError}</p>}
     <div className="pro-toolbar"><span>{m.mode==='infiltrate'?'금발 인물에 마우스를 올리고 클릭하세요.':m.segments?'밑줄 친 단어를 클릭해 기억해 두세요.':'클릭 또는 Enter로 진행'}</span><div><button onClick={()=>setLedger(true)}>키워드 {p.keywords.length}/5</button><button onClick={()=>setLog(true)}>대화 기록</button></div></div>
    </div>
   </section>}
  {!menu&&<Curtain id={`${scene}-${p.phase}`}/>}
  <div className={`pro-save ${game.error?'error':''}`} role="status">{game.error?<>{game.error}{game.hasSave&&<button onClick={game.retrySave}>저장 재시도</button>}</>:game.hasSave?'진행 자동 저장됨':''}</div>
  {log&&<DialogueLog entries={p.log.map(l=>({...l,kind:'dialogue'}))} name={speaker} close={()=>setLog(false)}/>}
  {ledger&&<div className="pro-ledger-overlay" role="dialog" aria-modal="true" aria-label="키워드 목록"><article className="pro-paper"><h2>마음에 닿는 말</h2><div className="keyword-ledger">{keywords.map(k=><span key={k.id} className={p.keywords.includes(k.id)?'owned':''}>{p.keywords.includes(k.id)?k.label:'아직 모르는 말'}</span>)}</div><p>놓친 말은 심상세계의 접힌 대화에서도 찾을 수 있습니다.</p><button autoFocus onClick={()=>setLedger(false)}>닫기</button></article></div>}
 </main>;
}
