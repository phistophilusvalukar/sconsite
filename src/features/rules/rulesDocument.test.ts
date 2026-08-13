import { describe, expect, it } from 'vitest';
import { rulesCategories, rulesDocumentMeta, rulesSections } from './rulesDocument';

describe('rules document index', () => {
  it('indexes the complete primary rules document', () => {
    expect(rulesDocumentMeta.version).toBe('1.07');
    expect(rulesDocumentMeta.wordCount).toBeGreaterThan(9000);
    expect(rulesSections.length).toBeGreaterThan(45);
    expect(rulesSections.some(section => section.title === 'Server Rules')).toBe(true);
    expect(rulesSections.some(section => section.title === 'Downtime & Retraining Rules')).toBe(true);
    expect(rulesSections.some(section => section.title === 'Controlled Convergence Ritual')).toBe(true);
    expect(rulesSections.some(section => section.title === 'Replacement Character')).toBe(true);
    expect(rulesSections.some(section => section.title === 'Character Retirement')).toBe(true);
  });

  it('removes document navigation and secondary working tabs', () => {
    expect(rulesSections.some(section => section.title === 'Table of Contents')).toBe(false);
    expect(rulesSections.some(section => section.title.includes('Reformat test'))).toBe(false);
  });

  it('provides useful reading categories and searchable text', () => {
    expect(rulesCategories).toEqual(expect.arrayContaining([
      'Community',
      'World Primer',
      'Characters',
      'Playing the Game',
      'Game Mastering',
      'Downtime & Crafting',
      'Rituals & Mortality'
    ]));
    const dualClass = rulesSections.find(section => section.title === 'Dual Class');
    expect(dualClass?.searchText).toContain('primary class');
  });
});
