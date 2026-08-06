export type UnitRole = 'martial' | 'caster' | 'hybrid' | 'ranged';
export type AttackSpeed = 'slow' | 'medium' | 'fast';
export type HellknightOrder = 'Rack' | 'Scourge' | 'Nail' | 'Godclaw' | 'Chain' | 'Gate' | 'Pyre' | 'Torrent';
export type UnitTrait = HellknightOrder | 'Vanguard' | 'Signifer' | 'Executioner' | 'Duelist' | 'Mender' | 'Artillery';

export interface UnitDefinition {
  id: string;
  name: string;
  pf2Class: string;
  cost: number;
  role: UnitRole;
  traits: UnitTrait[];
  range: number;
  attackSpeed: AttackSpeed;
  attackDamage: number;
  magicDamage: number;
  spellSlots: number;
  health: number;
  feat: string;
  featText: string;
}

export interface ItemDefinition {
  id: string;
  name: string;
  sourceType: string;
  cost: number;
  stat: string;
  effect: string;
}

export interface OwnedUnit extends UnitDefinition {
  instanceId: string;
  tier: 1 | 2 | 3;
  items: string[];
}

export interface BoardSlot {
  q: number;
  r: number;
  unitId: string | null;
}

export const boardSlots: BoardSlot[] = [
  { q: -2, r: 0, unitId: null },
  { q: -1, r: 0, unitId: null },
  { q: 0, r: 0, unitId: null },
  { q: 1, r: 0, unitId: null },
  { q: 2, r: 0, unitId: null },
  { q: -2, r: 1, unitId: null },
  { q: -1, r: 1, unitId: null },
  { q: 0, r: 1, unitId: null },
  { q: 1, r: 1, unitId: null },
  { q: 2, r: 1, unitId: null },
  { q: -2, r: 2, unitId: null },
  { q: -1, r: 2, unitId: null },
  { q: 0, r: 2, unitId: null },
  { q: 1, r: 2, unitId: null },
  { q: 2, r: 2, unitId: null }
];

