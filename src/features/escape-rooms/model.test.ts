import { describe, expect, it } from 'vitest';
import { graphColumns, prerequisitesMet, validateBlueprint } from './model';
import { starter } from './starter';

describe('escape room authoring', () => {
  it('accepts the parallel starter and places the convergence after both branches', () => {
    expect(validateBlueprint(starter)).toEqual([]);
    const columns = graphColumns(starter.nodes);
    expect(columns[0].map(n => n.id)).toEqual(['letter', 'book']);
    expect(columns[columns.length - 1]?.map(n => n.id)).toEqual(['treasure']);
    expect(columns.findIndex(c => c.some(n => n.id === 'vault'))).toBeGreaterThan(columns.findIndex(c => c.some(n => n.id === 'rod')));
  });
  it('requires both paths for ALL and allows one for ANY', () => {
    const vault = starter.nodes.find(n => n.id === 'vault')!;
    expect(prerequisitesMet(vault, { cabinet: 'used' })).toBe(false);
    expect(prerequisitesMet(vault, { cabinet: 'used', case: 'used' })).toBe(true);
    expect(prerequisitesMet({ ...vault, gate: 'any' }, { cabinet: 'used' })).toBe(true);
    expect(prerequisitesMet({ ...vault, gate: 'any' }, { cabinet: 'known' })).toBe(false);
  });
  it('treats used items as known for later references', () => {
    expect(prerequisitesMet(starter.nodes[1], { letter: 'used' })).toBe(true);
  });
  it('rejects dangling dependencies, duplicate IDs, and cycles through keys', () => {
    const draft = structuredClone(starter);
    draft.nodes[0].requires = [{ nodeId: 'absent', state: 'known' }];
    expect(validateBlueprint(draft).join(' ')).toContain('missing reference');
    draft.nodes[0].requires = [{ nodeId: 'vault', state: 'used' }];
    expect(validateBlueprint(draft).join(' ')).toContain('cycle');
    draft.nodes.push(draft.nodes[0]);
    expect(validateBlueprint(draft).join(' ')).toContain('unique ID');
  });
  it('requires a defined ending and prevents secrets on non-lock nodes', () => {
    const draft = structuredClone(starter);
    draft.nodes = draft.nodes.filter(n => n.kind !== 'treasure');
    draft.nodes[0].code = 'bad';
    const errors = validateBlueprint(draft).join(' ');
    expect(errors).toContain('ending'); expect(errors).toContain('only locks');
  });
});
