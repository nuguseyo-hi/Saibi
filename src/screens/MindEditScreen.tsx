import { useEffect, useRef, useState } from 'react';
import { createDraft, editedSentence, optionFor, originalSentence } from '../domain/mind/editing';
import type { EditDraft, MindEvent } from '../domain/mind/editing';
import { Sigil } from '../components/Scene';

interface Props { event: MindEvent; characterName: string; error: string | null; confirm: (draft: EditDraft) => void; cancel: () => void }
export function MindEditScreen({ event, characterName, error, confirm, cancel }: Props) {
  // Draft lives only in this mounted screen. Navigating away or reloading discards it.
  const [draft, setDraft] = useState(() => createDraft(event));
  const [selected, setSelected] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const region = event.regions.find(r => r.id === selected);
  const changed = event.regions.filter(r => draft[r.id] !== r.defaultOptionId).length;
  const preview = event.sentences.map(s => editedSentence(event, s, draft)).filter(s => s !== null).join('\n');
  return <section className="mind-screen" aria-labelledby="mind-title">
    <div className="mind-intro"><Sigil /><p className="eyebrow">INNER SANCTUM · {characterName}의 내면</p><h1 id="mind-title" tabIndex={-1} ref={heading}>{event.title}</h1><p>{event.description}</p></div>
    <div className="mind-workspace">
      <div className="thought-sheet"><div className="sheet-heading"><span>흔들리는 기억</span><span>선택 가능한 구간 ◇</span></div>
        {event.sentences.map((sentence, i) => {
          const deletion = event.regions.find(r => r.type === 'delete' && r.targetId === sentence.id);
          const removed = deletion && optionFor(deletion, draft).text === '';
          return <div className="thought-line" key={sentence.id}><span className="thought-number">0{i + 1}</span><div>
            {deletion ? <button className={`thought-target sentence-target ${removed ? 'is-deleted' : ''} ${selected === deletion.id ? 'is-selected' : ''}`} aria-pressed={selected === deletion.id} onClick={() => setSelected(deletion.id)}>{originalSentence(sentence)}<span className="target-caption">{removed ? '삭제 예정 · 다시 선택해 복원' : '문장 삭제 가능'}</span></button>
              : sentence.segments.map(segment => {
                const r = event.regions.find(r => r.type === 'replace' && r.targetId === segment.id);
                return r ? <button key={segment.id} className={`thought-target word-target ${draft[r.id] !== r.defaultOptionId ? 'is-edited' : ''} ${selected === r.id ? 'is-selected' : ''}`} aria-label={`${optionFor(r, draft).label} 단어 편집`} aria-pressed={selected === r.id} onClick={() => setSelected(r.id)}>{optionFor(r, draft).text}<span className="word-marker" aria-hidden="true">◇</span></button> : <span key={segment.id}>{segment.text}</span>;
              })}
          </div></div>;
        })}
      </div>
      <aside className="edit-inspector" aria-label="편집 도구">
        <p className="eyebrow">REWRITE THE MEMORY</p>
        {region ? <><h2>{region.type === 'replace' ? '단어 치환' : '문장 삭제'}</h2><p className="inspector-help">{region.type === 'replace' ? '이 구간에 남길 의미를 선택하세요.' : '삭제한 문장은 확정 전까지 복원할 수 있습니다.'}</p><div className="edit-options">{region.options.map(o => <button key={o.id} aria-pressed={draft[region.id] === o.id} className={draft[region.id] === o.id ? 'chosen' : ''} onClick={() => setDraft(d => ({ ...d, [region.id]: o.id }))}><span>{o.label}</span><span aria-hidden="true">{draft[region.id] === o.id ? '◆' : '◇'}</span></button>)}</div></> : <div className="inspector-empty"><span aria-hidden="true">◇</span><h2>기억에 손을 대다</h2><p>왼쪽의 빛나는 단어나 문장을 선택하세요.</p></div>}
        <div className="draft-status" role="status">{changed ? `${changed}개 구간 변경 · 아직 확정되지 않음` : '원문 유지 · 아직 확정되지 않음'}</div>
      </aside>
    </div>
    <details className="mind-preview"><summary>확정될 문장 미리보기</summary><p>{preview || '모든 문장이 삭제됩니다.'}</p></details>
    {error && <p className="action-error" role="alert">{error}</p>}
    <div className="mind-actions"><button className="text-button" onClick={() => { setDraft(createDraft(event)); setSelected(null); }}>모두 원문으로</button><div><button className="secondary-button" onClick={cancel}>편집 취소</button><button className="primary-button" onClick={() => confirm(draft)}>편집 확정 <span aria-hidden="true">→</span></button></div></div>
    <p className="mind-footnote">확정해야 기억과 이후 대화에 반영됩니다. 취소하면 원래 고해성사로 돌아갑니다.</p>
  </section>;
}
