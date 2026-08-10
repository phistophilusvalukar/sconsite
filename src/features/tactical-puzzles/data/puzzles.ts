import type { CreatureDefinition, PuzzleDefinition } from '../engine/types';

const baseCreature: CreatureDefinition = {
  id: 'creature',
  name: 'Creature',
  team: 'neutral',
  controlled: false,
  position: { x: 0, y: 0 },
  size: 1,
  hp: 10,
  maxHp: 10,
  ac: 18,
  speed: 25,
  reach: 1,
  perception: 6,
  fortitude: 6,
  reflex: 6,
  will: 6,
  skills: { athletics: 6, deception: 6, intimidation: 6 },
  actionIds: ['stride', 'step', 'strike'],
  attacks: [{ id: 'weapon', name: 'Weapon', attackBonus: 8, damage: 10, damageType: 'slashing', agile: false, range: 1, traits: [] }],
  spells: [],
  initiative: 10,
  traits: []
};

function creature(overrides: Partial<CreatureDefinition> & Pick<CreatureDefinition, 'id' | 'name' | 'team' | 'position'>): CreatureDefinition {
  return {
    ...baseCreature,
    ...overrides,
    position: { ...overrides.position },
    skills: { ...baseCreature.skills, ...overrides.skills },
    actionIds: overrides.actionIds ? [...overrides.actionIds] : [...baseCreature.actionIds],
    attacks: overrides.attacks ? overrides.attacks.map(attack => ({ ...attack, traits: [...attack.traits] })) : baseCreature.attacks.map(attack => ({ ...attack, traits: [...attack.traits] })),
    spells: overrides.spells ? overrides.spells.map(spell => ({ ...spell })) : [],
    traits: overrides.traits ? [...overrides.traits] : []
  };
}