export const units: UnitDefinition[] = [
  {
    id: 'fighter',
    name: 'Paralictor Fighter',
    pf2Class: 'Fighter',
    cost: 2,
    role: 'martial',
    traits: ['Godclaw', 'Vanguard', 'Executioner'],
    range: 1,
    attackSpeed: 'medium',
    attackDamage: 58,
    magicDamage: 0,
    spellSlots: 0,
    health: 760,
    feat: 'Reactive Strike',
    featText: 'Punishes the first enemy that closes or casts near them each duel.'
  },
  {
    id: 'barbarian',
    name: 'Nail Breaker',
    pf2Class: 'Barbarian',
    cost: 2,
    role: 'martial',
    traits: ['Nail', 'Vanguard', 'Executioner'],
    range: 1,
    attackSpeed: 'slow',
    attackDamage: 72,
    magicDamage: 0,
    spellSlots: 0,
    health: 860,
    feat: 'Rage',
    featText: 'Opens combat with 28% bonus attack damage and a temporary ward worth 12% maximum health.'
  },
  {
    id: 'champion',
    name: 'Godclaw Justiciar',
    pf2Class: 'Champion',
    cost: 3,
    role: 'martial',
    traits: ['Godclaw', 'Vanguard', 'Mender'],
    range: 1,
    attackSpeed: 'slow',
    attackDamage: 50,
    magicDamage: 16,
    spellSlots: 1,
    health: 900,
    feat: 'Champion Reaction',
    featText: 'Shields the lowest-health adjacent ally once per duel.'
  },
  {
    id: 'ranger',
    name: 'Nail Pursuer',
    pf2Class: 'Ranger',
    cost: 2,
    role: 'ranged',
    traits: ['Nail', 'Duelist', 'Artillery'],
    range: 3,
    attackSpeed: 'medium',
    attackDamage: 50,
    magicDamage: 0,
    spellSlots: 0,
    health: 610,
    feat: 'Hunt Prey',
    featText: 'Focuses a marked target for ramping basic attack pressure.'
  },
  {
    id: 'rogue',
    name: 'Scourge Inquisitor',
    pf2Class: 'Rogue',
    cost: 1,
    role: 'martial',
    traits: ['Scourge', 'Duelist', 'Executioner'],
    range: 1,
    attackSpeed: 'fast',
    attackDamage: 44,
    magicDamage: 0,
    spellSlots: 0,
    health: 540,
    feat: 'Sneak Attack',
    featText: 'Deals extra damage when allies are also engaging the target.'
  },
  {
    id: 'wizard',
    name: 'Rack Archivist',
    pf2Class: 'Wizard',
    cost: 3,
    role: 'caster',
    traits: ['Rack', 'Signifer'],
    range: 3,
    attackSpeed: 'slow',
    attackDamage: 24,
    magicDamage: 76,
    spellSlots: 3,
    health: 430,
    feat: 'Arcane Thesis',
    featText: 'First spell each duel splashes to enemies beside the target.'
  },
  {
    id: 'sorcerer',
    name: 'Gate Blooded Signifer',
    pf2Class: 'Sorcerer',
    cost: 4,
    role: 'caster',
    traits: ['Gate', 'Signifer'],
    range: 3,
    attackSpeed: 'slow',
    attackDamage: 26,
    magicDamage: 92,
    spellSlots: 4,
    health: 470,
    feat: 'Sorcerous Potency',
    featText: 'Spells grow stronger with active Signifer Edict tiers.'
  },
  {
    id: 'cleric',
    name: 'Godclaw Chaplain',
    pf2Class: 'Cleric',
    cost: 2,
    role: 'caster',
    traits: ['Godclaw', 'Signifer', 'Mender'],
    range: 3,
    attackSpeed: 'slow',
    attackDamage: 22,
    magicDamage: 58,
    spellSlots: 3,
    health: 520,
    feat: 'Divine Font',
    featText: 'Spends a slot to heal the most wounded ally before attacking.'
  },
  {
    id: 'druid',
    name: 'Torrent Warden',
    pf2Class: 'Druid',
    cost: 3,
    role: 'caster',
    traits: ['Torrent', 'Mender'],
    range: 3,
    attackSpeed: 'slow',
    attackDamage: 28,
    magicDamage: 70,
    spellSlots: 3,
    health: 560,
    feat: 'Order Spell',
    featText: 'Calls a warding surge that grants temporary health to the front line.'
  },
  {
    id: 'witch',
    name: 'Rack Hexbinder',
    pf2Class: 'Witch',
    cost: 3,
    role: 'caster',
    traits: ['Rack', 'Signifer'],
    range: 3,
    attackSpeed: 'slow',
    attackDamage: 20,
    magicDamage: 84,
    spellSlots: 3,
    health: 420,
    feat: 'Hex Cantrip',
    featText: 'Weakens an enemy so the next martial strike against it hits harder.'
  },
  {
    id: 'magus',
    name: 'Gate Spellblade',
    pf2Class: 'Magus',
    cost: 4,
    role: 'hybrid',
    traits: ['Gate', 'Duelist', 'Signifer'],
    range: 1,
    attackSpeed: 'slow',
    attackDamage: 62,
    magicDamage: 66,
    spellSlots: 2,
    health: 700,
    feat: 'Spellstrike',
    featText: 'Combines a weapon hit and spell burst, then recharges slowly.'
  },
  {
    id: 'gunslinger',
    name: 'Chain Pistolero',
    pf2Class: 'Gunslinger',
    cost: 4,
    role: 'ranged',
    traits: ['Chain', 'Artillery', 'Duelist'],
    range: 4,
    attackSpeed: 'medium',
    attackDamage: 84,
    magicDamage: 0,
    spellSlots: 0,
    health: 560,
    feat: 'Singular Expertise',
    featText: 'High opening shot damage against the enemy back line.'
  },
  {
    id: 'inventor',
    name: 'Pyre Armiger Smith',
    pf2Class: 'Inventor',
    cost: 3,
    role: 'hybrid',
    traits: ['Pyre', 'Artillery'],
    range: 2,
    attackSpeed: 'slow',
    attackDamage: 52,
    magicDamage: 46,
    spellSlots: 0,
    health: 650,
    feat: 'Overdrive',
    featText: 'Converts engineering heat into bonus mixed damage.'
  },
  {
    id: 'kineticist',
    name: 'Pyre Gatekeeper',
    pf2Class: 'Kineticist',
    cost: 5,
    role: 'hybrid',
    traits: ['Pyre', 'Gate', 'Vanguard'],
    range: 2,
    attackSpeed: 'slow',
    attackDamage: 48,
    magicDamage: 98,
    spellSlots: 0,
    health: 820,
    feat: 'Impulse Junction',
    featText: 'Unleashes a cone of elemental pressure every few attacks.'
  },
  {
    id: 'oracle',
    name: 'Scourge Oracle',
    pf2Class: 'Oracle',
    cost: 4,
    role: 'caster',
    traits: ['Scourge', 'Signifer', 'Mender'],
    range: 3,
    attackSpeed: 'slow',
    attackDamage: 22,
    magicDamage: 96,
    spellSlots: 4,
    health: 500,
    feat: 'Mystery Curse',
    featText: 'Gains stronger spells as health falls, but bleeds after casting.'
  },
  {
    id: 'monk',
    name: 'Chain Enforcer',
    pf2Class: 'Monk',
    cost: 2,
    role: 'martial',
    traits: ['Chain', 'Duelist', 'Vanguard'],
    range: 1,
    attackSpeed: 'fast',
    attackDamage: 38,
    magicDamage: 0,
    spellSlots: 0,
    health: 620,
    feat: 'Flurry of Blows',
    featText: 'Every third attack lands twice and briefly pins the target.'
  },
  {
    id: 'swashbuckler',
    name: 'Torrent Duelist',
    pf2Class: 'Swashbuckler',
    cost: 2,
    role: 'martial',
    traits: ['Torrent', 'Duelist'],
    range: 1,
    attackSpeed: 'fast',
    attackDamage: 48,
    magicDamage: 0,
    spellSlots: 0,
    health: 580,
    feat: 'Panache',
    featText: 'Gains dodge and a finishing strike after avoiding damage.'
  },
  {
    id: 'summoner',
    name: 'Gate Eidolonist',
    pf2Class: 'Summoner',
    cost: 5,
    role: 'caster',
    traits: ['Gate', 'Signifer', 'Vanguard'],
    range: 3,
    attackSpeed: 'slow',
    attackDamage: 26,
    magicDamage: 104,
    spellSlots: 3,
    health: 620,
    feat: 'Eidolon Link',
    featText: 'Projects a bound vanguard that absorbs the first lethal blow.'
  },
  {
    id: 'thaumaturge',
    name: 'Scourge Esotericist',
    pf2Class: 'Thaumaturge',
    cost: 3,
    role: 'hybrid',
    traits: ['Scourge', 'Executioner'],
    range: 2,
    attackSpeed: 'medium',
    attackDamage: 54,
    magicDamage: 38,
    spellSlots: 0,
    health: 640,
    feat: 'Exploit Vulnerability',
    featText: 'Marks the toughest enemy so all allies deal bonus true damage.'
  },
  {
    id: 'psychic',
    name: 'Rack Thought-Censor',
    pf2Class: 'Psychic',
    cost: 4,
    role: 'caster',
    traits: ['Rack', 'Signifer'],
    range: 3,
    attackSpeed: 'slow',
    attackDamage: 24,
    magicDamage: 90,
    spellSlots: 3,
    health: 440,
    feat: 'Unleash Psyche',
    featText: 'After casting twice, gains a brief spike of psychic damage.'
  }
];

