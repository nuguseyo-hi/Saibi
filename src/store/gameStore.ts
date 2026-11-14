import { createStore } from 'zustand/vanilla';
import { getNextNode, getNode } from '../domain/scenario.ts';
import type { Scenario } from '../domain/scenario.ts';

export interface LogEntry { speaker: string; text: string; kind: 'dialogue' | 'choice' }
interface GameStore {
  screen: 'title' | 'dialogue';
  nodeId: string;
  log: LogEntry[];
  start: () => void;
  advance: (expectedNodeId: string) => void;
  choose: (expectedNodeId: string, choiceId: string) => void;
  returnToTitle: () => void;
}
export function createGameStore(scenario: Scenario) {
  const entry = (id: string): LogEntry => {
    const n = getNode(scenario, id);
    return { speaker: n.speaker, text: n.text, kind: 'dialogue' };
  };
  return createStore<GameStore>()((set) => ({
    screen: 'title', nodeId: scenario.startNodeId, log: [],
    start: () => set({ screen: 'dialogue', nodeId: scenario.startNodeId, log: [entry(scenario.startNodeId)] }),
    advance: expectedNodeId => set(s => {
      if (s.screen !== 'dialogue' || s.nodeId !== expectedNodeId) return s;
      const next = getNextNode(scenario, s.nodeId);
      return next ? { nodeId: next, log: [...s.log, entry(next)] } : s;
    }),
    choose: (expectedNodeId, choiceId) => set(s => {
      if (s.screen !== 'dialogue' || s.nodeId !== expectedNodeId) return s;
      const next = getNextNode(scenario, s.nodeId, choiceId);
      const choice = getNode(scenario, s.nodeId).choices?.find(c => c.id === choiceId);
      return next && choice ? {
        nodeId: next,
        log: [...s.log, { speaker: 'player', text: choice.text, kind: 'choice' as const }, entry(next)],
      } : s;
    }),
    returnToTitle: () => set({ screen: 'title' }),
  }));
}
