import { items, synergies, units, type BoardSlot, type OwnedUnit, type UnitTrait } from '../data/hellknightAutobattler';

export type CombatTeam = 'player' | 'enemy';

export interface CombatantInput {
  unit: OwnedUnit;
  slot: BoardSlot;
}

export interface CombatFrameUnit {
  id: string;
  team: CombatTeam;
  name: string;
  pf2Class: string;
  tier: 1 | 2 | 3;
  q: number;
  r: number;
  hp: number;
  maxHp: number;
  range: number;
  alive: boolean;
  casting: boolean;
  attacking: boolean;
  status: 'fleeing' | null;
}

export interface CombatFrame {
  timeMs: number;
  units: CombatFrameUnit[];
  message: string;
}

export interface CombatSimulationResult {
  winner: CombatTeam | 'draw';
  durationMs: number;
  frames: CombatFrame[];
  survivingPlayerUnits: number;
  survivingEnemyUnits: number;
  ledger: string[];
}

interface Combatant extends CombatFrameUnit {
  items: string[];
  role: OwnedUnit['role'];
  traits: UnitTrait[];
  attackDamage: number;
  magicDamage: number;
  attackSpeed: number;
  abilityAttackSpeedBonus: number;
  spellSlots: number;
  hasOpened: boolean;
  abilityUsed: boolean;
  fearGemUsed: boolean;
  fleeingUntilMs: number;
  fleeingFrom: { q: number; r: number } | null;
  attackCount: number;
  castCount: number;
  nextPeriodicMs: number;
  pinnedUntilMs: number;
  wardHp: number;
  reactionUsed: boolean;
  championReactionUsed: boolean;
  eidolonUsed: boolean;
  panacheReady: boolean;
  huntedTargetId: string | null;
  huntStacks: number;
  vulnerableTargetId: string | null;
  hexed: boolean;
  psycheUntilMs: number;
  burnDamage: number;
  burnUntilMs: number;
  rackTier: number;
  scourgeTier: number;
  nailTier: number;
  godclawTier: number;
  chainTier: number;
  pyreTier: number;
  torrentTier: number;
  executionerTier: number;
  duelistTier: number;
  menderTier: number;
}

export const COMBAT_TICK_MS = 1000;
const tickMs = COMBAT_TICK_MS;
const maxDurationMs = 45000;
const combatMinQ = -4;
const combatMaxQ = 4;
const combatMinR = -5;
const combatMaxR = 3;
const neighbors = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
  { q: 1, r: 1 }
];

