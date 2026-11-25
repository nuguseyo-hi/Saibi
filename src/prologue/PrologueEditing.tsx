import { useEffect, useRef, useState } from 'react';

export const EDIT_DURATION = 1500;

/** One source of visible text: overwrite in place instead of duplicating the dialogue. */
export function RewriteText({ before, after, done, hand = false }: { before: string; after: string; done: boolean; hand?: boolean }) {
  return <span className={`ink-edit ${done ? 'is-complete' : 'is-editing'}`}>
    <span className="ink-before" aria-hidden="true">{before}</span>
    <span className="ink-after" aria-label={after}>{[...after].map((letter, i) => <span aria-hidden="true" key={i} data-letter={letter} style={{ animationDelay: `${(i % 7) * 35}ms` }}>{letter}</span>)}</span>
    {hand && !done && <img className="ink-hand" src="/assets/prologue/hand.svg" alt="대사의 글자를 고쳐 쓰는 손" />}
  </span>;
}

/** A short input handover inside the existing ruins, with no new persistent game state. */
export function RoleHandoff({ name, ready }: { name: string; ready: () => void }) {
  const [offset, setOffset] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => { host.current?.focus(); }, []);
  const move = (direction: number) => {
    const next = Math.max(-180, Math.min(180, offset + direction * 24));
    setOffset(next);
    if (Math.abs(next) >= 72) ready();
  };
  return <div className="role-control" ref={host} tabIndex={0} role="group" aria-label={`${name} 조작 인계. 좌우 방향키 또는 A와 D로 움직이세요.`}
    onKeyDown={event => {
      if (['ArrowLeft', 'ArrowRight', 'a', 'A', 'd', 'D'].includes(event.key)) {
        event.preventDefault(); event.stopPropagation(); move(['ArrowLeft', 'a', 'A'].includes(event.key) ? -1 : 1);
      }
    }} onPointerDown={() => host.current?.focus()}>
    <img className="handoff-actor" src="/assets/prologue/inquisitor.svg" alt={`${name}, 이제 당신이 움직이는 인물`} style={{ transform: `translateX(${offset}px)` }} />
    <div className="handoff-input"><button aria-label="인물을 왼쪽으로 움직이기" onClick={() => move(-1)}>←</button><span>이제 당신의 움직임입니다 · A / D 또는 ← →</span><button aria-label="인물을 오른쪽으로 움직이기" onClick={() => move(1)}>→</button></div>
  </div>;
}
