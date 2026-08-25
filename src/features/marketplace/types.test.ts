import { describe, expect, it } from 'vitest';
import { assuranceDc, canTransitionCommission, commissionWorkflow, emptyBonus, totalBonus } from './types';

describe('marketplace skill modifiers', () => {
  it('combines the Foundry level, selected proficiency, and disclosed modifiers', () => {
    expect(totalBonus({ level: 9, proficiency: 'master', ability: 4, item: 2, circumstance: 1, status: 1 })).toBe(23);
  });

  it('uses only level and proficiency for Assurance', () => {
    expect(assuranceDc({ level: 9, proficiency: 'expert', ability: 4, item: 2, circumstance: 1, status: 1 })).toBe(23);
  });

  it('defaults new bonus disclosures to untrained', () => {
    expect(emptyBonus(7)).toEqual({ level: 7, proficiency: 'untrained', ability: 0, item: 0, circumstance: 0, status: 0 });
  });
});

describe('commission workflow contract', () => {
  it('uses the requested-to-payment lifecycle in display order', () => {
    expect(commissionWorkflow).toEqual(['requested', 'in_progress', 'waiting_for_payment', 'completed']);
  });

  it('gives shop owners and requesters distinct authoritative transitions', () => {
    expect(canTransitionCommission('owner', 'requested', 'in_progress')).toBe(true);
    expect(canTransitionCommission('owner', 'in_progress', 'waiting_for_payment')).toBe(true);
    expect(canTransitionCommission('requester', 'waiting_for_payment', 'completed')).toBe(true);
    expect(canTransitionCommission('requester', 'requested', 'completed')).toBe(false);
    expect(canTransitionCommission('owner', 'waiting_for_payment', 'completed')).toBe(false);
  });
});
