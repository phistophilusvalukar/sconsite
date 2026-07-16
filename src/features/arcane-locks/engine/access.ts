import type { LockAccessState, PermissionOverride, SessionRole } from './types';

export function resolveAccess(providerValue: boolean, override: PermissionOverride): boolean {
  if (override === 'allow') return true;
  if (override === 'deny') return false;
  return providerValue;
}

export function buildAccessState(input: Omit<LockAccessState, 'effectiveCanInteract' | 'effectiveCanReadInstructions'>): LockAccessState {
  return {
    ...input,
    effectiveCanInteract: resolveAccess(input.providerCanInteract, input.interactOverride),
    effectiveCanReadInstructions: resolveAccess(input.providerCanReadInstructions, input.readOverride)
  };
}

export function canPerformLockAction(role: SessionRole, access: Pick<LockAccessState, 'effectiveCanInteract'>): boolean {
  if (role === 'gm') return true;
  if (role === 'spectator') return false;
  return access.effectiveCanInteract;
}

export function canReadInstructions(role: SessionRole, access: Pick<LockAccessState, 'effectiveCanReadInstructions'>): boolean {
  if (role === 'gm') return true;
  return access.effectiveCanReadInstructions;
}