export function simulateCombat({
  player,
  enemy,
  seed
}: {
  player: CombatantInput[];
  enemy: CombatantInput[];
  seed: number;
}): CombatSimulationResult {
  const playerSynergies = getActiveSynergyTiers(player.map(input => input.unit));
  const enemySynergies = getActiveSynergyTiers(enemy.map(input => input.unit));
  const combatants = [
    ...player.map(input => createCombatant(input, 'player', playerSynergies, 0)),
    ...enemy.map(input => createCombatant(input, 'enemy', enemySynergies, seed))
  ];
  initializeTeamAbilities(combatants);
  const frames: CombatFrame[] = [createFrame(0, combatants, 'Both battle lines advance under infernal drill signals.')];
  const ledger: string[] = [];
  let latestMessage = frames[0].message;

  for (let timeMs = tickMs; timeMs <= maxDurationMs; timeMs += tickMs) {
    const livingPlayer = combatants.filter(unit => unit.alive && unit.team === 'player');
    const livingEnemy = combatants.filter(unit => unit.alive && unit.team === 'enemy');
    if (livingPlayer.length === 0 || livingEnemy.length === 0) break;

    const actedUnitIds = new Set<string>();
    for (const unit of combatants.filter(candidate => candidate.alive).sort((a, b) => a.id.localeCompare(b.id))) {
      if (actedUnitIds.has(unit.id)) continue;
      unit.attacking = false;
      unit.casting = false;
      applyPeriodicEffects(unit, combatants, timeMs, ledger);
      if (!unit.alive) continue;
      if (unit.fleeingUntilMs > timeMs && unit.fleeingFrom) {
        moveAwayFrom(unit, unit.fleeingFrom, combatants);
        actedUnitIds.add(unit.id);
        latestMessage = `${unit.name} is Fleeing.`;
        continue;
      }
      if (unit.pinnedUntilMs > timeMs) continue;
      const enemiesInRange = combatants.filter(candidate => candidate.alive && candidate.team !== unit.team && gridDistance(unit, candidate) <= unit.range);
      const target = chooseTarget(unit, enemiesInRange.length > 0 ? enemiesInRange : combatants, seed + timeMs);
      if (!target) continue;
      if (unit.pf2Class === 'Rogue' && gridDistance(unit, target) <= unit.range && !isBehindTarget(unit, target)) {
        if (moveToward(unit, target, combatants, 'behind')) {
          actedUnitIds.add(unit.id);
          latestMessage = `${unit.name} slips toward ${target.name}'s flank.`;
          continue;
        }
      }
      if (gridDistance(unit, target) > unit.range) {
        if (moveToward(unit, target, combatants)) latestMessage = `${unit.name} advances on ${target.name}.`;
        actedUnitIds.add(unit.id);
        const reaction = triggerReactiveStrike(unit, combatants, timeMs, actedUnitIds);
        if (reaction) { latestMessage = reaction; ledger.unshift(reaction); }
        continue;
      }
      const action = trySpell(unit, combatants, timeMs) ?? tryAbility(unit, combatants, timeMs);
      if (action) {
        actedUnitIds.add(unit.id);
        latestMessage = action;
        ledger.unshift(action);
        const reaction = triggerReactiveStrike(unit, combatants, timeMs, actedUnitIds);
        if (reaction) { latestMessage = reaction; ledger.unshift(reaction); }
        continue;
      }
      const attacks = getBasicAttackCount(unit, combatants);
      let landedAttacks = 0;
      let totalDamage = 0;
      let namedAttackMessage: string | null = null;
      for (let attackIndex = 0; attackIndex < attacks && target.alive; attackIndex += 1) {
        const { damage, message } = calculateAttackDamage(unit, target, combatants, timeMs);
        applyDamage(target, damage, unit, combatants, timeMs, 'physical');
        applyOnHitEffects(unit, target, timeMs);
        const fearMessage = applyFearGem(unit, target, timeMs);
        unit.attacking = true;
        unit.attackCount += 1;
        landedAttacks += 1;
        totalDamage += damage;
        namedAttackMessage = fearMessage ?? message ?? namedAttackMessage;
        latestMessage = fearMessage ?? message ?? `${unit.name} strikes ${target.name} for ${damage}.`;
      }
      actedUnitIds.add(unit.id);
      if (landedAttacks > 1 && !namedAttackMessage) latestMessage = `${unit.name} strikes ${target.name} ${landedAttacks} times for ${totalDamage} total.`;
      ledger.unshift(latestMessage);
      if (!target.alive) { latestMessage = `${target.name} falls.`; ledger.unshift(latestMessage); }
    }
    frames.push(createFrame(timeMs, combatants, latestMessage));
  }

  const survivingPlayerUnits = combatants.filter(unit => unit.alive && unit.team === 'player').length;
  const survivingEnemyUnits = combatants.filter(unit => unit.alive && unit.team === 'enemy').length;
  const winner = survivingPlayerUnits === survivingEnemyUnits
    ? 'draw'
    : survivingPlayerUnits > survivingEnemyUnits
      ? 'player'
      : 'enemy';
  const durationMs = frames[frames.length - 1]?.timeMs ?? 0;
  const verdict = winner === 'draw'
    ? 'The duel times out in a brutal draw.'
    : `${winner === 'player' ? 'Your order' : 'The opposing order'} wins with ${winner === 'player' ? survivingPlayerUnits : survivingEnemyUnits} unit${(winner === 'player' ? survivingPlayerUnits : survivingEnemyUnits) === 1 ? '' : 's'} standing.`;

  return {
    winner,
    durationMs,
    frames: [...frames, createFrame(durationMs + tickMs, combatants, verdict)],
    survivingPlayerUnits,
    survivingEnemyUnits,
    ledger: [verdict, ...ledger].slice(0, 12)
  };
}

