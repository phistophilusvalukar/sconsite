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
  attackDamage: number;
  magicDamage: number;
  attackSpeed: number;
  attackCooldownMs: number;
  moveCooldownMs: number;
  spellSlots: number;
  abilityCooldownMs: number;
  hasOpened: boolean;
  fearGemUsed: boolean;
  fleeingUntilMs: number;
  fleeingFrom: { q: number; r: number } | null;
}

const tickMs = 250;
const maxDurationMs = 45000;
const moveCooldownMs = 650;
const neighbors = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 }
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
  const frames: CombatFrame[] = [createFrame(0, combatants, 'Both battle lines advance under infernal drill signals.')];
  const ledger: string[] = [];
  let latestMessage = frames[0].message;

  for (let timeMs = tickMs; timeMs <= maxDurationMs; timeMs += tickMs) {
    const livingPlayer = combatants.filter(unit => unit.alive && unit.team === 'player');
    const livingEnemy = combatants.filter(unit => unit.alive && unit.team === 'enemy');
    if (livingPlayer.length === 0 || livingEnemy.length === 0) break;

    for (const unit of combatants.filter(candidate => candidate.alive).sort((a, b) => a.id.localeCompare(b.id))) {
      unit.attacking = false;
      unit.casting = false;
      unit.attackCooldownMs = Math.max(0, unit.attackCooldownMs - tickMs);
      unit.moveCooldownMs = Math.max(0, unit.moveCooldownMs - tickMs);
      unit.abilityCooldownMs = Math.max(0, unit.abilityCooldownMs - tickMs);

      if (unit.fleeingUntilMs > timeMs && unit.fleeingFrom) {
        if (unit.moveCooldownMs === 0) {
          moveAwayFrom(unit, unit.fleeingFrom, combatants);
          unit.moveCooldownMs = moveCooldownMs;
          latestMessage = `${unit.name} is Fleeing.`;
        }
        continue;
      }

      const target = chooseTarget(unit, combatants, seed + timeMs);
      if (!target) continue;

      if (hexDistance(unit, target) > unit.range) {
        if (unit.moveCooldownMs === 0) {
          moveToward(unit, target, combatants);
          unit.moveCooldownMs = unit.items.includes('boots-bounding') ? 450 : moveCooldownMs;
          latestMessage = `${unit.name} advances on ${target.name}.`;
        }
        continue;
      }

      const action = tryAbility(unit, combatants, timeMs);
      if (action) {
        latestMessage = action;
        ledger.unshift(action);
        continue;
      }

      if (unit.attackCooldownMs === 0) {
        const damage = calculateAttackDamage(unit, target, combatants);
        applyDamage(target, damage);
        const fearMessage = applyFearGem(unit, target, timeMs);
        unit.attacking = true;
        unit.attackCooldownMs = Math.round(1000 / Math.max(0.25, unit.attackSpeed));
        latestMessage = fearMessage ?? `${unit.name} strikes ${target.name} for ${damage}.`;
        ledger.unshift(latestMessage);
        if (!target.alive) {
          latestMessage = `${target.name} falls.`;
          ledger.unshift(latestMessage);
        }
      }
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
  const vanguardBonus = (synergyTiers.get('Vanguard') ?? 0) * 110;
  const signiferBonus = (synergyTiers.get('Signifer') ?? 0) * 14;
  const pyreBonus = (synergyTiers.get('Pyre') ?? 0) * 8;
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
    attackDamage: Math.round((input.unit.attackDamage + itemStats.attackDamage) * tierMultiplier),
    magicDamage: Math.round((input.unit.magicDamage + itemStats.magicDamage + signiferBonus + pyreBonus) * tierMultiplier),
    attackSpeed: input.unit.attackSpeed + itemStats.attackSpeed + ((synergyTiers.get('Duelist') ?? 0) * 0.08),
    attackCooldownMs: input.unit.id === 'gunslinger' ? 100 : seededValue(seedOffset + input.unit.cost, 0, 280),
    moveCooldownMs: seededValue(seedOffset + input.unit.health, 0, 300),
    spellSlots: input.unit.spellSlots + itemStats.spellSlots + ((synergyTiers.get('Gate') ?? 0) > 0 && input.unit.traits.includes('Gate') ? 1 : 0),
    abilityCooldownMs: input.unit.role === 'caster' ? 850 : 1400,
    hasOpened: false,
    fearGemUsed: false,
    fleeingUntilMs: 0,
    fleeingFrom: null
  };
}

function chooseTarget(unit: Combatant, combatants: Combatant[], seed: number) {
  const enemies = combatants.filter(candidate => candidate.alive && candidate.team !== unit.team);
  if (enemies.length === 0) return null;
  if (unit.pf2Class === 'Gunslinger' && !unit.hasOpened) {
    return [...enemies].sort((a, b) => unit.team === 'player' ? a.r - b.r : b.r - a.r)[0];
  }
  return [...enemies].sort((a, b) => {
    const distanceDelta = hexDistance(unit, a) - hexDistance(unit, b);
    if (distanceDelta !== 0) return distanceDelta;
    const hpDelta = a.hp - b.hp;
    if (hpDelta !== 0) return hpDelta;
    return seededValue(seed + a.maxHp, 0, 10) - seededValue(seed + b.maxHp, 0, 10);
  })[0];
}

