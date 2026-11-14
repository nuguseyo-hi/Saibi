import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import scenarioData from './content/scenarios/intro.json';
import { getNode, parseScenario } from './domain/scenario';
import { createGameStore } from './store/gameStore';
import { BackgroundLayer, CharacterSprite, Sigil } from './components/Scene';
import { ChoiceList, DialogueBox, DialogueLog } from './components/Dialogue';

// Parse once at the content boundary, before creating any runtime state.
const scenario = parseScenario(scenarioData);
const gameStore = createGameStore(scenario);
const speakerName = (id: string) => id === 'narrator' ? '이야기' : id === 'player' ? '당신' : scenario.characters.find(c => c.id === id)?.name ?? id;

export default function App() {
  const game = useStore(gameStore);
  const [showLog, setShowLog] = useState(false);
  const node = getNode(scenario, game.nodeId);
  const character = scenario.characters.find(c => c.id === node.characterId);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (showLog || game.screen !== 'dialogue' || event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return;
      if ((event.target as HTMLElement).closest('button, dialog, input, textarea, select')) return;
      event.preventDefault();
      game.advance(node.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [game, node.id, showLog]);
  const toTitle = () => { setShowLog(false); game.returnToTitle(); };

  return <main className={`game-viewport ${game.screen === 'title' ? 'is-title' : 'is-dialogue'}`}>
    <BackgroundLayer src={scenario.background} />
    <div className="vignette" aria-hidden="true" />
    <div className="grain" aria-hidden="true" />
    <header className="game-header">
      <div className="brand"><Sigil /><span>{scenario.subtitle}</span></div>
      <div className="header-right"><span className="chapter-label">{game.screen === 'title' ? 'A GOTHIC VISUAL NOVEL' : scenario.chapter}</span>{game.screen === 'dialogue' && <button className="text-button" onClick={toTitle}>타이틀로</button>}</div>
    </header>
    {game.screen === 'title' ? <section className="title-screen" aria-labelledby="game-title">
      <p className="eyebrow">믿음과 망각의 경계에서</p>
      <div className="title-ornament"><span /><Sigil /><span /></div>
      <h1 id="game-title">{scenario.title}</h1>
      <p className="title-english">{scenario.subtitle}</p>
      <p className="title-description">모든 기도에는, 귀 기울이는 존재가 있다.</p>
      <button className="start-button" onClick={game.start}><span aria-hidden="true">✧</span>게임 시작<span aria-hidden="true">→</span></button>
      <p className="title-note">문을 열고, 첫 번째 방문자를 맞이하세요.</p>
    </section> : <section className="novel-screen" aria-label="비주얼노벨 대화">
      <div className="location"><span className="location-dot" /><div><span className="eyebrow">SANCTUARY</span><p>{scenario.location}</p></div></div>
      {character && <CharacterSprite key={character.id} character={character} />}
      <div className="dialogue-area">
        {node.choices && <ChoiceList choices={node.choices} choose={id => game.choose(node.id, id)} />}
        {node.ending && <div className="ending-label"><span>첫 만남 · {node.ending}</span><button onClick={toTitle}>타이틀로 돌아가기 →</button></div>}
        <DialogueBox node={node} speaker={speakerName(node.speaker)} onNext={() => game.advance(node.id)} />
        <div className="novel-toolbar"><span>CHAPTER I <span className="toolbar-divider">/</span> {scenario.chapter.split('·')[1]?.trim()}</span><button onClick={() => setShowLog(true)}>대화 기록 <span aria-hidden="true">☷</span></button></div>
      </div>
    </section>}
    {game.screen === 'title' && <footer className="title-footer"><span>PROLOGUE <span className="footer-rule" /> THE OPEN DOOR</span><span>이야기의 시작 · 01</span></footer>}
    {showLog && <DialogueLog entries={game.log} name={speakerName} close={() => setShowLog(false)} />}
  </main>;
}
