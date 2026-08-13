import { describe, expect, it } from 'vitest';
import {
  abilityScore,
  createDefaultPlanner,
  exportActorAtLevel,
  getAutomaticClassFeatures,
  getSelectablePlannerFeats,
  inferFeatLevels,
  isPartialAbilityBoost,
  parsePlannerActor,
  rankAtLevel,
  setAbilityBoost,
  setSkillBoost,
  validatePlanner
} from './characterPlanner';

const actor = parsePlannerActor({
  name: 'Hero',
  system: {
    details: { level: { value: 20 } },
    skills: { athletics: { rank: 4 }, arcana: { rank: 2 } },
    abilities: {
      str: { value: 20, mod: 5 }, dex: { value: 18, mod: 4 }, con: { value: 18, mod: 4 },
      int: { value: 12, mod: 1 }, wis: { value: 18, mod: 4 }, cha: { value: 10, mod: 0 }
    }
  },
  items: [
    { _id: 'early', name: 'Early Feat', type: 'feat', system: { level: { value: 1 }, location: 'class-2' }, flags: {} },
    { _id: 'late', name: 'Late Feat', type: 'feat', system: { level: { value: 4 }, location: 'class-14' }, flags: {} },
    { _id: 'grant', name: 'Granted Feat', type: 'feat', system: { level: { value: 1 }, location: null }, flags: { pf2e: { grantedBy: { id: 'late' } } } },
    { _id: 'grant-action', name: 'Granted Action', type: 'action', flags: { pf2e: { grantedBy: { id: 'grant' } } } },
    { _id: 'class-feature', name: 'Natural Class Feature', type: 'feat', system: { level: { value: 10 }, category: 'classfeature', location: 'class-1' }, flags: {} },
    { _id: 'class-feature-action', name: 'Natural Feature Action', type: 'action', flags: { pf2e: { grantedBy: { id: 'class-feature' } } } },
    { _id: 'sword', name: 'Sword', type: 'weapon', system: {}, flags: {} },
    { _id: 'nullable-category', name: 'Invoke Rune', type: 'action', system: { category: null }, flags: {} }
  ]
});

