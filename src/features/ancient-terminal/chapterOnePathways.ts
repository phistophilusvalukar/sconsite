export type PhaseTwoRoute = 'phase_2a' | 'phase_2b' | 'phase_2c';
export type TerminalEnding = 'horror_lockout' | 'ai_shutdown' | 'simulation_collapse';

export type ChapterOnePathwayState = {
  populationBlocks: number;
  recoveryRead: boolean;
  operatorArchiveUnlocked: boolean;
  sentryContacted: boolean;
  sentryAuthorized: boolean;
  portalDiscovered: boolean;
  portalOpen: boolean;
  aiAlive: boolean;
  horrorAlive: boolean;
  quarantineExpiresAt: number | null;
  aiShutdownAt: number | null;
  instabilityAt: number | null;
  phaseTwoRoute: PhaseTwoRoute | null;
  terminalEnding: TerminalEnding | null;
};

export type ChapterOnePathwayAction =
  | 'record_population_block'
  | 'read_recovery'
  | 'contact_sentry'
  | 'authorize_sentry'
  | 'quarantine_horror'
  | 'discover_portal'
  | 'open_portal'
  | 'purge_ai'
  | 'purge_horror'
  | 'enter_portal';

export const QUARANTINE_DURATION_MS = 5 * 60 * 1_000;
export const AI_SHUTDOWN_DURATION_MS = 90 * 1_000;
export const INSTABILITY_DURATION_MS = 2 * 60 * 1_000;

export class ChapterOnePathwayError extends Error {}

export function createInitialChapterOnePathwayState(): ChapterOnePathwayState {
  return {
    populationBlocks: 0,
    recoveryRead: false,
    operatorArchiveUnlocked: false,
    sentryContacted: false,
    sentryAuthorized: false,
    portalDiscovered: false,
    portalOpen: false,
    aiAlive: true,
    horrorAlive: true,
    quarantineExpiresAt: null,
    aiShutdownAt: null,
    instabilityAt: null,
    phaseTwoRoute: null,
    terminalEnding: null,
  };
}

export function resolveChapterOneDeadlines(state: ChapterOnePathwayState, now: number): ChapterOnePathwayState {
  if (state.phaseTwoRoute || state.terminalEnding) return state;
  if (state.portalOpen && !state.aiAlive && state.horrorAlive && (state.quarantineExpiresAt ?? 0) <= now) {
    return { ...state, portalOpen: false, terminalEnding: 'horror_lockout' };
  }
  if (state.portalOpen && state.aiAlive && !state.horrorAlive && (state.aiShutdownAt ?? 0) <= now) {
    return { ...state, portalOpen: false, terminalEnding: 'ai_shutdown' };
  }
  if (state.portalOpen && !state.aiAlive && !state.horrorAlive && (state.instabilityAt ?? 0) <= now) {
    return { ...state, portalOpen: false, terminalEnding: 'simulation_collapse' };
  }
  if (state.portalOpen && state.aiAlive && state.horrorAlive && (state.quarantineExpiresAt ?? 0) <= now) {
    return { ...state, portalOpen: false };
  }
  return state;
}

function requireCondition(condition: boolean, message: string): asserts condition {
  if (!condition) throw new ChapterOnePathwayError(message);
}

function requireActive(state: ChapterOnePathwayState): void {
  requireCondition(!state.phaseTwoRoute && !state.terminalEnding, 'Chapter 1 has already ended');
}

function horrorIsQuarantined(state: ChapterOnePathwayState, now: number): boolean {
  return state.horrorAlive && state.quarantineExpiresAt !== null && state.quarantineExpiresAt > now;
}

export function advanceChapterOnePathway(
  current: ChapterOnePathwayState,
  action: ChapterOnePathwayAction,
  now: number,
): ChapterOnePathwayState {
  const state = resolveChapterOneDeadlines(current, now);
  requireActive(state);

  if (action === 'record_population_block') {
    return { ...state, populationBlocks: Math.min(99, state.populationBlocks + 1) };
  }
  if (action === 'read_recovery') {
    return { ...state, recoveryRead: true, operatorArchiveUnlocked: true };
  }
  if (action === 'contact_sentry') {
    requireCondition(state.populationBlocks >= 3 && state.recoveryRead, 'SENTRY/9 has not made contact');
    return { ...state, sentryContacted: true };
  }
  if (action === 'authorize_sentry') {
    requireCondition(state.sentryContacted, 'SENTRY/9 has not made contact');
    return { ...state, sentryAuthorized: true };
  }
  if (action === 'quarantine_horror') {
    requireCondition(state.sentryAuthorized && state.aiAlive && state.horrorAlive, 'Quarantine is unavailable');
    requireCondition(!horrorIsQuarantined(state, now), 'Quarantine is already active');
    return { ...state, quarantineExpiresAt: now + QUARANTINE_DURATION_MS };
  }
  if (action === 'discover_portal') {
    requireCondition(state.operatorArchiveUnlocked && horrorIsQuarantined(state, now), 'The portal trace is still concealed');
    return { ...state, portalDiscovered: true };
  }
  if (action === 'open_portal') {
    requireCondition(state.portalDiscovered && state.aiAlive && state.horrorAlive && horrorIsQuarantined(state, now), 'The portal cannot be opened');
    return { ...state, portalOpen: true };
  }
  if (action === 'purge_ai') {
    requireCondition(state.sentryAuthorized && state.aiAlive && horrorIsQuarantined(state, now), 'SENTRY/9 cannot be purged now');
    if (!state.portalOpen) return { ...state, aiAlive: false, terminalEnding: 'horror_lockout' };
    return { ...state, aiAlive: false };
  }
  if (action === 'purge_horror') {
    requireCondition(state.horrorAlive && horrorIsQuarantined(state, now), 'The concealed process cannot be purged now');
    if (!state.portalOpen) return { ...state, horrorAlive: false, terminalEnding: 'ai_shutdown' };
    if (state.aiAlive) return { ...state, horrorAlive: false, aiShutdownAt: now + AI_SHUTDOWN_DURATION_MS };
    return { ...state, horrorAlive: false, instabilityAt: now + INSTABILITY_DURATION_MS };
  }

  requireCondition(state.portalOpen, 'No open portal is available');
  if (state.aiAlive && !state.horrorAlive) return { ...state, phaseTwoRoute: 'phase_2a' };
  if (!state.aiAlive && state.horrorAlive) {
    requireCondition(horrorIsQuarantined(state, now), 'Containment failed before entry');
    return { ...state, phaseTwoRoute: 'phase_2b' };
  }
  if (!state.aiAlive && !state.horrorAlive) return { ...state, phaseTwoRoute: 'phase_2c' };
  throw new ChapterOnePathwayError('The portal rejects entry while both resident processes remain');
}