function createCombatant(input: CombatantInput, team: CombatTeam, synergyTiers: Map<UnitTrait, number>, seedOffset: number): Combatant {
  const tierMultiplier = input.unit.tier === 1 ? 1 : input.unit.tier === 2 ? 1.85 : 3.2;
  const itemStats = getItemStats(input.unit.items);
  const vanguardBonus = input.unit.traits.includes('Vanguard') ? (synergyTiers.get('Vanguard') ?? 0) * 110 : 0;
  const signiferBonus = input.unit.traits.includes('Signifer') ? (synergyTiers.get('Signifer') ?? 0) * 14 : 0;
  const pyreBonus = input.unit.traits.includes('Pyre') ? (synergyTiers.get('Pyre') ?? 0) * 8 : 0;
  const maxHp = Math.round((input.unit.health + itemStats.health + vanguardBonus) * tierMultiplier);
  return {
    id: `${team}-${input.unit.instanceId}`,
    team,
    name: input.unit.name,
    pf2Class: input.unit.pf2Class,
    tier: input.unit.tier,
    q: team === 'player' ? input.slot.q : -input.slot.q,
    r: team === 'player' ? input.slot.r : -input.slot.r - 4 - (seedOffset % 2),
    hp: maxHp,
    maxHp,
    range: input.unit.range + ((synergyTiers.get('Artillery') ?? 0) > 0 && input.unit.traits.includes('Artillery') ? 1 : 0),
    alive: true,
    casting: false,
    attacking: false,
    status: null,
    items: input.unit.items,
    role: input.unit.role,
    traits: input.unit.traits,
    attackDamage: Math.round((input.unit.attackDamage + itemStats.attackDamage) * tierMultiplier),
    magicDamage: Math.round((input.unit.magicDamage + itemStats.magicDamage + signiferBonus + pyreBonus) * tierMultiplier),
    attackSpeed: Math.min(3, attackSpeedToTier(input.unit.attackSpeed) + itemStats.attackSpeedTiers),
    abilityAttackSpeedBonus: 0,
    spellSlots: input.unit.spellSlots + itemStats.spellSlots
      + ((synergyTiers.get('Gate') ?? 0) > 0 && input.unit.traits.includes('Gate') ? synergyTiers.get('Gate') ?? 0 : 0)
      + ((synergyTiers.get('Signifer') ?? 0) > 0 && input.unit.traits.includes('Signifer') ? 1 : 0),
    hasOpened: false,
    abilityUsed: false,
    fearGemUsed: false,
    fleeingUntilMs: 0,
    fleeingFrom: null,
    attackCount: 0,
    castCount: 0,
    nextPeriodicMs: 4000,
    pinnedUntilMs: 0,
    wardHp: 0,
    reactionUsed: false,
    championReactionUsed: false,
    eidolonUsed: false,
    panacheReady: false,
    huntedTargetId: null,
    huntStacks: 0,
    vulnerableTargetId: null,
    hexed: false,
    psycheUntilMs: 0,
    burnDamage: 0,
    burnUntilMs: 0,
    rackTier: input.unit.traits.includes('Rack') ? synergyTiers.get('Rack') ?? 0 : 0,
    scourgeTier: input.unit.traits.includes('Scourge') ? synergyTiers.get('Scourge') ?? 0 : 0,
    nailTier: input.unit.traits.includes('Nail') ? synergyTiers.get('Nail') ?? 0 : 0,
    godclawTier: input.unit.traits.includes('Godclaw') ? synergyTiers.get('Godclaw') ?? 0 : 0,
    chainTier: input.unit.traits.includes('Chain') ? synergyTiers.get('Chain') ?? 0 : 0,
    pyreTier: input.unit.traits.includes('Pyre') ? synergyTiers.get('Pyre') ?? 0 : 0,
    torrentTier: input.unit.traits.includes('Torrent') ? synergyTiers.get('Torrent') ?? 0 : 0,
    executionerTier: input.unit.traits.includes('Executioner') ? synergyTiers.get('Executioner') ?? 0 : 0,
    duelistTier: input.unit.traits.includes('Duelist') ? synergyTiers.get('Duelist') ?? 0 : 0,
    menderTier: input.unit.traits.includes('Mender') ? synergyTiers.get('Mender') ?? 0 : 0
  };
}

function chooseTarget(unit: Combatant, combatants: Combatant[], seed: number) {
  const enemies = combatants.filter(candidate => candidate.alive && candidate.team !== unit.team);
  if (enemies.length === 0) return null;
  if (unit.pf2Class === 'Gunslinger') {
    return [...enemies].sort((a, b) => {
      const distanceDelta = gridDistance(unit, b) - gridDistance(unit, a);
      if (distanceDelta !== 0) return distanceDelta;
      return a.hp - b.hp;
    })[0];
  }
  return [...enemies].sort((a, b) => {
    const distanceDelta = gridDistance(unit, a) - gridDistance(unit, b);
    if (distanceDelta !== 0) return distanceDelta;
    const hpDelta = a.hp - b.hp;
    if (hpDelta !== 0) return hpDelta;
    return seededValue(seed + a.maxHp, 0, 10) - seededValue(seed + b.maxHp, 0, 10);
  })[0];
}

