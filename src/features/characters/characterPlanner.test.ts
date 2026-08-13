import { describe, expect, it } from 'vitest';
import { createDefaultPlanner, exportActorAtLevel, inferFeatLevels, parsePlannerActor, rankAtLevel } from './characterPlanner';

const actor = parsePlannerActor({
  name: 'Hero',
  system: { details: { level: { value: 20 } }, skills: { athletics: { rank: 4 }, arcana: { rank: 2 } } },
  items: [
    { _id: 'early', name: 'Early Feat', type: 'feat', system: { level: { value: 1 }, location: 'class-2' }, flags: {} },
    { _id: 'late', name: 'Late Feat', type: 'feat', system: { level: { value: 4 }, location: 'class-14' }, flags: {} },
    { _id: 'grant', name: 'Granted Feat', type: 'feat', system: { level: { value: 1 }, location: null }, flags: { pf2e: { grantedBy: { id: 'late' } } } },
    { _id: 'grant-action', name: 'Granted Action', type: 'action', flags: { pf2e: { grantedBy: { id: 'grant' } } } },
    { _id: 'sword', name: 'Sword', type: 'weapon', system: {}, flags: {} },
    { _id: 'nullable-category', name: 'Invoke Rune', type: 'action', system: { category: null }, flags: {} }
  ]
});

describe('character planner', () => {
  it('infers selection levels from slots and parent grants', () => {
    expect(inferFeatLevels(actor)).toEqual({ early: 2, late: 14, grant: 14 });
  });

  it('creates editable legal-minimum skill progressions', () => {
    const planner = createDefaultPlanner(actor);
    expect(rankAtLevel(planner, 'athletics', 6)).toBe(2);
    expect(rankAtLevel(planner, 'athletics', 14)).toBe(3);
    expect(rankAtLevel(planner, 'athletics', 20)).toBe(4);
  });

  it('removes future feats and dependent grants while preserving deferred item data', () => {
    const exported = exportActorAtLevel(actor, createDefaultPlanner(actor), 12);
    expect(exported.system.details.level.value).toBe(12);
    expect(exported.items?.map(item => item._id)).toEqual(['early', 'sword', 'nullable-category']);
    expect(exported.system.skills?.athletics.rank).toBe(3);
  });
});