function tryAbility(unit: Combatant, combatants: Combatant[], timeMs: number) {
  if (unit.abilityCooldownMs > 0) return null;

  if (unit.pf2Class === 'Barbarian' && !unit.hasOpened) {
    unit.attackDamage = Math.round(unit.attackDamage * 1.28);
    unit.hp = Math.min(unit.maxHp, unit.hp + Math.round(unit.maxHp * 0.12));
    unit.hasOpened = true;
    unit.casting = true;
    unit.abilityCooldownMs = 99999;
    return `${unit.name} enters Rage.`;
  }

  if (unit.pf2Class === 'Cleric' && unit.spellSlots > 0) {
    const ally = combatants
      .filter(candidate => candidate.alive && candidate.team === unit.team && candidate.hp < candidate.maxHp)
      .sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
    if (ally) {
      const healing = Math.round(unit.magicDamage * 1.4);
      ally.hp = Math.min(ally.maxHp, ally.hp + healing);
      unit.spellSlots -= 1;
      unit.casting = true;
      unit.abilityCooldownMs = 2400;
      return `${unit.name} uses Divine Font on ${ally.name} for ${healing}.`;
    }
  }

  if (unit.spellSlots > 0 && unit.magicDamage > 0) {
    const target = chooseTarget(unit, combatants, unit.maxHp + unit.hp);
    if (!target || hexDistance(unit, target) > Math.max(unit.range, 3)) return null;
    const damage = unit.pf2Class === 'Magus'
      ? Math.round(unit.attackDamage + unit.magicDamage * 1.2)
      : Math.round(unit.magicDamage * (unit.pf2Class === 'Sorcerer' ? 1.35 : 1.05));
    applyDamage(target, damage);
    const fearMessage = applyFearGem(unit, target, timeMs);
    unit.spellSlots -= 1;
    unit.casting = true;
    unit.hasOpened = true;
    unit.abilityCooldownMs = unit.pf2Class === 'Magus' ? 3200 : 2600;
    if (!target.alive) return `${unit.name} casts ${unit.pf2Class === 'Magus' ? 'Spellstrike' : unit.pf2Class === 'Witch' ? 'Hex Cantrip' : 'a spell'} and drops ${target.name}.`;
    return fearMessage ?? `${unit.name} casts ${unit.pf2Class === 'Magus' ? 'Spellstrike' : unit.pf2Class === 'Witch' ? 'Hex Cantrip' : 'a spell'} on ${target.name} for ${damage}.`;
  }

  return null;
}

function calculateAttackDamage(unit: Combatant, target: Combatant, combatants: Combatant[]) {
  let damage = unit.attackDamage;
  if (unit.pf2Class === 'Rogue') {
    const adjacentAllies = combatants.filter(candidate =>
      candidate.alive &&
      candidate.team === unit.team &&
      candidate.id !== unit.id &&
      hexDistance(candidate, target) <= 1
    ).length;
    if (adjacentAllies > 0) damage = Math.round(damage * 1.45);
  }
  if (unit.pf2Class === 'Monk' && unit.attackCooldownMs === 0) {
    damage = Math.round(damage * 1.15);
  }
  if (unit.items.includes('flaming-rune')) damage += 18;
  if (target.items.includes('resilient-rune') && target.hp === target.maxHp) damage = Math.round(damage * 0.78);
  unit.hasOpened = true;
  return Math.max(1, damage);
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

function moveToward(unit: Combatant, target: Combatant, combatants: Combatant[]) {
  const occupied = new Set(combatants.filter(candidate => candidate.alive && candidate.id !== unit.id).map(candidate => `${candidate.q}:${candidate.r}`));
  const next = neighbors
    .map(delta => ({ q: unit.q + delta.q, r: unit.r + delta.r }))
    .filter(hex => !occupied.has(`${hex.q}:${hex.r}`))
    .sort((a, b) => hexDistance(a, target) - hexDistance(b, target))[0];
  if (!next) return;
  unit.q = next.q;
  unit.r = next.r;
}

function moveAwayFrom(unit: Combatant, source: { q: number; r: number }, combatants: Combatant[]) {
  const occupied = new Set(combatants.filter(candidate => candidate.alive && candidate.id !== unit.id).map(candidate => `${candidate.q}:${candidate.r}`));
  const next = neighbors
    .map(delta => ({ q: unit.q + delta.q, r: unit.r + delta.r }))
    .filter(hex => !occupied.has(`${hex.q}:${hex.r}`))
    .sort((a, b) => hexDistance(b, source) - hexDistance(a, source))[0];
  if (!next) return;
  unit.q = next.q;
  unit.r = next.r;
}

function applyDamage(target: Combatant, damage: number) {
  target.hp = Math.max(0, target.hp - damage);
  if (target.hp === 0) {
    target.alive = false;
  }
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
    if (item.id === 'boots-bounding') stats.attackSpeed += 0.12;
    return stats;
  }, { attackDamage: 0, magicDamage: 0, health: 0, spellSlots: 0, attackSpeed: 0 });
}

function hexDistance(a: { q: number; r: number }, b: { q: number; r: number }) {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
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