function trySpell(unit: Combatant, combatants: Combatant[], timeMs: number) {
  return tryPriorityAction(unit, combatants, timeMs, 'spell');
}

function tryAbility(unit: Combatant, combatants: Combatant[], timeMs: number) {
  return tryPriorityAction(unit, combatants, timeMs, 'ability');
}

function tryPriorityAction(unit: Combatant, combatants: Combatant[], timeMs: number, kind: 'spell' | 'ability') {

  if (kind === 'ability' && unit.pf2Class === 'Barbarian' && !unit.abilityUsed) {
    unit.abilityUsed = true;
    unit.attackDamage = Math.round(unit.attackDamage * 1.28);
    unit.wardHp += Math.round(unit.maxHp * 0.12);
    unit.hasOpened = true;
    unit.casting = true;
    return `${unit.name} enters Rage.`;
  }

  if (kind === 'spell' && unit.pf2Class === 'Cleric' && unit.spellSlots > 0) {
    const ally = combatants
      .filter(candidate => candidate.alive && candidate.team === unit.team && candidate.hp < candidate.maxHp)
      .sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
    if (ally) {
      const healing = Math.round(unit.magicDamage * 1.4);
      ally.hp = Math.min(ally.maxHp, ally.hp + healing);
      unit.spellSlots -= 1;
      unit.casting = true;
      return `${unit.name} uses Divine Font on ${ally.name} for ${healing}.`;
    }
  }

  if (kind === 'spell' && unit.pf2Class === 'Druid' && !unit.hasOpened && unit.spellSlots > 0) {
    const frontLine = combatants.filter(candidate => candidate.alive && candidate.team === unit.team)
      .sort((a, b) => unit.team === 'player' ? a.r - b.r : b.r - a.r)
      .slice(0, 3);
    const ward = Math.round(unit.magicDamage * 0.9);
    frontLine.forEach(ally => { ally.wardHp += ward; });
    unit.spellSlots -= 1;
    unit.hasOpened = true;
    unit.casting = true;
    return `${unit.name} raises a primal ward of ${ward} over the front line.`;
  }

  if (kind === 'ability' && unit.pf2Class === 'Inventor' && !unit.abilityUsed) {
    const target = chooseTarget(unit, combatants, unit.maxHp);
    if (!target || gridDistance(unit, target) > Math.max(unit.range, 2)) return null;
    unit.abilityUsed = true;
    const damage = Math.round(unit.attackDamage * 0.65 + unit.magicDamage * 1.15);
    applyDamage(target, damage, unit, combatants, timeMs, 'spell');
    applyOnHitEffects(unit, target, timeMs);
    unit.hasOpened = true;
    unit.casting = true;
    return `${unit.name} triggers Overdrive on ${target.name} for ${damage}.`;
  }

  if (kind === 'ability' && unit.pf2Class === 'Kineticist' && unit.attackCount > 0 && unit.attackCount % 3 === 0) {
    const targets = combatants.filter(candidate => candidate.alive && candidate.team !== unit.team && gridDistance(unit, candidate) <= 2).slice(0, 3);
    if (targets.length === 0) return null;
    const damage = Math.round(unit.magicDamage * 0.75);
    targets.forEach(target => applyDamage(target, damage, unit, combatants, timeMs, 'spell'));
    unit.casting = true;
    unit.attackCount += 1;
    return `${unit.name} unleashes Impulse Junction for ${damage}.`;
  }

  if (kind === 'spell' && unit.spellSlots > 0 && unit.magicDamage > 0) {
    const target = chooseTarget(unit, combatants, unit.maxHp + unit.hp);
    if (!target || gridDistance(unit, target) > Math.max(unit.range, 3)) return null;
    let damage = unit.pf2Class === 'Magus'
      ? Math.round(unit.attackDamage + unit.magicDamage * 1.2)
      : Math.round(unit.magicDamage * (unit.pf2Class === 'Sorcerer' ? 1.35 : 1.05));
    if (unit.pf2Class === 'Oracle') damage = Math.round(damage * (1 + (1 - unit.hp / unit.maxHp) * 0.75));
    if (unit.pf2Class === 'Psychic' && unit.psycheUntilMs > timeMs) damage = Math.round(damage * 1.45);
    applyDamage(target, damage, unit, combatants, timeMs, 'spell');
    applyOnHitEffects(unit, target, timeMs);
    if (unit.pf2Class === 'Wizard' && !unit.hasOpened) {
      combatants.filter(candidate => candidate.alive && candidate.team !== unit.team && candidate.id !== target.id && gridDistance(candidate, target) <= 1)
        .forEach(candidate => applyDamage(candidate, Math.round(damage * 0.45), unit, combatants, timeMs, 'spell'));
    }
    if (unit.pf2Class === 'Witch' && target.alive) target.hexed = true;
    if (unit.pf2Class === 'Oracle') applyDamage(unit, Math.round(unit.maxHp * 0.05), null, combatants, timeMs, 'true');
    const fearMessage = applyFearGem(unit, target, timeMs);
    unit.spellSlots -= 1;
    unit.castCount += 1;
    if (unit.pf2Class === 'Psychic' && unit.castCount === 2) unit.psycheUntilMs = timeMs + 5000;
    unit.casting = true;
    unit.hasOpened = true;
    if (!target.alive) return `${unit.name} casts ${unit.pf2Class === 'Magus' ? 'Spellstrike' : unit.pf2Class === 'Witch' ? 'Hex Cantrip' : 'a spell'} and drops ${target.name}.`;
    return fearMessage ?? `${unit.name} casts ${unit.pf2Class === 'Magus' ? 'Spellstrike' : unit.pf2Class === 'Witch' ? 'Hex Cantrip' : 'a spell'} on ${target.name} for ${damage}.`;
  }

  return null;
}

