import { supabase } from '../../../config/database';
import { buildAccessState } from '../engine/access';
import { applyLockAction, resetRuntimeState } from '../engine/puzzleEngine';
import type {
  AccessProviderType,
  InvitationStatus,
  LockAccessState,
  LockAction,
  LockRuntimeState,
  PerformLockActionInput,
  PuzzleDefinition,
  PuzzleSessionStatus,
  SessionRole
} from '../engine/types';
import { getPuzzleTemplate, puzzleTemplates } from '../data/puzzleTemplates';

export type ArcaneSessionSummary = {
  id: string;
  name: string;
  status: PuzzleSessionStatus;
  gmUserId: string;
  gmDisplayName: string;
  accessProviderType: AccessProviderType;
  lockCount: number;
  acceptedMemberCount: number;
  invitationStatus?: InvitationStatus;
  currentUserRole?: SessionRole;
};

export type ArcaneLockSummary = {
  id: string;
  sessionId: string;
  templateId: string;
  displayName: string;
  tabOrder: number;
  status: 'active' | 'paused' | 'solved';
  version: number;
  generation: number;
  solvedAt: string | null;
  viewerCount: number;
  currentState: LockRuntimeState;
};

export type ArcaneParticipant = {
  userId: string;
  displayName: string;
  role: SessionRole;
  invitationStatus: InvitationStatus;
  online: boolean;
  activeLockId: string | null;
};

export type ArcaneInviteCandidate = {
  authUserId: string;
  username: string;
  avatar: string | null;
};

export type LockView = {
  session: ArcaneSessionSummary;
  locks: ArcaneLockSummary[];
  participants: ArcaneParticipant[];
  activeLock: ArcaneLockSummary;
  publicDefinition: PuzzleDefinition;
  inscription: string;
  translatedHint: string | null;
  canReadInstructions: boolean;
  canInteract: boolean;
  access: LockAccessState[];
  actionHistory: Array<{
    id: string;
    actorName: string;
    actionType: string;
    createdAt: string;
    summary: string;
  }>;
};

export async function listArcaneSessions(): Promise<ArcaneSessionSummary[]> {
  const { data, error } = await supabase.rpc('list_arcane_puzzle_sessions');
  if (!error && Array.isArray(data)) return data as ArcaneSessionSummary[];
  if (!error && data && typeof data === 'object') return data as ArcaneSessionSummary[];
  return [createDemoSession().session];
}

export async function createArcaneSession(sessionName: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_arcane_puzzle_session', {
    session_name: sessionName,
    include_starter_locks: true
  });
  if (error || !data) {
    demoState = createDemoSession(sessionName || 'Demo Arcane Locks');
    return demoState.session.id;
  }
  return data as string;
}

export async function inviteArcaneSessionUser(sessionId: string, userId: string, role: SessionRole = 'player') {
  const { error } = await supabase.rpc('invite_arcane_session_user', {
    target_session_id: sessionId,
    target_user_id: userId,
    target_role: role
  });
  if (error) throw error;
}

export async function respondToArcaneInvitation(sessionId: string, status: 'accepted' | 'declined') {
  const { error } = await supabase.rpc('respond_to_arcane_invitation', {
    target_session_id: sessionId,
    next_status: status
  });
  if (error) throw error;
}

export async function removeArcaneSessionMember(sessionId: string, userId: string) {
  const { error } = await supabase.rpc('remove_arcane_session_member', {
    target_session_id: sessionId,
    target_user_id: userId
  });
  if (error) throw error;
}

export async function searchArcaneInviteCandidates(query: string): Promise<ArcaneInviteCandidate[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const { data, error } = await supabase
    .from('users')
    .select('auth_user_id, username, avatar')
    .ilike('username', `%${trimmed}%`)
    .not('settings->>profilePrivate', 'eq', 'true')
    .limit(8);

  if (error || !data) return [];
  return data.map(row => ({
    authUserId: row.auth_user_id as string,
    username: row.username as string,
    avatar: (row.avatar as string | null) ?? null
  }));
}

export async function getLockViewForCurrentUser(sessionId: string, lockId?: string): Promise<LockView> {
  const { data, error } = await supabase.rpc('get_arcane_lock_view_for_current_user', {
    target_session_id: sessionId,
    target_lock_id: lockId ?? null
  });
  if (!error && data) return data as LockView;

  const demo = createDemoSession();
  return lockId ? selectDemoLock(demo, lockId) : demo;
}

