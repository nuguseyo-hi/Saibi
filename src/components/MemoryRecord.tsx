import { useEffect, useRef } from 'react';
import type { EditResult, MindEvent } from '../domain/mind/editing';
export function MemoryRecord({ results, events, close }: { results: EditResult[]; events: MindEvent[]; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const el = dialog.current; el?.showModal(); return () => el?.close(); }, []);
  return <dialog ref={dialog} className="log-dialog memory-dialog" onCancel={close} aria-labelledby="memory-title">
    <div className="flex items-center justify-between gap-8"><h2 id="memory-title">확정한 기억</h2><button className="text-button" onClick={close} autoFocus>닫기 ×</button></div>
    {results.length === 0 ? <p className="empty-memory">아직 확정한 사고 편집이 없습니다.</p> : results.map(r => <article className="memory-entry" key={r.sessionId}><p className="eyebrow">{events.find(e => e.id === r.eventId)?.title ?? '기억'}</p><h3>편집 후</h3><p className="memory-text">{r.afterText || '남아 있는 문장이 없습니다.'}</p><details><summary>원래 기억과 비교</summary><p className="memory-text">{r.beforeText}</p></details></article>)}
  </dialog>;
}
