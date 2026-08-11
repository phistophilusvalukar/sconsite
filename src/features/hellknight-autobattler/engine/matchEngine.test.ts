import { describe, expect, it } from 'vitest';
import {
  EXPERIENCE_PURCHASE_COST,
  MATCH_EXPERIENCE,
  MATCH_WIN_GOLD,
  applyRoundOutcomes,
  areAllActiveParticipantsReady,
  calculateBattleOutcomeDamage,
  calculateSurvivorDamage,
  createMatchParticipants,
  createRoundPairings,
  getBaseTeamCapacity,
  getLastStanding,
  getTeamCapacity,
  grantExperience,
  markNpcParticipantsReady,
  purchaseExperience,
  resolveNpcPairing,
  setParticipantReady,
  trimBoardToCapacity
} from './matchEngine';

describe('Citadel Tactics match progression', () => {
  it('starts at four field units and unlocks one slot per level', () => {
    expect([1, 2, 3, 4, 5].map(getBaseTeamCapacity)).toEqual([4, 5, 6, 7, 8]);
    expect(getTeamCapacity(3, 2)).toBe(6);
    expect(getTeamCapacity(3, 3)).toBe(7);
  });

  it('recalls units deterministically when a capacity bonus is lost', () => {
    const board = [
      { slot: 0, unitId: 'a' },
      { slot: 1, unitId: 'b' },
      { slot: 2, unitId: null },
      { slot: 3, unitId: 'c' },
      { slot: 4, unitId: 'd' },
      { slot: 5, unitId: 'e' }
    ];

    expect(trimBoardToCapacity(board, 4)).toEqual({
      slots: [
        { slot: 0, unitId: 'a' },
        { slot: 1, unitId: 'b' },
        { slot: 2, unitId: null },
        { slot: 3, unitId: 'c' },
        { slot: 4, unitId: 'd' },
        { slot: 5, unitId: null }
      ],
      recalledUnitIds: ['e']
    });
  });

  it('grants match XP and supports buying XP with gold', () => {
    expect(grantExperience(1, 0, MATCH_EXPERIENCE)).toEqual({ level: 1, experience: 2 });
    expect(grantExperience(1, 2, MATCH_EXPERIENCE)).toEqual({ level: 2, experience: 0 });
    expect(purchaseExperience(1, 0, EXPERIENCE_PURCHASE_COST)).toEqual({
      level: 2,
      experience: 0,
      gold: 0,
      purchased: true
    });
    expect(purchaseExperience(5, 0, 100).purchased).toBe(false);
  });
});

describe('Citadel Tactics round orchestration', () => {
  it('pairs every active participant once and excludes eliminated players', () => {
    const participants = createMatchParticipants(['You', 'A', 'B', 'C', 'D'])
      .map(participant => participant.name === 'D' ? { ...participant, health: 0, eliminated: true } : participant);
    const pairings = createRoundPairings(participants, 3, 17);
    const ids = pairings.flatMap(pairing => [pairing.leftId, pairing.rightId].filter((id): id is string => Boolean(id)));

    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    expect(ids).not.toContain(participants.find(participant => participant.name === 'D')?.id);
  });

  it('uses a deterministic echo opponent when the active field is odd', () => {
    const participants = createMatchParticipants(['You', 'A', 'B']);
    const pairings = createRoundPairings(participants, 2, 11);
    const echoPairing = pairings.find(pairing => pairing.rightId === null)!;

    expect(pairings).toEqual(createRoundPairings(participants, 2, 11));
    expect(resolveNpcPairing(echoPairing, participants, 2, 11)).toEqual(resolveNpcPairing(echoPairing, participants, 2, 11));
  });

  it('calculates loss damage from each surviving enemy tier', () => {
    expect(calculateSurvivorDamage([1, 1, 2, 3])).toBe(14);
  });

  it('damages an NPC from every surviving player unit after a victory', () => {
    expect(calculateBattleOutcomeDamage('player', [
      { team: 'player', alive: true, tier: 1 },
      { team: 'player', alive: true, tier: 1 },
      { team: 'player', alive: true, tier: 1 },
      { team: 'player', alive: true, tier: 2 },
      { team: 'player', alive: true, tier: 2 },
      { team: 'player', alive: false, tier: 3 },
      { team: 'enemy', alive: true, tier: 3 }
    ])).toBe(14);
  });

  it('pays match gold only to the winner while both sides gain XP and interest', () => {
    const participants = createMatchParticipants(['You', 'NPC']).map(participant => ({
      ...participant,
      gold: participant.isLocalPlayer ? 21 : 10,
      health: participant.isLocalPlayer ? 100 : 8
    }));
    const outcome = {
      pairingId: 'round-1',
      participantIds: participants.map(participant => participant.id),
      winnerId: participants[0].id,
      loserId: participants[1].id,
      damage: 8
    };
    const settled = applyRoundOutcomes(participants, [outcome]);

    expect(settled[0]).toMatchObject({ gold: 28, experience: 2, streak: 1, health: 100 });
    expect(settled[1]).toMatchObject({ gold: 11, experience: 2, streak: -1, health: 0, eliminated: true });
    expect(settled[0].gold - participants[0].gold).toBe(MATCH_WIN_GOLD + 2);
  });

  it('keeps the readiness barrier closed until every active human is ready', () => {
    const participants = createMatchParticipants(['You', 'Human', 'NPC'], 2);
    const npcReady = markNpcParticipantsReady(participants);
    const localReady = setParticipantReady(npcReady, participants[0].id, true);

    expect(areAllActiveParticipantsReady(npcReady)).toBe(false);
    expect(areAllActiveParticipantsReady(localReady)).toBe(false);
    expect(areAllActiveParticipantsReady(setParticipantReady(localReady, participants[1].id, true))).toBe(true);
  });

  it('declares the final non-eliminated participant as the winner', () => {
    const participants = createMatchParticipants(['You', 'A', 'B']).map((participant, index) => index === 1
      ? participant
      : { ...participant, health: 0, eliminated: true });

    expect(getLastStanding(participants)?.name).toBe('A');
  });
});
