import { useState } from 'react';
import type { Character } from '../domain/scenario';

export function BackgroundLayer({ src }: { src: string }) {
  return <div className="background-layer" aria-hidden="true" style={{ backgroundImage: `url("${src}")` }} />;
}
export function CharacterSprite({ character }: { character: Character }) {
  const [failed, setFailed] = useState(false);
  return failed
    ? <div className="character-fallback">{character.name}</div>
    : <img className="character-sprite" src={character.standing} alt={`${character.name}의 스탠딩 이미지`} onError={() => setFailed(true)} />;
}
export function Sigil({ className = '' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 80 100" fill="none" aria-hidden="true"><path d="M40 2v94M15 36h50M23 24l34 48M57 24L23 72" stroke="currentColor" strokeWidth="1" /><path d="M40 12 66 48 40 84 14 48Z" stroke="currentColor"/><circle cx="40" cy="48" r="18" stroke="currentColor"/><circle cx="40" cy="48" r="4" fill="currentColor"/></svg>;
}