export async function performLockAction(input: PerformLockActionInput): Promise<ArcaneLockSummary> {
  const { data, error } = await supabase.rpc('perform_lock_action', {
    lock_instance_id: input.lockInstanceId,
    expected_version: input.expectedVersion,
    expected_generation: input.generation,
    action_id: input.actionId,
    action_payload: input.action
  });

  if (!error && data) return data as ArcaneLockSummary;
  return performDemoLockAction(input.lockInstanceId, input.action);
}

export async function updateSessionStatus(sessionId: string, status: PuzzleSessionStatus) {
  const { error } = await supabase.rpc('set_arcane_session_status', { target_session_id: sessionId, next_status: status });
  if (error && sessionId === demoState.session.id) {
    demoState = { ...demoState, session: { ...demoState.session, status } };
    return;
  }
  if (error) throw error;
}

export async function updateAccessProvider(sessionId: string, providerType: AccessProviderType) {
  const { error } = await supabase.rpc('set_arcane_access_provider', { target_session_id: sessionId, next_provider_type: providerType });
  if (error && sessionId === demoState.session.id) {
    demoState = { ...demoState, session: { ...demoState.session, accessProviderType: providerType } };
    return;
  }
  if (error) throw error;
}

export async function updatePlayerLockAccess(args: {
  lockId: string;
  userId: string;
  providerCanInteract?: boolean;
  providerCanRead?: boolean;
  interactOverride?: 'automatic' | 'allow' | 'deny';
  readOverride?: 'automatic' | 'allow' | 'deny';
}) {
  const { error } = await supabase.rpc('set_arcane_lock_access', {
    target_lock_id: args.lockId,
    target_user_id: args.userId,
    provider_can_interact: args.providerCanInteract ?? null,
    provider_can_read: args.providerCanRead ?? null,
    interact_override: args.interactOverride ?? null,
    read_override: args.readOverride ?? null
  });
  if (error && args.lockId.startsWith('demo-')) {
    demoState = {
      ...demoState,
      access: demoState.access.map(access => access.lockId === args.lockId && access.userId === args.userId ? buildAccessState({
        lockId: access.lockId,
        userId: access.userId,
        providerCanInteract: args.providerCanInteract ?? access.providerCanInteract,
        providerCanReadInstructions: args.providerCanRead ?? access.providerCanReadInstructions,
        interactOverride: args.interactOverride ?? access.interactOverride,
        readOverride: args.readOverride ?? access.readOverride,
        providerType: access.providerType,
        providerUpdatedAt: new Date().toISOString(),
        updatedByUserId: 'demo-gm'
      }) : access)
    };
    return;
  }
  if (error) throw error;
}

export async function resetLock(lockId: string) {
  const { error } = await supabase.rpc('reset_arcane_lock', { target_lock_id: lockId });
  if (error && lockId.startsWith('demo-')) {
    const lock = demoState.locks.find(item => item.id === lockId);
    if (!lock) return;
    const template = getPuzzleTemplate(lock.templateId);
    const nextLock: ArcaneLockSummary = {
      ...lock,
      currentState: resetRuntimeState(template),
      version: 1,
      generation: lock.generation + 1,
      solvedAt: null,
      status: 'active'
    };
    demoState = {
      ...demoState,
      locks: demoState.locks.map(item => item.id === lockId ? nextLock : item),
      activeLock: demoState.activeLock.id === lockId ? nextLock : demoState.activeLock
    };
    return;
  }
  if (error) throw error;
}

export async function resetAllLocks(sessionId: string) {
  const { error } = await supabase.rpc('reset_arcane_session_locks', { target_session_id: sessionId });
  if (error && sessionId === demoState.session.id) {
    for (const lock of demoState.locks) {
      await resetLock(lock.id);
    }
    return;
  }
  if (error) throw error;
}

let demoState = createDemoSession();

function selectDemoLock(view: LockView, lockId: string): LockView {
  const activeLock = view.locks.find(lock => lock.id === lockId) ?? view.activeLock;
  const publicDefinition = redactDefinition(getPuzzleTemplate(activeLock.templateId));
  const canRead = true;
  return {
    ...view,
    activeLock,
    publicDefinition,
    inscription: canRead ? getPuzzleTemplate(activeLock.templateId).inscription : publicDefinition.obscuredInscription ?? 'The inscription is too distant to decipher.',
    translatedHint: canRead ? getPuzzleTemplate(activeLock.templateId).translatedHint ?? null : null
  };
}

