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
    expect(rulesSections.some(section => section.title === 'Character Creation Rules (Index)')).toBe(false);
  });

  it('removes document navigation and secondary working tabs', () => {
    expect(rulesSections.some(section => section.title === 'Table of Contents')).toBe(false);
    expect(rulesSections.some(section => section.title === 'Character Creation Rules (Index)')).toBe(false);
    expect(rulesSections.some(section => section.title.includes('Reformat test'))).toBe(false);
  });

  it('removes the character-creation overview without duplicating detailed sections', () => {
    expect(rulesSections.some(section => section.title === 'Variant Rules')).toBe(false);
    ['Rarity', 'Bans/Blacklists', 'Server House Rules/Tweaks/Clarifications'].forEach(title => {
      expect(rulesSections.filter(section => section.title === title)).toHaveLength(1);
    });
    expect(rulesSections.some(section => section.title === 'Dual Class')).toBe(true);
    expect(rulesSections.some(section => section.title === 'Free Archetype')).toBe(true);
    expect(rulesSections.find(section => section.title === 'Rarity')?.searchText).not.toContain('limited free archetype rules');
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

  it('provides stable destinations for linked rules sections', () => {
    const sectionIds = new Set(rulesSections.map(section => section.id));
    [
      'rare-ancestries-heritages-classes-class-features-skill-feats', 'rare-backgrounds-archetypes',
      'rare-spells', 'rare-items', 'banned-archetypes', 'banned-backgrounds', 'banned-class-features',
      '3rd-party-material-battlezoo', 'server-house-rules-tweaks-clarifications',
      'experience-levelling-and-tiers', 'ancestry-tweaks', 'class-tweaks', 'archetype-tweaks',
      'item-tweaks', 'miscellaneous', 'character-retirement'
    ].forEach(id => expect(sectionIds.has(id), `Missing rules section #${id}`).toBe(true));
  });

  it('stores document structure explicitly', () => {
    expect(rulesSections.every(section => section.blocks.length > 0)).toBe(true);
    const tiers = rulesSections.find(section => section.title === 'Experience, Levelling, and Tiers');
    const retirement = rulesSections.find(section => section.title === 'Character Retirement');
    expect(tiers?.blocks.some(block => block.type === 'table')).toBe(true);
    expect(retirement?.blocks.some(block => block.type === 'table')).toBe(true);
    expect(rulesSections.find(section => section.title === 'Server Rules')?.blocks[0]?.type).toBe('ordered-list');
    expect(rulesSections.find(section => section.title === 'Specialty Crafting Rules/Table')?.blocks.filter(block => block.type === 'table')).toHaveLength(2);
    expect(rulesSections.some(section => section.blocks.some(block => block.type === 'subheading'))).toBe(true);
    expect(rulesSections.some(section => section.blocks.some(block => block.type === 'callout'))).toBe(true);
    expect(rulesSections.flatMap(section => section.references || []).every(reference => reference.url.startsWith('https://2e.aonprd.com/'))).toBe(true);
  });
});