export const items: ItemDefinition[] = [
  { id: 'flaming-rune', name: 'Flaming Rune', sourceType: 'Weapon rune', cost: 5, stat: '+18 magic damage', effect: 'Basic attacks burn the target.' },
  { id: 'striking-rune', name: 'Striking Rune', sourceType: 'Weapon rune', cost: 5, stat: '+16 attack damage', effect: 'Tier bonuses scale attack damage harder.' },
  { id: 'resilient-rune', name: 'Resilient Rune', sourceType: 'Armor rune', cost: 4, stat: '+120 health', effect: 'Reduces first spell hit each duel.' },
  { id: 'sturdy-shield', name: 'Sturdy Shield', sourceType: 'Shield', cost: 3, stat: '+150 health', effect: 'Blocks a burst of physical damage.' },
  { id: 'elixir-life', name: 'Elixir of Life', sourceType: 'Alchemical elixir', cost: 3, stat: '+80 health', effect: 'Heals once at low health.' },
  { id: 'wand-magic-missile', name: 'Wand of Force Barrage', sourceType: 'Wand', cost: 4, stat: '+1 spell slot', effect: 'First spell fires extra force bolts.' },
  { id: 'staff-fire', name: 'Staff of Fire', sourceType: 'Staff', cost: 6, stat: '+28 magic damage', effect: 'Spells splash fire damage.' },
  { id: 'doubling-rings', name: 'Doubling Rings', sourceType: 'Worn item', cost: 5, stat: '+14 attack damage', effect: 'Copies the other held item bonus at 50% value.' },
  { id: 'boots-bounding', name: 'Boots of Bounding', sourceType: 'Worn item', cost: 3, stat: '+1 attack speed tier', effect: 'Raises attack speed by one tier and permits longer movement.' },
  { id: 'endless-grimoire', name: 'Endless Grimoire', sourceType: 'Grimoire', cost: 5, stat: '+1 spell slot', effect: 'Prepared casters open with an extra spell.' },
  { id: 'fear-gem', name: 'Fear Gem', sourceType: 'Consumable talisman', cost: 4, stat: '+10 magic damage', effect: 'First hit applies Fleeing, making the target run away and stop attacking briefly.' },
  { id: 'sleeves-storage', name: 'Sleeves of Storage', sourceType: 'Worn item', cost: 2, stat: '+1 item sale gold', effect: 'Selling this item refunds a bonus gold.' }
];

