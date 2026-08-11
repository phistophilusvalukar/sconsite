export const STARTING_PLAYER_HEALTH = 100;
export const STARTING_PLAYER_GOLD = 5;
export const STARTING_TEAM_CAPACITY = 4;
export const MAX_PLAYER_LEVEL = 5;
export const MATCH_EXPERIENCE = 2;
export const PURCHASE_EXPERIENCE = 4;
export const EXPERIENCE_PURCHASE_COST = 4;
export const MATCH_WIN_GOLD = 5;

const experienceToNextLevel: Record<number, number> = {
  1: 4,
  2: 8,
  3: 12,
  4: 16
};

export interface MatchParticipant {
  id: string;
  name: string;
  isLocalPlayer: boolean;
  isNpc: boolean;
  health: number;
  gold: number;
  level: number;
  experience: number;
  streak: number;
  ready: boolean;
  eliminated: boolean;
}

export interface RoundPairing {
  id: string;
  leftId: string;
  rightId: string | null;
}

export interface BattleOutcome {
  pairingId: string;
  participantIds: string[];
  winnerId: string | null;
  loserId: string | null;
  damage: number;
}

export interface NpcTeamSnapshot {
  power: number;
  unitTiers: Array<1 | 2 | 3>;
}

export function createMatchParticipants(names: string[], humanCount = 1): MatchParticipant[] {
  return names.map((name, index) => ({
    id: `player-${index}`,
    name,
    isLocalPlayer: index === 0,
    isNpc: index >= humanCount,
    health: STARTING_PLAYER_HEALTH,
    gold: STARTING_PLAYER_GOLD,
    level: 1,
    experience: 0,
    streak: 0,
    ready: index >= humanCount,
    eliminated: false
  }));
}

export function getExperienceRequired(level: number) {
  return level >= MAX_PLAYER_LEVEL ? 0 : experienceToNextLevel[level] ?? 0;
}

export function grantExperience(level: number, experience: number, amount: number) {
  let nextLevel = Math.max(1, Math.min(MAX_PLAYER_LEVEL, level));
  let nextExperience = Math.max(0, experience) + Math.max(0, amount);

  while (nextLevel < MAX_PLAYER_LEVEL) {
    const required = getExperienceRequired(nextLevel);
    if (required <= 0 || nextExperience < required) break;
    nextExperience -= required;
    nextLevel += 1;
  }

  if (nextLevel >= MAX_PLAYER_LEVEL) nextExperience = 0;
  return { level: nextLevel, experience: nextExperience };
}

export function purchaseExperience(level: number, experience: number, gold: number) {
  if (level >= MAX_PLAYER_LEVEL || gold < EXPERIENCE_PURCHASE_COST) {
    return { level, experience, gold, purchased: false };
  }
  const progression = grantExperience(level, experience, PURCHASE_EXPERIENCE);
  return {
    ...progression,
    gold: gold - EXPERIENCE_PURCHASE_COST,
    purchased: true
  };
}

export function getBaseTeamCapacity(level: number) {
  return Math.min(STARTING_TEAM_CAPACITY + MAX_PLAYER_LEVEL - 1, STARTING_TEAM_CAPACITY + Math.max(0, level - 1));
}

export function getTeamCapacity(level: number, vanguardTier: number) {
  return getBaseTeamCapacity(level) + (vanguardTier >= 3 ? 1 : 0);
}

export function trimBoardToCapacity<T extends { unitId: string | null }>(slots: T[], capacity: number) {
  const allowedUnits = new Set(
    slots
      .flatMap(slot => slot.unitId ? [slot.unitId] : [])
      .slice(0, Math.max(0, capacity))
  );
  const recalledUnitIds = slots
    .flatMap(slot => slot.unitId && !allowedUnits.has(slot.unitId) ? [slot.unitId] : []);

  return {
    slots: slots.map(slot => slot.unitId && !allowedUnits.has(slot.unitId) ? { ...slot, unitId: null } : slot),
    recalledUnitIds
  };
}

export function setParticipantReady(participants: MatchParticipant[], participantId: string, ready: boolean) {
  return participants.map(participant => participant.id === participantId ? { ...participant, ready } : participant);
}

export function markNpcParticipantsReady(participants: MatchParticipant[]) {
  return participants.map(participant => participant.isNpc && !participant.eliminated
    ? { ...participant, ready: true }
    : participant);
}

export function areAllActiveParticipantsReady(participants: MatchParticipant[]) {
  const active = participants.filter(participant => !participant.eliminated && participant.health > 0);
  return active.length > 0 && active.every(participant => participant.ready);
}

export function createRoundPairings(participants: MatchParticipant[], round: number, seed: number): RoundPairing[] {
  const active = participants
    .filter(participant => !participant.eliminated && participant.health > 0)
    .sort((left, right) => seededRank(left.id, round, seed) - seededRank(right.id, round, seed) || left.id.localeCompare(right.id));
  const pairings: RoundPairing[] = [];

  for (let index = 0; index < active.length; index += 2) {
    const left = active[index];
    const right = active[index + 1] ?? null;
    pairings.push({
      id: `round-${round}-${left.id}-${right?.id ?? 'echo'}`,
      leftId: left.id,
      rightId: right?.id ?? null
    });
  }
  return pairings;
}

