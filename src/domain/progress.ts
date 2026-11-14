import type { CharacterFlags } from './flags.ts';
import type { EditResult } from './mind/editing.ts';
export interface LogEntry { speaker: string; text: string; kind: 'dialogue' | 'choice' }
export interface MindSession { id: string; eventId: string; sourceNodeId: string }
export interface Progress {
  screen: 'dialogue' | 'mindEdit'; nodeId: string; activeCharacterId: string; revision: number;
  characterFlags: CharacterFlags; editResults: EditResult[]; log: LogEntry[]; activeMind: MindSession | null;
}