function calculateAttackDamage(unit: Combatant, target: Combatant, combatants: Combatant[], timeMs: number) {
  let damage = unit.attackDamage;
  let message: string | null = null;
  if (unit.pf2Class === 'Rogue') {
    const adjacentAllies = combatants.filter(candidate =>
      candidate.alive &&
      candidate.team === unit.team &&
      candidate.id !== unit.id &&
      gridDistance(candidate, target) <= 1
    ).length;
    if (adjacentAllies > 0) damage = Math.round(damage * 1.45);
  }
  if (unit.pf2Class === 'Ranger') {
    if (unit.huntedTargetId !== target.id) {
      unit.huntedTargetId = target.id;
      unit.huntStacks = 0;
    }
    unit.huntStacks = Math.min(5, unit.huntStacks + 1);
    damage = Math.round(damage * (1 + unit.huntStacks * 0.08));
  }
  if (unit.pf2Class === 'Monk' && (unit.attackCount + 1) % 3 === 0) {
    damage *= 2;
    target.pinnedUntilMs = Math.max(target.pinnedUntilMs, timeMs + 750);
    message = `${unit.name} uses Flurry of Blows on ${target.name} for ${damage}.`;
  }
  if (unit.pf2Class === 'Swashbuckler' && unit.panacheReady) {
    damage = Math.round(damage * 1.8);
    unit.panacheReady = false;
    message = `${unit.name} spends Panache on a finisher for ${damage}.`;
  }
  if (unit.scourgeTier > 0 && target.hp / target.maxHp >= 0.7) damage = Math.round(damage * (1 + unit.scourgeTier * 0.1));
  if (unit.executionerTier > 0 && target.hp / target.maxHp <= 0.35) damage = Math.round(damage * (1 + unit.executionerTier * 0.18));
  const mark = combatants.find(candidate => candidate.team === unit.team && candidate.vulnerableTargetId === target.id);
  if (mark) damage += 10 * Math.max(1, mark.tier);
  if (target.hexed && unit.role !== 'caster') {
    damage = Math.round(damage * 1.35);
    target.hexed = false;
  }
  if (unit.items.includes('flaming-rune')) damage += 18;
  if (target.items.includes('resilient-rune') && target.hp === target.maxHp) damage = Math.round(damage * 0.78);
  unit.hasOpened = true;
  return { damage: Math.max(1, Math.round(damage)), message };
}