export function calculateSurvivorDamage(unitTiers: Array<1 | 2 | 3>) {
  return unitTiers.reduce((damage, tier) => damage + tier * 2, 0);
}

export function calculateBattleOutcomeDamage(
  winner: 'player' | 'enemy' | 'draw',
  units: ReadonlyArray<{ team: 'player' | 'enemy'; alive: boolean; tier: 1 | 2 | 3 }>
) {
  if (winner === 'draw') return 0;
  return calculateSurvivorDamage(units
    .filter(unit => unit.team === winner && unit.alive)
    .map(unit => unit.tier));
}

export function createNpcTeamSnapshot(participant: MatchParticipant, round: number, seed: number): NpcTeamSnapshot {
  const unitCount = getBaseTeamCapacity(participant.level);
  const tierTwoCount = Math.min(unitCount, Math.max(0, Math.floor((round - 3) / 2)));
  const tierThreeCount = Math.min(tierTwoCount, Math.max(0, Math.floor((round - 8) / 3)));
  const unitTiers = Array.from({ length: unitCount }, (_, index): 1 | 2 | 3 => {
    if (index < tierThreeCount) return 3;
    if (index < tierTwoCount) return 2;
    return 1;
  });
  const tierPower = unitTiers.reduce((power, tier) => power + tier * 115, 0);
  const variance = seededRank(participant.id, round, seed) % 121 - 60;
  return {
    power: Math.max(1, tierPower + participant.level * 90 + round * 35 + participant.gold * 2 + variance),
    unitTiers
  };
}

export function resolveNpcPairing(
  pairing: RoundPairing,
  participants: MatchParticipant[],
  round: number,
  seed: number
): BattleOutcome {
  const left = participants.find(participant => participant.id === pairing.leftId);
  if (!left) return { pairingId: pairing.id, participantIds: [], winnerId: null, loserId: null, damage: 0 };
  const leftTeam = createNpcTeamSnapshot(left, round, seed);
  const right = pairing.rightId ? participants.find(participant => participant.id === pairing.rightId) : null;
  const rightTeam = right
    ? createNpcTeamSnapshot(right, round, seed + 17)
    : createEchoTeamSnapshot(left, round, seed);
  const leftWins = leftTeam.power === rightTeam.power
    ? seededRank(left.id, round, seed + 31) % 2 === 0
    : leftTeam.power > rightTeam.power;
  const winningTeam = leftWins ? leftTeam : rightTeam;
  const losingTeam = leftWins ? rightTeam : leftTeam;
  const closeness = Math.abs(winningTeam.power - losingTeam.power) / Math.max(1, winningTeam.power);
  const survivors = Math.max(1, Math.min(
    winningTeam.unitTiers.length,
    Math.ceil(winningTeam.unitTiers.length * (0.2 + Math.min(1, closeness) * 0.8))
  ));

  return {
    pairingId: pairing.id,
    participantIds: [left.id, ...(right ? [right.id] : [])],
    winnerId: leftWins ? left.id : right?.id ?? null,
    loserId: leftWins ? right?.id ?? null : left.id,
    damage: calculateSurvivorDamage(winningTeam.unitTiers.slice(0, survivors))
  };
}

export function applyRoundOutcomes(participants: MatchParticipant[], outcomes: BattleOutcome[]): MatchParticipant[] {
  return participants.map(participant => {
    if (participant.eliminated || participant.health <= 0) return { ...participant, ready: false, eliminated: true };
    const outcome = outcomes.find(candidate => candidate.participantIds.includes(participant.id));
    if (!outcome) return { ...participant, ready: participant.isNpc };

    const interest = Math.floor(participant.gold / 10);
    const won = outcome.winnerId === participant.id;
    const lost = outcome.loserId === participant.id;
    const nextHealth = lost ? Math.max(0, participant.health - outcome.damage) : participant.health;
    const progression = grantExperience(participant.level, participant.experience, MATCH_EXPERIENCE);

    return {
      ...participant,
      ...progression,
      health: nextHealth,
      gold: participant.gold + interest + (won ? MATCH_WIN_GOLD : 0),
      streak: won ? Math.max(1, participant.streak + 1) : lost ? Math.min(-1, participant.streak - 1) : 0,
      ready: participant.isNpc,
      eliminated: nextHealth === 0
    };
  });
}

export function getLastStanding(participants: MatchParticipant[]) {
  const active = participants.filter(participant => !participant.eliminated && participant.health > 0);
  return active.length === 1 ? active[0] : null;
}

function createEchoTeamSnapshot(participant: MatchParticipant, round: number, seed: number): NpcTeamSnapshot {
  const source = createNpcTeamSnapshot(participant, round, seed + 97);
  const adjustment = seededRank(participant.id, round, seed + 113) % 101 - 50;
  return { ...source, power: Math.max(1, source.power + adjustment) };
}

function seededRank(id: string, round: number, seed: number) {
  let hash = (round * 73856093) ^ (seed * 19349663);
  for (let index = 0; index < id.length; index += 1) {
    hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}