function createDemoSession(name = 'Demo Arcane Locks'): LockView {
  const locks = puzzleTemplates.map((template, index): ArcaneLockSummary => ({
    id: `demo-${template.id}`,
    sessionId: 'demo-arcane-session',
    templateId: template.id,
    displayName: template.name,
    tabOrder: index,
    status: 'active',
    version: 1,
    generation: 1,
    solvedAt: null,
    viewerCount: index === 0 ? 2 : 1,
    currentState: resetRuntimeState(template)
  }));

  const participants: ArcaneParticipant[] = [
    { userId: 'demo-gm', displayName: 'GM', role: 'gm', invitationStatus: 'accepted', online: true, activeLockId: locks[0].id },
    { userId: 'demo-player', displayName: 'Naira', role: 'player', invitationStatus: 'accepted', online: true, activeLockId: locks[0].id },
    { userId: 'demo-spectator', displayName: 'Archivist Pell', role: 'spectator', invitationStatus: 'accepted', online: false, activeLockId: null }
  ];

  const access = locks.flatMap(lock => participants.map(participant => buildAccessState({
    lockId: lock.id,
    userId: participant.userId,
    providerCanInteract: participant.role !== 'spectator',
    providerCanReadInstructions: participant.role !== 'spectator',
    interactOverride: 'automatic',
    readOverride: 'automatic',
    providerType: 'manual',
    providerUpdatedAt: new Date().toISOString(),
    updatedByUserId: 'demo-gm'
  })));

  const session: ArcaneSessionSummary = {
    id: 'demo-arcane-session',
    name,
    status: 'active',
    gmUserId: 'demo-gm',
    gmDisplayName: 'GM',
    accessProviderType: 'manual',
    lockCount: locks.length,
    acceptedMemberCount: participants.length,
    invitationStatus: 'accepted',
    currentUserRole: 'gm'
  };

  return {
    session,
    locks,
    participants,
    activeLock: locks[0],
    publicDefinition: redactDefinition(puzzleTemplates[0]),
    inscription: puzzleTemplates[0].inscription,
    translatedHint: puzzleTemplates[0].translatedHint ?? null,
    canReadInstructions: true,
    canInteract: true,
    access,
    actionHistory: [
      { id: 'demo-action-1', actorName: 'System', actionType: 'reset', createdAt: new Date().toISOString(), summary: 'The locks are ready.' }
    ]
  };
}

function performDemoLockAction(lockId: string, action: LockAction): ArcaneLockSummary {
  const lock = demoState.locks.find(item => item.id === lockId) ?? demoState.activeLock;
  const definition = getPuzzleTemplate(lock.templateId);
  const currentState = applyLockAction(definition, lock.currentState, action);
  const nextLock = {
    ...lock,
    currentState,
    version: lock.version + 1,
    status: currentState.solved ? 'solved' as const : lock.status,
    solvedAt: currentState.solved ? new Date().toISOString() : lock.solvedAt
  };
  demoState = {
    ...demoState,
    locks: demoState.locks.map(item => item.id === lockId ? nextLock : item),
    activeLock: nextLock,
    actionHistory: [
      {
        id: crypto.randomUUID(),
        actorName: 'You',
        actionType: action.type,
        createdAt: new Date().toISOString(),
        summary: summarizeAction(action)
      },
      ...demoState.actionHistory
    ].slice(0, 12)
  };
  return nextLock;
}

function redactDefinition(definition: PuzzleDefinition): PuzzleDefinition {
  return {
    ...definition,
    inscription: '',
    translatedHint: undefined,
    solutionRules: []
  };
}

function summarizeAction(action: LockAction): string {
  if (action.type === 'rotate_ring') return `Rotated ${action.ringId} ${action.steps} step(s).`;
  if (action.type === 'set_ring_rotation') return `Set ${action.ringId} to slot ${action.rotation}.`;
  if (action.type === 'power_glyph') return `Powered ${action.glyphId} on ${action.ringId}.`;
  if (action.type === 'move_obstacle') return `Moved ${action.obstacleId}.`;
  return 'Invoked the lock core.';
}