function applyFearGem(unit: Combatant, target: Combatant, timeMs: number) {
  if (!unit.items.includes('fear-gem') || unit.fearGemUsed || !target.alive) return null;
  unit.fearGemUsed = true;
  target.fleeingUntilMs = timeMs + 1750;
  target.fleeingFrom = { q: unit.q, r: unit.r };
  target.status = 'fleeing';
  target.attacking = false;
  target.casting = false;
  return `${unit.name}'s Fear Gem sends ${target.name} Fleeing.`;
}

function moveToward(unit: Combatant, target: Combatant, combatants: Combatant[], intent: 'engage' | 'behind' = 'engage') {
  const next = chooseMovementDestination(unit, combatants, getPreferredPosition(unit, target, intent), target);
  if (!next) return false;
  unit.q = next.q;
  unit.r = next.r;
  return true;
}

function moveAwayFrom(unit: Combatant, source: { q: number; r: number }, combatants: Combatant[]) {
  const candidates = getReachableMovementCandidates(unit, combatants);
  const next = candidates
    .sort((a, b) => gridDistance(b, source) - gridDistance(a, source) || b.step - a.step)[0];
  if (!next) return false;
  unit.q = next.q;
  unit.r = next.r;
  return true;
}

function chooseMovementDestination(unit: Combatant, combatants: Combatant[], preferred: { q: number; r: number }, target: Combatant) {
  return getReachableMovementCandidates(unit, combatants)
    .sort((a, b) =>
      gridDistance(a, preferred) - gridDistance(b, preferred)
      || gridDistance(a, target) - gridDistance(b, target)
      || b.step - a.step
    )[0];
}

function getReachableMovementCandidates(unit: Combatant, combatants: Combatant[]) {
  const maxStep = getMovementStep(unit);
  const occupancy = getOccupancyMap(combatants, unit.id);
  const startKey = positionKey(unit);
  const visited = new Set([startKey]);
  const queue: Array<{ q: number; r: number; step: number }> = [{ q: unit.q, r: unit.r, step: 0 }];
  const results: Array<{ q: number; r: number; step: number }> = [];

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (current.step >= maxStep) continue;
    for (const delta of neighbors) {
      const next = { q: current.q + delta.q, r: current.r + delta.r, step: current.step + 1 };
      const key = positionKey(next);
      if (visited.has(key) || !isInsideCombatGrid(next)) continue;
      const occupant = occupancy.get(key);
      if (occupant && occupant !== unit.team) continue;
      visited.add(key);
      if (!occupant) results.push(next);
      if (!occupant || occupant === unit.team) queue.push(next);
    }
  }

  return results;
}

function getMovementStep(unit: Combatant) {
  const classOrAbilityBonus = unit.pf2Class === 'Monk' || (unit.pf2Class === 'Swashbuckler' && unit.panacheReady) ? 1 : 0;
  const itemBonus = unit.items.includes('boots-bounding') ? 1 : 0;
  return 1 + classOrAbilityBonus + itemBonus + unit.nailTier;
}

function isInsideCombatGrid(position: { q: number; r: number }) {
  return position.q >= combatMinQ && position.q <= combatMaxQ && position.r >= combatMinR && position.r <= combatMaxR;
}

function getPreferredPosition(unit: Combatant, target: Combatant, intent: 'engage' | 'behind') {
  if (intent !== 'behind') return target;
  const behind = getBehindPosition(target);
  return isInsideCombatGrid(behind) ? behind : target;
}

function getBehindPosition(target: Combatant) {
  const rDirection = target.team === 'enemy' ? -1 : 1;
  return {
    q: target.q,
    r: target.r + rDirection
  };
}

function isBehindTarget(unit: Combatant, target: Combatant) {
  const behind = getBehindPosition(target);
  return unit.q === behind.q && unit.r === behind.r;
}

function getOccupancyMap(combatants: Combatant[], movingUnitId: string) {
  const occupancy = new Map<string, CombatTeam>();
  combatants
    .filter(candidate => candidate.alive && candidate.id !== movingUnitId)
    .forEach(candidate => occupancy.set(positionKey(candidate), candidate.team));
  return occupancy;
}

function positionKey(position: { q: number; r: number }) {
  return `${position.q}:${position.r}`;
}