export const bundledPuzzles: PuzzleDefinition[] = [
  {
    schemaVersion: 1,
    id: 'basic-strike',
    title: 'Basic Strike',
    summary: 'Read the battlefield, spend one action, and resolve a deterministic Strike.',
    difficulty: 'tutorial',
    tags: ['tutorial', 'strike', 'rolls'],
    board: { width: 5, height: 5, terrain: [] },
    creatures: [
      creature({ id: 'fighter', name: 'Valeros', team: 'player', controlled: true, position: { x: 1, y: 2 }, initiative: 20, actionIds: ['strike'] }),
      creature({ id: 'guard', name: 'Practice Guard', team: 'enemy', position: { x: 2, y: 2 }, initiative: 10, hp: 10, maxHp: 10, ac: 18, attacks: [] })
    ],
    rolls: [12],
    objective: { type: 'defeat-all-enemies' },
    maxRounds: 1,
    hints: ['Select Strike, then select the adjacent guard.'],
    intendedSolution: [{ type: 'USE_ACTION', actorId: 'fighter', actionId: 'strike', targetId: 'guard' }],
    author: 'Citadel Academy'
  },
  {
    schemaVersion: 1,
    id: 'find-the-opening',
    title: 'Find the Opening',
    summary: 'A normal attack misses. Move close, create an opening with Feint, then exploit it.',
    difficulty: 'easy',
    tags: ['feint', 'off-guard', 'movement'],
    board: { width: 6, height: 5, terrain: [{ x: 4, y: 1, type: 'blocked' }] },
    creatures: [
      creature({
        id: 'rogue', name: 'Merisiel', team: 'player', controlled: true, position: { x: 0, y: 2 }, initiative: 22,
        actionIds: ['stride', 'strike', 'feint'],
        skills: { athletics: 5, deception: 8, intimidation: 4 },
        attacks: [{ id: 'rapier', name: 'Rapier', attackBonus: 8, damage: 10, damageType: 'piercing', agile: true, range: 1, traits: ['finesse'] }]
      }),
      creature({ id: 'guard', name: 'Armored Guard', team: 'enemy', position: { x: 2, y: 2 }, initiative: 14, hp: 10, maxHp: 10, ac: 20, perception: 8, attacks: [] })
    ],
    rolls: [12, 10],
    objective: { type: 'defeat-all-enemies' },
    maxRounds: 1,
    hints: ['Your 10 becomes an 18—exactly enough only while the guard is off-guard.', 'Stride adjacent, Feint, then Strike.'],
    intendedSolution: [
      { type: 'USE_ACTION', actorId: 'rogue', actionId: 'stride', destination: { x: 1, y: 2 } },
      { type: 'USE_ACTION', actorId: 'rogue', actionId: 'feint', targetId: 'guard' },
      { type: 'USE_ACTION', actorId: 'rogue', actionId: 'strike', targetId: 'guard', attackId: 'rapier' }
    ],
    author: 'Citadel Academy'
  },
  {
    schemaVersion: 1,
    id: 'make-the-flank',
    title: 'Make the Flank',
    summary: 'Place your ally opposite the fighter so positional off-guard turns a miss into a hit.',
    difficulty: 'moderate',
    tags: ['flanking', 'allies', 'initiative'],
    board: { width: 6, height: 5, terrain: [] },
    creatures: [
      creature({ id: 'fighter', name: 'Kyra', team: 'player', controlled: true, position: { x: 1, y: 2 }, initiative: 15, actionIds: ['strike'], attacks: [{ id: 'sword', name: 'Longsword', attackBonus: 8, damage: 12, damageType: 'slashing', agile: false, range: 1, traits: [] }] }),
      creature({ id: 'ally', name: 'Ezren', team: 'ally', controlled: true, position: { x: 3, y: 0 }, initiative: 20, actionIds: ['stride'] }),
      creature({ id: 'captain', name: 'Shield Captain', team: 'enemy', position: { x: 2, y: 2 }, initiative: 10, hp: 12, maxHp: 12, ac: 20, attacks: [] })
    ],
    rolls: [10],
    objective: { type: 'defeat-all-enemies' },
    maxRounds: 1,
    hints: ['Move Ezren to the square directly opposite Kyra, then end his turn.', 'Flanking is calculated from positions; it is not stored on the captain.'],
    intendedSolution: [
      { type: 'USE_ACTION', actorId: 'ally', actionId: 'stride', destination: { x: 3, y: 2 } },
      { type: 'END_TURN', actorId: 'ally' },
      { type: 'USE_ACTION', actorId: 'fighter', actionId: 'strike', targetId: 'captain' }
    ],
    author: 'Citadel Academy'
  },
  {
    schemaVersion: 1,
    id: 'line-them-up',
    title: 'Line Them Up',
    summary: 'Shove one enemy into alignment, then let a deterministic lightning line finish both.',
    difficulty: 'hard',
    tags: ['shove', 'line', 'spell', 'allies'],
    board: { width: 7, height: 6, terrain: [{ x: 5, y: 2, type: 'blocked' }] },
    creatures: [
      creature({
        id: 'caster', name: 'Storm Signifer', team: 'player', controlled: true, position: { x: 0, y: 3 }, initiative: 15,
        actionIds: ['stride', 'lightning-bolt'], attacks: [],
        spells: [{ id: 'lightning-line', name: 'Lightning Bolt', actionId: 'lightning-bolt', actionCost: 2, geometry: 'line', range: 6, save: 'reflex', dc: 20, damage: 12, damageType: 'electricity' }]
      }),
      creature({ id: 'marshal', name: 'Chain Marshal', team: 'ally', controlled: true, position: { x: 2, y: 1 }, initiative: 20, actionIds: ['shove'], skills: { athletics: 10, deception: 2, intimidation: 7 }, attacks: [] }),
      creature({ id: 'enemy-a', name: 'Red Guard', team: 'enemy', position: { x: 2, y: 2 }, initiative: 12, hp: 10, maxHp: 10, fortitude: 6, reflex: 4, attacks: [] }),
      creature({ id: 'enemy-b', name: 'Blue Guard', team: 'enemy', position: { x: 4, y: 3 }, initiative: 11, hp: 10, maxHp: 10, reflex: 4, attacks: [] })
    ],
    rolls: [15, 5, 5],
    objective: { type: 'defeat-all-enemies' },
    maxRounds: 1,
    hints: ['Shove the Red Guard south to C4—onto the caster’s row—then end the marshal’s turn.', 'Choose a square east of the caster to aim the line.'],
    intendedSolution: [
      { type: 'USE_ACTION', actorId: 'marshal', actionId: 'shove', targetId: 'enemy-a', destination: { x: 2, y: 3 } },
      { type: 'END_TURN', actorId: 'marshal' },
      { type: 'USE_ACTION', actorId: 'caster', actionId: 'lightning-bolt', direction: { x: 1, y: 0 } }
    ],
    author: 'Citadel Academy'
  },
  {
    schemaVersion: 1,
    id: 'roll-order',
    title: 'Spend the Bad Roll',
    summary: 'The queue is a resource. Spend the 5 on a low-stakes check so the 19 powers the decisive attack.',
    difficulty: 'moderate',
    tags: ['roll-order', 'demoralize', 'strike'],
    board: { width: 5, height: 5, terrain: [] },
    creatures: [
      creature({ id: 'champion', name: 'Resolute Champion', team: 'player', controlled: true, position: { x: 1, y: 2 }, initiative: 20, actionIds: ['demoralize', 'strike'], skills: { athletics: 7, deception: 2, intimidation: 3 }, attacks: [{ id: 'blade', name: 'Blade', attackBonus: 6, damage: 10, damageType: 'slashing', agile: false, range: 1, traits: [] }] }),
      creature({ id: 'duelist', name: 'Iron Duelist', team: 'enemy', position: { x: 2, y: 2 }, initiative: 10, hp: 10, maxHp: 10, ac: 24, will: 12, attacks: [] })
    ],
    rolls: [5, 19],
    objective: { type: 'defeat-all-enemies' },
    maxRounds: 1,
    hints: ['Checks consume rolls even when they fail.', 'Demoralize first. The 19 then reaches AC 24.'],
    intendedSolution: [
      { type: 'USE_ACTION', actorId: 'champion', actionId: 'demoralize', targetId: 'duelist' },
      { type: 'USE_ACTION', actorId: 'champion', actionId: 'strike', targetId: 'duelist' }
    ],
    author: 'Citadel Academy'
  }
];

export function createDraftPuzzle(id = `new-puzzle-${Date.now()}`): PuzzleDefinition {
  return {
    schemaVersion: 1,
    id,
    title: 'Untitled Tactical Puzzle',
    summary: 'Describe the tactical lesson and victory challenge.',
    difficulty: 'moderate',
    tags: ['custom'],
    board: { width: 6, height: 6, terrain: [] },
    creatures: [
      creature({ id: 'player', name: 'Hero', team: 'player', controlled: true, position: { x: 1, y: 3 }, initiative: 20, actionIds: ['stride', 'step', 'strike', 'feint'] }),
      creature({ id: 'enemy-1', name: 'Enemy', team: 'enemy', position: { x: 3, y: 3 }, initiative: 10, attacks: [] })
    ],
    rolls: [10, 15, 8],
    objective: { type: 'defeat-all-enemies' },
    maxRounds: 1,
    hints: ['Consider your action order and the predetermined rolls.'],
    author: 'GM'
  };
}

export function createEditorCreature(index: number): CreatureDefinition {
  return creature({
    id: `enemy-${index}`,
    name: `Enemy ${index}`,
    team: 'enemy',
    position: { x: Math.min(4, index + 2), y: 2 },
    initiative: 10 - index,
    attacks: []
  });
}
