import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import scenarioData from './content/scenarios/intro.json';
import { getDialogue, parseScenario } from './domain/scenario';
import { createGameStore } from './store/gameStore';
import { BackgroundLayer, CharacterSprite, Sigil } from './components/Scene';
import { ChoiceList, DialogueBox, DialogueLog } from './components/Dialogue';
import mindData from './content/mind-scenes/bells.json';
import { parseMindEvents } from './domain/mind/editing';
import { createSavePort } from './services/storage';
import { MindEditScreen } from './screens/MindEditScreen';
import { MemoryRecord } from './components/MemoryRecord';
import dungeonData from './content/dungeons/emilia.json';
import { canEnter, initialInfiltration, parseDungeon } from './dungeon/model';
import { DungeonScreen, DungeonOutcome } from './screens/DungeonScreen';

// Parse once at the content boundary, before creating any runtime state.
const scenario = parseScenario(scenarioData);
const mindEvents = parseMindEvents(mindData, scenario);
const dungeon = parseDungeon(dungeonData);
if (!scenario.nodes.some(n => n.id === dungeon.sourceNodeId) || !scenario.nodes.some(n => n.id === dungeon.successNext) || !mindEvents.some(e => e.id === dungeon.coreEventId && e.characterId === dungeon.characterId)) throw new Error('던전과 시나리오 연결 오류');
const gameStore = createGameStore(scenario, mindEvents, createSavePort(() => window.localStorage, scenario, mindEvents, dungeon), { dungeon, development: import.meta.env.DEV });
const speakerName = (id: string) => id === 'narrator' ? '이야기' : id === 'player' ? '당신' : scenario.characters.find(c => c.id === id)?.name ?? id;