function applyDamage(
  target: Combatant,
  rawDamage: number,
  source: Combatant | null,
  combatants: Combatant[],
  timeMs: number,
  kind: 'physical' | 'spell' | 'true'
) {
  let damage = rawDamage;
  if (kind === 'spell' && target.rackTier > 0) damage = Math.round(damage * (1 - target.rackTier * 0.12));
  if (kind !== 'true' && target.godclawTier > 0) damage = Math.round(damage * (1 - target.godclawTier * 0.08));

  if (kind === 'physical' && target.pf2Class === 'Swashbuckler' && seededValue(timeMs + target.maxHp + target.attackCount, 0, 99) < 25) {
    target.panacheReady = true;
    return;
  }

  if (target.wardHp > 0 && kind !== 'true') {
    const absorbed = Math.min(target.wardHp, damage);
    target.wardHp -= absorbed;
    damage -= absorbed;
  }

  if (damage >= target.hp && target.pf2Class === 'Summoner' && !target.eidolonUsed) {
    target.eidolonUsed = true;
    target.hp = Math.max(1, Math.round(target.maxHp * 0.25));
    return;
  }

  if (source && kind !== 'true') {
    const champion = combatants.find(candidate =>
      candidate.alive && candidate.team === target.team && candidate.pf2Class === 'Champion'
      && !candidate.championReactionUsed && gridDistance(candidate, target) <= 1
    );
    if (champion) {
      damage = Math.round(damage * 0.55);
      champion.championReactionUsed = true;
    }
  }

  target.hp = Math.max(0, target.hp - Math.max(0, damage));
  if (target.hp === 0) {
    target.alive = false;
  }
}

function initializeTeamAbilities(combatants: Combatant[]) {
  for (const team of ['player', 'enemy'] as const) {
    const allies = combatants.filter(unit => unit.team === team);
    const thaumaturge = allies.find(unit => unit.pf2Class === 'Thaumaturge');
    if (thaumaturge) {
      const toughestEnemy = combatants.filter(unit => unit.team !== team).sort((a, b) => b.maxHp - a.maxHp)[0];
      thaumaturge.vulnerableTargetId = toughestEnemy?.id ?? null;
    }
  }
}

function applyPeriodicEffects(unit: Combatant, combatants: Combatant[], timeMs: number, ledger: string[]) {
  if (unit.burnUntilMs > timeMs && timeMs % 1000 === 0) {
    applyDamage(unit, unit.burnDamage, null, combatants, timeMs, 'true');
    if (!unit.alive) ledger.unshift(`${unit.name} falls to persistent fire.`);
  }
  if (timeMs < unit.nextPeriodicMs) return;
  unit.nextPeriodicMs += 4000;

  if (unit.menderTier > 0) {
    const wounded = combatants.filter(candidate => candidate.alive && candidate.team === unit.team && candidate.hp < candidate.maxHp)
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    if (wounded) wounded.hp = Math.min(wounded.maxHp, wounded.hp + 25 * unit.menderTier);
  }
  if (unit.torrentTier > 0 && unit.traits.includes('Torrent')) {
    const allies = combatants.filter(candidate => candidate.alive && candidate.team === unit.team);
    allies.forEach(ally => {
      ally.hp = Math.min(ally.maxHp, ally.hp + 18 * unit.torrentTier);
      ally.hexed = false;
      ally.burnUntilMs = 0;
    });
  }
}

function applyOnHitEffects(unit: Combatant, target: Combatant, timeMs: number) {
  if (!target.alive) return;
  if (unit.pyreTier > 0 && unit.traits.includes('Pyre')) {
    target.burnDamage = 8 * unit.pyreTier;
    target.burnUntilMs = timeMs + 3250;
  }
  if (unit.chainTier > 0 && unit.traits.includes('Chain') && unit.attackCount % 3 === 2) {
    target.pinnedUntilMs = Math.max(target.pinnedUntilMs, timeMs + 500 + unit.chainTier * 250);
  }
}

function triggerReactiveStrike(actor: Combatant, combatants: Combatant[], timeMs: number, actedUnitIds: Set<string>) {
  const fighter = combatants.find(candidate =>
    candidate.alive && candidate.team !== actor.team && candidate.pf2Class === 'Fighter'
    && !candidate.reactionUsed && !actedUnitIds.has(candidate.id) && gridDistance(candidate, actor) <= 1
  );
  if (!fighter) return null;
  fighter.reactionUsed = true;
  actedUnitIds.add(fighter.id);
  const damage = Math.round(fighter.attackDamage * 0.9);
  applyDamage(actor, damage, fighter, combatants, timeMs, 'physical');
  return `${fighter.name} uses Reactive Strike on ${actor.name} for ${damage}.`;
}