export const synergies: Record<UnitTrait, { thresholds: number[]; text: string }> = {
  Rack: { thresholds: [2, 4], text: 'Rack units take 12% less spell damage per tier.' },
  Scourge: { thresholds: [2, 4], text: 'Scourge units deal 10% more damage per tier to enemies above 70% health.' },
  Nail: { thresholds: [2, 3], text: 'Nail units move one additional square per tier while pursuing enemies.' },
  Godclaw: { thresholds: [2, 4], text: 'Godclaw units take 8% less non-true damage per tier.' },
  Chain: { thresholds: [2, 3], text: 'Every third Chain-unit attack pins its target, longer at higher tiers.' },
  Gate: { thresholds: [2, 4], text: 'Gate units gain one bonus spell slot per tier.' },
  Pyre: { thresholds: [2, 3], text: 'Pyre-unit hits apply persistent fire damage per tier.' },
  Torrent: { thresholds: [2, 3], text: 'Torrent units periodically heal allies and cleanse hexes and fire.' },
  Vanguard: { thresholds: [2, 4, 6], text: 'Vanguards gain 110 maximum health per tier.' },
  Signifer: { thresholds: [2, 4, 6], text: 'Signifers gain 14 magic damage per tier and one spell slot.' },
  Executioner: { thresholds: [2, 4], text: 'Executioners deal 18% more damage per tier to enemies below 35% health.' },
  Duelist: { thresholds: [2, 4], text: 'Isolated Duelists gain one attack speed tier per Edict tier, up to fast.' },
  Mender: { thresholds: [2, 3], text: 'Each Mender periodically restores 25 health per tier to the most wounded ally.' },
  Artillery: { thresholds: [2, 4], text: 'Artillery units gain one hex of attack range.' }
};

export const lobbyNames = ['Sable Verdict', 'Ashen Writ', 'Iron Docket', 'Citadel Vraid', 'Godclaw Bench', 'Chain Ledger', 'Signifer Choir'];
