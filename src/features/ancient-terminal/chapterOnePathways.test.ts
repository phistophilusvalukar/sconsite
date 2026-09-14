import { describe, expect, it } from 'vitest';
import {
  AI_SHUTDOWN_DURATION_MS,
  ChapterOnePathwayError,
  INSTABILITY_DURATION_MS,
  QUARANTINE_DURATION_MS,
  advanceChapterOnePathway,
  createInitialChapterOnePathwayState,
  resolveChapterOneDeadlines,
  type ChapterOnePathwayState,
} from './chapterOnePathways';

const NOW = 1_000_000;

function openPortal(): ChapterOnePathwayState {
  let state = createInitialChapterOnePathwayState();
  for (let count = 0; count < 3; count += 1) state = advanceChapterOnePathway(state, 'record_population_block', NOW);
  state = advanceChapterOnePathway(state, 'read_recovery', NOW);
  state = advanceChapterOnePathway(state, 'contact_sentry', NOW);
  state = advanceChapterOnePathway(state, 'authorize_sentry', NOW);
  state = advanceChapterOnePathway(state, 'quarantine_horror', NOW);
  state = advanceChapterOnePathway(state, 'discover_portal', NOW);
  return advanceChapterOnePathway(state, 'open_portal', NOW);
}

describe('Chapter 1 pathways', () => {
  it('requires evidence before SENTRY/9 can be authorized', () => {
    expect(() => advanceChapterOnePathway(createInitialChapterOnePathwayState(), 'authorize_sentry', NOW))
      .toThrow(ChapterOnePathwayError);
  });

  it('routes an open portal with only the AI alive to Phase 2A', () => {
    let state = openPortal();
    state = advanceChapterOnePathway(state, 'purge_horror', NOW + 1);
    state = advanceChapterOnePathway(state, 'enter_portal', NOW + 2);
    expect(state.phaseTwoRoute).toBe('phase_2a');
  });

  it('routes an open portal with only the horror alive to Phase 2B', () => {
    let state = openPortal();
    state = advanceChapterOnePathway(state, 'purge_ai', NOW + 1);
    state = advanceChapterOnePathway(state, 'enter_portal', NOW + 2);
    expect(state.phaseTwoRoute).toBe('phase_2b');
  });

  it('routes an open portal with both processes gone to Phase 2C', () => {
    let state = openPortal();
    state = advanceChapterOnePathway(state, 'purge_ai', NOW + 1);
    state = advanceChapterOnePathway(state, 'purge_horror', NOW + 2);
    state = advanceChapterOnePathway(state, 'enter_portal', NOW + 3);
    expect(state.phaseTwoRoute).toBe('phase_2c');
  });

  it('locks the terminal when the AI is purged before the portal opens', () => {
    const opened = openPortal();
    const state = advanceChapterOnePathway({ ...opened, portalOpen: false }, 'purge_ai', NOW + 1);
    expect(state.terminalEnding).toBe('horror_lockout');
  });

  it('lets the AI shut down the simulation when the horror is purged before opening the portal', () => {
    const opened = openPortal();
    const state = advanceChapterOnePathway({ ...opened, portalOpen: false }, 'purge_horror', NOW + 1);
    expect(state.terminalEnding).toBe('ai_shutdown');
  });

  it('resolves each missed portal deadline authoritatively', () => {
    const phaseA = advanceChapterOnePathway(openPortal(), 'purge_horror', NOW);
    expect(resolveChapterOneDeadlines(phaseA, NOW + AI_SHUTDOWN_DURATION_MS).terminalEnding).toBe('ai_shutdown');

    const phaseB = advanceChapterOnePathway(openPortal(), 'purge_ai', NOW);
    expect(resolveChapterOneDeadlines(phaseB, NOW + QUARANTINE_DURATION_MS).terminalEnding).toBe('horror_lockout');

    let phaseC = advanceChapterOnePathway(openPortal(), 'purge_ai', NOW);
    phaseC = advanceChapterOnePathway(phaseC, 'purge_horror', NOW + 1);
    expect(resolveChapterOneDeadlines(phaseC, NOW + 1 + INSTABILITY_DURATION_MS).terminalEnding).toBe('simulation_collapse');
  });
});