function hasAdjacentAlly(unit: Combatant, combatants: Combatant[]) {
  return combatants.some(candidate => candidate.alive && candidate.team === unit.team && candidate.id !== unit.id && gridDistance(candidate, unit) <= 1);
}

function createFrame(timeMs: number, combatants: Combatant[], message: string): CombatFrame {
  combatants.forEach(unit => {
    if (unit.status === 'fleeing' && unit.fleeingUntilMs <= timeMs) {
      unit.status = null;
      unit.fleeingFrom = null;
    }
  });
  return {
    timeMs,
    message,
    units: combatants.map(unit => ({
      id: unit.id,
      team: unit.team,
      name: unit.name,
      pf2Class: unit.pf2Class,
      tier: unit.tier,
      q: unit.q,
      r: unit.r,
      hp: unit.hp,
      maxHp: unit.maxHp,
      range: unit.range,
      alive: unit.alive,
      casting: unit.casting,
      attacking: unit.attacking,
      status: unit.status
    }))
  };
}

function getActiveSynergyTiers(army: OwnedUnit[]) {
  const counts = new Map<UnitTrait, number>();
  army.forEach(unit => unit.traits.forEach(trait => counts.set(trait, (counts.get(trait) ?? 0) + 1)));
  const tiers = new Map<UnitTrait, number>();
  counts.forEach((count, trait) => {
    const tier = synergies[trait].thresholds.filter(threshold => count >= threshold).length;
    if (tier > 0) tiers.set(trait, tier);
  });
  return tiers;
}

function getItemStats(itemIds: string[]) {
  return itemIds.reduce((stats, itemId) => {
    const item = items.find(candidate => candidate.id === itemId);
    if (!item) return stats;
    if (item.id === 'striking-rune' || item.id === 'doubling-rings') stats.attackDamage += item.id === 'striking-rune' ? 16 : 14;
    if (item.id === 'flaming-rune' || item.id === 'staff-fire' || item.id === 'fear-gem') stats.magicDamage += item.id === 'staff-fire' ? 28 : item.id === 'flaming-rune' ? 18 : 10;
    if (item.id === 'resilient-rune' || item.id === 'sturdy-shield' || item.id === 'elixir-life') stats.health += item.id === 'sturdy-shield' ? 150 : item.id === 'resilient-rune' ? 120 : 80;
    if (item.id === 'wand-magic-missile' || item.id === 'endless-grimoire') stats.spellSlots += 1;
    if (item.id === 'boots-bounding') stats.attackSpeedTiers += 1;
    return stats;
  }, { attackDamage: 0, magicDamage: 0, health: 0, spellSlots: 0, attackSpeedTiers: 0 });
}

function attackSpeedToTier(speed: 'slow' | 'medium' | 'fast') {
  return speed === 'slow' ? 1 : speed === 'medium' ? 2 : 3;
}

function getBasicAttackCount(unit: Combatant, combatants: Combatant[]) {
  const edictBonus = unit.duelistTier > 0 && !hasAdjacentAlly(unit, combatants) ? unit.duelistTier : 0;
  const normalAttackCount = Math.min(3, unit.attackSpeed + edictBonus);
  return Math.min(4, normalAttackCount + unit.abilityAttackSpeedBonus);
}
function gridDistance(a: { q: number; r: number }, b: { q: number; r: number }) {
  return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r));
}

function seededValue(seed: number, min: number, max: number) {
  const x = Math.sin(seed * 999) * 10000;
  const normalized = x - Math.floor(x);
  return Math.floor(normalized * (max - min + 1)) + min;
}

export function createEnemyArmy(seed: number, round: number): CombatantInput[] {
  const count = Math.min(7, 2 + Math.floor(round / 2));
  return Array.from({ length: count }, (_, index) => {
    const definition = units[(seededValue(seed + index * 23, 0, units.length - 1) + index) % units.length];
    const tier = round > 7 && index < 2 ? 2 : 1;
    const item = round > 3 && index % 2 === 0 ? [items[(seed + index) % items.length].id] : [];
    return {
      unit: {
        ...definition,
        instanceId: `enemy-${round}-${index}-${definition.id}`,
        tier,
        items: item
      },
      slot: {
        q: index % 5 - 2,
        r: Math.floor(index / 5),
        unitId: `enemy-${round}-${index}-${definition.id}`
      }
    };
  });
}
