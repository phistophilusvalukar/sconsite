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

  it('provides destinations for character-creation index references', () => {
    const sectionIds = new Set(rulesSections.map(section => section.id));
    [
      'rare-ancestries-heritages-classes-class-features-skill-feats', 'rare-backgrounds-archetypes',
      'rare-spells', 'rare-items', 'banned-archetypes', 'banned-backgrounds', 'banned-class-features',
      '3rd-party-material-battlezoo', 'server-house-rules-tweaks-clarifications',
      'experience-levelling-and-tiers', 'ancestry-tweaks', 'class-tweaks', 'archetype-tweaks',
      'item-tweaks', 'miscellaneous', 'character-retirement'
    ].forEach(id => expect(sectionIds.has(id), `Missing rules section #${id}`).toBe(true));
  });
});