describe('character planner', () => {
  it('accepts Foundry ability variants without rejecting the actor', () => {
    const variant = parsePlannerActor({
      name: 'Variant Hero',
      system: {
        details: { level: { value: 1 } },
        skills: {},
        abilities: { str: 18, dex: { value: '16', mod: null }, con: null }
      },
      items: []
    });
    expect(variant.system.abilities?.str.value).toBe(18);
    expect(variant.system.abilities?.dex.value).toBe(16);
    expect(variant.system.abilities?.con.value).toBeUndefined();
  });

  it('normalizes nullable, array-shaped, and metadata-heavy ability collections', () => {
    const arrayAbilities = parsePlannerActor({
      system: {
        details: { level: 3 },
        abilities: [
          { slug: 'str', value: '18', mod: '4' },
          { key: 'dex', value: 16, mod: 3 },
          { slug: 'fortune', value: 'not-an-ability' }
        ]
      }
    });
    expect(arrayAbilities.system.abilities?.str.value).toBe(18);
    expect(arrayAbilities.system.abilities?.dex.mod).toBe(3);
    expect(arrayAbilities.system.abilities?.fortune).toBeUndefined();

    const nullableAbilities = parsePlannerActor({
      system: { details: { level: 1 }, abilities: null }
    });
    expect(nullableAbilities.system.abilities).toEqual({});

    const metadataAbilities = parsePlannerActor({
      system: {
        details: { level: 1 },
        abilities: { str: { mod: 2 }, cha: 'not-calculated', metadata: ['legacy', 'payload'] }
      }
    });
    expect(metadataAbilities.system.abilities).toEqual({ str: { mod: 2 }, cha: {} });
  });

  it('normalizes serialized, wrapped, and legacy Foundry actor exports', () => {
    const serialized = parsePlannerActor(JSON.stringify({
      actor: {
        name: 'Wrapped Hero',
        system: { details: { level: '7' }, skills: { arcana: '2' } },
        items: [{ id: 'legacy-feat', name: 'Legacy Feat', type: 'feat', data: { level: 3 }, flags: null }]
      }
    }));
    expect(serialized.system.details.level.value).toBe(7);
    expect(serialized.system.skills?.arcana.rank).toBe(2);
    expect(serialized.items?.[0]._id).toBe('legacy-feat');
    expect(serialized.items?.[0].system?.level?.value).toBe(3);

    const legacy = parsePlannerActor({
      name: 'Old Foundry Hero',
      data: {
        data: { details: { level: { value: '4' } }, skills: { athletics: { rank: '1' } } },
        items: []
      }
    });
    expect(legacy.system.details.level.value).toBe(4);
    expect(legacy.system.skills?.athletics.rank).toBe(1);
  });

  it('reports the unsupported Foundry field instead of a generic warning', () => {
    expect(() => parsePlannerActor({ system: { details: {} } }))
      .toThrow(/system\.details\.level/);
  });

  it('uses modern Foundry build boosts and preserves the imported level-one boost map', () => {
    const modern = parsePlannerActor({
      name: 'Modern Hero',
      system: {
        details: { level: { value: 20 } },
        skills: {},
        build: { attributes: { boosts: {
          '1': ['str', 'dex', 'con', 'wis'],
          '5': ['str', 'dex', 'con', 'wis'],
          '10': ['str', 'dex', 'con', 'wis'],
          '15': ['str', 'dex', 'con', 'wis'],
          '20': ['str', 'dex', 'con', 'wis']
        } } }
      },
      items: []
    });
    const planner = createDefaultPlanner(modern);
    expect(abilityScore(modern, 'str', planner, 1)).toBe(12);
    expect(abilityScore(modern, 'str', planner, 20)).toBe(19);

    const exported = exportActorAtLevel(modern, planner, 10);
    expect(exported.system.build?.attributes?.boosts?.['1']).toEqual(['str', 'dex', 'con', 'wis']);
    expect(exported.system.build?.attributes?.boosts?.['10']).toEqual(['str', 'dex', 'con', 'wis']);
    expect(exported.system.build?.attributes?.boosts?.['15']).toEqual([]);
  });

  it('infers selection levels from slots and parent grants', () => {
    expect(inferFeatLevels(actor)).toEqual({ early: 2, late: 14, grant: 14, 'class-feature': 1 });
  });

  it('creates editable legal-minimum skill progressions', () => {
    const planner = createDefaultPlanner(actor);
    expect(rankAtLevel(planner, 'athletics', 6)).toBe(2);
    expect(rankAtLevel(planner, 'athletics', 14)).toBe(3);
    expect(rankAtLevel(planner, 'athletics', 20)).toBe(4);
  });

  it('derives skill rank from selected graph cells and renumbers after removal', () => {
    let planner: ReturnType<typeof createDefaultPlanner> = { ...createDefaultPlanner(actor), skillUpgrades: [] };
    planner = setSkillBoost(planner, 'athletics', 3, true);
    planner = setSkillBoost(planner, 'athletics', 7, true);
    expect(rankAtLevel(planner, 'athletics', 6)).toBe(1);
    expect(rankAtLevel(planner, 'athletics', 7)).toBe(2);
    planner = setSkillBoost(planner, 'athletics', 3, false);
    expect(planner.skillUpgrades).toMatchObject([{ skill: 'athletics', level: 7, rank: 1 }]);
  });

  it('separates automatic class features from player feat choices', () => {
    expect(getSelectablePlannerFeats(actor).map(feat => feat._id)).not.toContain('class-feature');
    expect(getAutomaticClassFeatures(actor).map(feat => feat._id)).toEqual(['class-feature']);
  });

  it('plans four distinct ability boosts and preserves level-one construction as the baseline', () => {
    const planner = createDefaultPlanner(actor);
    expect(planner.abilityBoosts.filter(boost => boost.level === 5)).toHaveLength(4);
    expect(abilityScore(actor, 'str', planner, 1)).toBe(14);
    expect(abilityScore(actor, 'str', planner, 5)).toBe(16);
    expect(abilityScore(actor, 'str', planner, 10)).toBe(18);
    expect(abilityScore(actor, 'str', planner, 15)).toBe(19);
    expect(isPartialAbilityBoost(abilityScore(actor, 'str', planner, 15)!)).toBe(true);

    const fullLevel = planner.abilityBoosts.filter(boost => boost.level === 5);
    const fifth = setAbilityBoost(planner, 'cha', 5, true);
    expect(fifth.abilityBoosts.filter(boost => boost.level === 5)).toEqual(fullLevel);
    const withoutStrengthAtTwenty = setAbilityBoost(planner, 'str', 20, false);
    const withCharismaAtTwenty = setAbilityBoost(withoutStrengthAtTwenty, 'cha', 20, true);
    expect(abilityScore(actor, 'str', withCharismaAtTwenty, 1)).toBe(14);
    expect(abilityScore(actor, 'str', withCharismaAtTwenty, 20)).toBe(19);
    expect(abilityScore(actor, 'cha', withCharismaAtTwenty, 20)).toBe(12);
    expect(validatePlanner(planner)).toEqual([]);
  });

  it('removes future choices and automatic class features while preserving deferred item data', () => {
    const planner = createDefaultPlanner(actor);
    planner.featLevels['class-feature'] = 1;
    const earlyExport = exportActorAtLevel(actor, planner, 5);
    expect(earlyExport.items?.map(item => item._id)).not.toContain('class-feature');
    expect(earlyExport.items?.map(item => item._id)).not.toContain('class-feature-action');

    const exported = exportActorAtLevel(actor, planner, 12);
    expect(exported.system.details.level.value).toBe(12);
    expect(exported.items?.map(item => item._id)).toEqual(['early', 'class-feature', 'class-feature-action', 'sword', 'nullable-category']);
    expect(exported.system.skills?.athletics.rank).toBe(3);
    expect(exported.system.abilities?.str.value).toBe(18);
    expect(exported.system.abilities?.str.mod).toBe(4);
  });
});
