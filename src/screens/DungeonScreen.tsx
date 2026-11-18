import { useCallback, useEffect, useRef, useState } from 'react';
import type { DungeonData, DungeonObject, DungeonProgress, Point } from '../dungeon/model';
import { objectAvailable } from '../dungeon/model';
import type { DungeonScene } from '../dungeon/DungeonScene';
import type Phaser from 'phaser';

export interface DungeonActions {
  read: () => DungeonProgress;
  checkpoint: (point: Point) => void;
  inspect: (id: string, point: Point) => boolean;
  travel: (id: string, point: Point) => void;
  solve: (id: string, option: string) => void;
  settle: () => void;
  hit: (id: string, point: Point, now: number) => void;
  core: (id: string, point: Point) => void;
  retreat: () => void;
}
type Panel = { kind: 'inspect'; object: DungeonObject; locked: boolean } | { kind: 'puzzle'; object: DungeonObject } | { kind: 'memories' } | { kind: 'pause' } | null;
export function DungeonScreen({ data, progress, actions }: { data: DungeonData; progress: DungeonProgress; actions: DungeonActions }) {
  const host=useRef<HTMLDivElement>(null), scene=useRef<DungeonScene|null>(null);
  const [panel,setPanel]=useState<Panel>(null), [nearby,setNearby]=useState<DungeonObject|null>(null);
  const [selected,setSelected]=useState(''), [wordSelected,setWordSelected]=useState(false), [loadError,setLoadError]=useState<string|null>(null);
  const [focused,setFocused]=useState(true);
  const latest=useRef({actions,panel}); latest.current={actions,panel};
  const room=data.rooms.find(r=>r.id===progress.roomId)!;
  const focusGame=()=>host.current?.focus();
  const close=()=>{setPanel(null);requestAnimationFrame(focusGame);};
  const checkpoint=()=>{const p=scene.current?.position();if(p)latest.current.actions.checkpoint(p);};
  const interact=useCallback((object:DungeonObject,position:Point)=>{
    const a=latest.current.actions, d=a.read();
    if(!objectAvailable(d,object)){setPanel({kind:'inspect',object,locked:true});return;}
    if(object.kind==='door'){a.travel(object.id,position);return;}
    if(object.kind==='core'){a.core(object.id,position);return;}
    if(!a.inspect(object.id,position))return;
    if(object.kind==='puzzle') {
      const puzzle=data.puzzles.find(p=>p.id===object.puzzleId)!;
      setSelected(d.puzzles[puzzle.id]?.optionId??puzzle.defaultOption);setWordSelected(false);setPanel({kind:'puzzle',object});
    } else setPanel({kind:'inspect',object,locked:false});
  },[data]);
  useEffect(()=>{
    let disposed=false, game:Phaser.Game|undefined;
    const element=host.current!;
    // Lazy module + cancellation prevents StrictMode's discarded mount creating a canvas.
    void Promise.all([import('phaser'),import('../dungeon/DungeonScene')]).then(([{default:Phaser},{DungeonScene}])=>{
      if(disposed)return;
      const dungeonScene=new DungeonScene(data,{
        read:()=>latest.current.actions.read(),
        paused:()=>!!latest.current.panel||document.hidden||!element.contains(document.activeElement),
        interact,
        checkpoint:p=>latest.current.actions.checkpoint(p),
        hit:(id,p,now)=>latest.current.actions.hit(id,p,now),
        nearby:setNearby,
        sound:cue=>element.dispatchEvent(new CustomEvent('vespers:sound',{detail:{cue},bubbles:true})),
      });
      scene.current=dungeonScene;
      game=new Phaser.Game({type:Phaser.AUTO,parent:element,width:1280,height:720,backgroundColor:'#191522',
        scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},physics:{default:'arcade',arcade:{gravity:{x:0,y:0},debug:false}},
        input:{keyboard:true},audio:{noAudio:true},scene:[dungeonScene],render:{antialias:true},fps:{target:60,forceSetTimeOut:false}});
      element.focus();
    }).catch(()=>{if(!disposed)setLoadError('던전 화면을 불러오지 못했습니다. 페이지를 새로고침해 다시 시도하세요.');});
    const save=()=>{if(scene.current)latest.current.actions.checkpoint(scene.current.position());};
    window.addEventListener('pagehide',save);window.addEventListener('blur',save);
    return()=>{disposed=true;window.removeEventListener('pagehide',save);window.removeEventListener('blur',save);scene.current=null;game?.destroy(true);element.replaceChildren();};
  },[data,interact]);
  useEffect(()=>{
    const deadlines=Object.values(progress.puzzles).filter(p=>!p.open&&p.opensAt!==null).map(p=>p.opensAt!);
    if(!deadlines.length)return;
    const timer=setTimeout(()=>actions.settle(),Math.max(0,Math.min(...deadlines)-Date.now())+30);
    return()=>clearTimeout(timer);
  },[progress.puzzles,actions]);
  const puzzle=panel?.kind==='puzzle'?data.puzzles.find(p=>p.id===panel.object.puzzleId):null;
  const option=puzzle?.options.find(o=>o.id===selected);
  const fragment=panel?.kind==='inspect'?data.fragments.find(f=>f.id===panel.object.fragmentId):null;
  return <section className="dungeon-screen" onKeyDown={e=>{
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(panel)close();else{checkpoint();setPanel({kind:'pause'});}return;}
    if(host.current?.contains(e.target as Node)&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();
  }}>
    <div className="dungeon-heading"><div><p className="eyebrow">EMILIA / MIND LABYRINTH</p><h1>{data.name}</h1></div><div className="dungeon-stats"><span>침투 안정도 <strong aria-label={`${progress.stability} / ${data.rules.stability}`}>{'◆'.repeat(progress.stability)}<i>{'◇'.repeat(data.rules.stability-progress.stability)}</i></strong></span><button onClick={()=>{checkpoint();setPanel({kind:'memories'});}}>기억 파편 <b>{progress.fragments.length} / {data.fragments.length}</b></button></div></div>
    <div className="dungeon-room-heading"><span>{room.subtitle}</span><strong>{room.name}</strong><button onClick={()=>{checkpoint();setPanel({kind:'pause'});}}>일시정지 · ESC</button></div>
    <div className="dungeon-frame">
      <div ref={host} className="phaser-host" tabIndex={0} role="application" aria-label="심상세계 던전. WASD 또는 방향키 이동, E 조사, Escape 일시정지" onPointerDown={focusGame} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} />
      {!focused&&!panel&&<button className="dungeon-focus" onClick={focusGame}>던전을 클릭하면 이동합니다</button>}
      {loadError&&<div className="dungeon-modal"><h2>{loadError}</h2><button onClick={actions.retreat}>고해성사로 돌아가기</button></div>}
      {panel&&<div className="dungeon-overlay"><div className="dungeon-modal" role="dialog" aria-modal="true" aria-labelledby="dungeon-modal-title">
        <p className="eyebrow">{panel.kind==='puzzle'?'REWRITE THE WORLD':'FRAGMENTS OF A MEMORY'}</p>
        <h2 id="dungeon-modal-title">{panel.kind==='pause'?'잠시 멈춘 기억':panel.kind==='memories'?'모아 둔 기억':panel.object.title}</h2>
        {panel.kind==='pause'&&<><p>세상은 당신이 돌아올 때까지 움직이지 않습니다.</p><div className="modal-actions"><button autoFocus className="primary-button" onClick={close}>탐험 계속</button><button className="secondary-button" onClick={actions.retreat}>침투 중단 · 현실로</button></div><small>획득한 파편·확정한 퍼즐은 유지됩니다. 이번 침투 기회는 사용한 것으로 남습니다.</small></>}
        {panel.kind==='memories'&&<><div className="fragment-list">{data.fragments.map(f=><article key={f.id}><h3>{progress.fragments.includes(f.id)?f.title:'아직 찾지 못한 기억'}</h3><p>{progress.fragments.includes(f.id)?f.text:'…'}</p></article>)}</div><button autoFocus className="primary-button" onClick={close}>기억을 접어 두기</button></>}
        {panel.kind==='inspect'&&<><p className="inspect-text">{panel.locked?`아직 접근할 수 없습니다.${panel.object.requiresPuzzle?' 주변의 문장 퍼즐을 먼저 해결하세요.':''}${panel.object.requiresFragments?` 기억 파편 ${panel.object.requiresFragments}개가 필요합니다.`:''}`:fragment?.text??panel.object.text}</p>{fragment&&!panel.locked&&<p className="fragment-collected">◇ 기억 파편 기록됨 · {progress.fragments.length} / 3</p>}<button autoFocus className="primary-button" onClick={close}>기억에서 손을 떼기</button></>}
        {panel.kind==='puzzle'&&puzzle&&option&&<><p className="puzzle-hint">{puzzle.hint}</p><p className="puzzle-sentence">{puzzle.prefix}<button autoFocus className="thought-target is-edited" onClick={()=>setWordSelected(true)} aria-expanded={wordSelected}>{option.replacement}</button>{option.suffix}</p>{!wordSelected&&<p>빛나는 단어를 눌러 의미를 선택하세요.</p>}{wordSelected&&<div className="puzzle-options">{puzzle.options.map(o=><button key={o.id} className={selected===o.id?'chosen':''} aria-pressed={selected===o.id} onClick={()=>setSelected(o.id)}>{o.label}</button>)}</div>}<div className="modal-actions"><button className="secondary-button" onClick={close}>취소</button><button className="primary-button" onClick={()=>{actions.solve(panel.object.id,selected);close();}}>문장 확정</button></div><small>{option.effect==='delayed'?`확정 후 ${option.delayMs/1000}초 뒤 문이 열립니다.`:option.effect==='open'?'확정하면 세계의 규칙이 바뀝니다.':'원래의 규칙을 유지합니다.'}</small></>}
      </div></div>}
      {!panel&&nearby&&<div className="interaction-prompt"><kbd>E</kbd><span>{nearby.title}</span><span className="interaction-sub">{objectAvailable(progress,nearby)?'조사 / 상호작용':'잠겨 있는 기억'}</span></div>}
    </div>
    <div className="dungeon-bottom"><p><span>현재 목표</span>{room.objective}</p><div><kbd>WASD</kbd> / <kbd>↑↓←→</kbd> 이동 <kbd>E</kbd> 조사 <kbd>ESC</kbd> 멈춤</div></div>
  </section>;
}
export function DungeonOutcome({data,progress,finish}:{data:DungeonData;progress:DungeonProgress;finish:()=>void}) {
  const outcome=data.outcome.find(o=>o.resultId===progress.outcomeId), failed=progress.status==='failed';
  return <section className={`dungeon-outcome ${failed?'rejected':outcome?.appearance??''}`}>
    <p className="eyebrow">{failed?'INTRUSION REJECTED':'THE WORD HAS BEEN SPOKEN'}</p>
    <img src="/assets/dungeon/bell.svg" alt="기억 속의 종" />
    <h1>{failed?'심상세계가 당신을 밀어냈다':outcome?.title}</h1>
    <p className="redacted-line">{failed?'「너는 여기에 있어서는 안 된다.」':outcome?.text}</p>
    <p>{failed?`경계도 +${data.rules.guardPenalty}. 이번 밤의 침투 기회를 사용했습니다. 모은 기억과 풀어 둔 퍼즐은 남습니다.`:'확정한 사고가 기억에 새겨졌습니다.'}</p>
    <button className="primary-button" onClick={finish}>고해성사로 돌아가기 →</button>
  </section>;
}
