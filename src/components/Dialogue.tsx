import { useEffect, useRef } from 'react';
import type { Choice, DialogueNode } from '../domain/scenario';
import type { LogEntry } from '../store/gameStore';

export function ChoiceList({ choices, choose }: { choices: Choice[]; choose: (id: string) => void }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => { first.current?.focus(); }, [choices]);
  return <div className="choices" aria-label="대답 선택">{choices.map((c, i) => <button ref={i === 0 ? first : undefined} className="choice" key={c.id} onClick={() => choose(c.id)}><span className="choice-index">0{i + 1}</span><span>{c.text}</span><span aria-hidden="true">↗</span></button>)}</div>;
}
export function DialogueBox({ node, speaker, onNext }: { node: DialogueNode; speaker: string; onNext: () => void }) {
  return <div className="dialogue-panel">
    <div className="speaker"><span className="speaker-line" />{speaker}<span className="speaker-caption">{node.speaker === 'narrator' ? 'NARRATION' : 'DIALOGUE'}</span></div>
    <p className="dialogue-text" key={node.id} aria-live="polite">{node.text}</p>
    <div className="dialogue-bottom"><span>{node.choices ? '당신의 대답을 선택하세요' : node.ending ? '첫 만남의 기록이 남았습니다' : '대화창을 클릭하거나 Enter 키로 진행'}</span>{node.next && <button className="next-button" onClick={onNext} aria-label="다음 대사">다음 <span aria-hidden="true">◇</span></button>}</div>
    {node.next && <button className="dialogue-hitarea" aria-label="대화창 클릭하여 다음 대사" onClick={onNext} tabIndex={-1} />}
  </div>;
}
export function DialogueLog({ entries, name, close }: { entries: LogEntry[]; name: (id: string) => string; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return <dialog ref={dialog} className="log-dialog" onCancel={close} aria-labelledby="log-title">
    <div className="flex items-center justify-between gap-8"><h2 id="log-title">대화 기록</h2><button className="text-button" onClick={close} autoFocus>닫기 ×</button></div>
    <div className="log-entries">{entries.map((e, i) => <article key={i}><span>{e.kind === 'choice' ? '당신의 선택' : name(e.speaker)}</span><p>{e.text}</p></article>)}</div>
  </dialog>;
}