export default function App() {
  const game = useStore(gameStore);
  const [showLog, setShowLog] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [confirmNewGame, setConfirmNewGame] = useState(false);
  const node = getDialogue(scenario, game.nodeId);
  const mindEvent = mindEvents.find(e => e.id === game.activeMind?.eventId);
  const isConfession = node.presentation === 'confession';
  const character = scenario.characters.find(c => c.id === node.characterId);
  const infiltration = game.infiltration[dungeon.characterId] ?? initialInfiltration(dungeon);
  const isDungeonEntry = node.id === dungeon.sourceNodeId;
  const entryAllowed = !isDungeonEntry || canEnter(dungeon, infiltration);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (showLog || showMemory || game.screen !== 'dialogue' || event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return;
      if ((event.target as HTMLElement).closest('button, dialog, input, textarea, select')) return;
      event.preventDefault();
      game.advance(node.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game, node.id, showLog, showMemory]);
  const toTitle = () => { setShowLog(false); setShowMemory(false); game.returnToTitle(); };

  const newGame = () => {
    if (game.checkpoint || game.saveError) { setConfirmNewGame(true); return; }
    game.start();
  };

  return <main className={`game-viewport ${game.screen === 'title' ? 'is-title' : game.screen === 'dungeon' ? 'is-dungeon' : game.screen === 'dungeonResult' ? 'is-dungeon-result' : game.screen === 'mindEdit' ? 'is-mind' : 'is-dialogue'} ${isConfession ? 'is-confession' : ''} ${game.screen === 'mindEdit' && game.dungeon?.status === 'editing' ? 'is-dungeon-edit' : ''}`}>
    <BackgroundLayer src={scenario.background} />
    <div className="vignette" aria-hidden="true" />
    <div className="grain" aria-hidden="true" />
    <header className="game-header">
      <div className="brand"><Sigil /><span>{scenario.subtitle}</span></div>
      <div className="header-right"><span className="chapter-label">{game.screen === 'title' ? 'A GOTHIC VISUAL NOVEL' : scenario.chapter}</span>{game.screen !== 'title' && <button className="text-button" onClick={toTitle}>타이틀로</button>}</div>
    </header>
    {game.screen === 'title' ? <section className="title-screen" aria-labelledby="game-title">
      <p className="eyebrow">믿음과 망각의 경계에서</p>
      <div className="title-ornament"><span /><Sigil /><span /></div>
      <h1 id="game-title">{scenario.title}</h1>
      <p className="title-english">{scenario.subtitle}</p>
      <p className="title-description">모든 기도에는, 귀 기울이는 존재가 있다.</p>
      {confirmNewGame ? <div className="new-game-confirm" role="group" aria-labelledby="new-game-question">
        <p id="new-game-question">기존 저장을 교체하고 처음부터 시작할까요?</p>
        <div><button className="secondary-button" onClick={() => setConfirmNewGame(false)} autoFocus>취소</button><button className="primary-button" onClick={() => { setConfirmNewGame(false); game.start(); }}>새 게임 시작</button></div>
      </div> : <button className="start-button" onClick={newGame}><span aria-hidden="true">✧</span>{game.checkpoint ? '새 게임' : '게임 시작'}<span aria-hidden="true">→</span></button>}
      {game.checkpoint && !confirmNewGame && <button className="continue-button" onClick={game.resume}>이어서 플레이 →</button>}
{import.meta.env.DEV && !confirmNewGame && <button className="dev-dungeon-button" onClick={game.debugDungeon}>DEV · 심상던전 직접 입장 (테스트 진행 초기화)</button>}
      <p className="title-note">문을 열고, 첫 번째 방문자를 맞이하세요.</p>
    </section> : game.screen === 'dungeon' && game.dungeon ? <DungeonScreen data={dungeon} progress={game.dungeon} actions={{
      read: () => gameStore.getState().dungeon!, checkpoint: game.checkpointDungeon, inspect: game.inspectDungeon, travel: game.travelDungeon,
      solve: game.solveDungeonPuzzle, settle: game.settleDungeonDoors, hit: game.dungeonHit, core: game.openDungeonCore, retreat: game.retreatDungeon,
    }} /> : game.screen === 'dungeonResult' && game.dungeon ? <DungeonOutcome data={dungeon} progress={game.dungeon} finish={game.finishDungeon} /> : game.screen === 'mindEdit' && mindEvent && game.activeMind ? <MindEditScreen key={game.activeMind.id} event={mindEvent} characterName={speakerName(mindEvent.characterId)} error={game.actionError} confirm={draft => game.confirmEdit(game.activeMind!.id, draft)} cancel={() => game.cancelEdit(game.activeMind!.id)} /> : <section className="novel-screen" aria-label="비주얼노벨 대화">
      <div className="location"><span className="location-dot" /><div><span className="eyebrow">{isConfession ? 'CONFESSION' : 'SANCTUARY'}</span><p>{isConfession ? '고해성사' : scenario.location}</p></div></div>
      {character && <CharacterSprite key={character.id} character={character} />}
      <div className="dialogue-area">
        {isDungeonEntry && <div className="infiltration-status"><span>제 {infiltration.night} 밤 · 경계도 {infiltration.guard} / 진입 기준 {dungeon.rules.maxGuard} 이하 · 침투 {infiltration.attempts}/{dungeon.rules.maxAttempts}</span>{infiltration.attempts > 0 && <button onClick={game.nextNight}>다음 밤에 다시 만나기 →</button>}{!entryAllowed && <p>오늘은 더 침투할 수 없습니다. 다음 밤에는 경계도와 침투 기회가 회복됩니다.</p>}</div>}
        {game.actionError && <p className="action-error" role="alert">{game.actionError}</p>}
        {node.choices && <ChoiceList choices={node.choices} choose={id => game.choose(node.id, id)} />}
        {node.ending && <div className="ending-label"><span>{node.ending}</span><button onClick={toTitle}>타이틀로 돌아가기 →</button></div>}
        <DialogueBox disabledNext={!entryAllowed} node={node} speaker={speakerName(node.speaker)} onNext={() => game.advance(node.id)} />
        <div className="novel-toolbar"><span>CHAPTER I <span className="toolbar-divider">/</span> {scenario.chapter.split('·')[1]?.trim()}</span><div className="toolbar-actions"><button onClick={() => setShowMemory(true)}>기억 기록 <span aria-hidden="true">◇</span></button><button onClick={() => setShowLog(true)}>대화 기록 <span aria-hidden="true">☷</span></button></div></div>
      </div>
    </section>}
    {game.screen === 'title' && <footer className="title-footer"><span>PROLOGUE <span className="footer-rule" /> THE OPEN DOOR</span><span>이야기의 시작 · 01</span></footer>}
    <div className={`save-indicator ${game.saveError ? 'has-error' : ''}`} role="status">{game.saveError ? <><span>{game.saveError}</span>{game.checkpoint && <button onClick={game.retrySave}>저장 재시도</button>}</> : game.saveStatus === 'saved' ? '진행 자동 저장됨' : null}</div>
    {showMemory && <MemoryRecord results={game.editResults} events={mindEvents} close={() => setShowMemory(false)} />}
    {showLog && <DialogueLog entries={game.log} name={speakerName} close={() => setShowLog(false)} />}
  </main>;
}
