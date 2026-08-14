import { RAW_RULES_DOCUMENT } from './rulesDocumentSource';

export interface RuleSection {
  id: string;
  title: string;
  category: string;
  level: 1 | 2;
  content: string;
  searchText: string;
  wordCount: number;
}

const TOP_LEVEL_HEADINGS = [
  'Server Rules',
  'Mission Statement',
  'Lore',
  'Character Creation Rules (Index)',
  'Variant Rules',
  'Rarity',
  'Bans/Blacklists',
  '3rd-Party Material (Battlezoo)',
  'Server House Rules/Tweaks',
  'Server House Rules/Tweaks/Clarifications',
  'Character Theme Guidelines',
  'Creating a Character',
  'Character Rebuilds',
  'Playing the Game',
  'Gameplay Guidelines',
  'Signing Up for a Session',
  'Session Rewards',
  'Afflictions In Between Sessions',
  'GMing on Shattered Convergence',
  'GM Ethics',
  'Foundry VTT',
  'Guilds & RP Guidelines',
  'Roleplay in Shattered Convergence',
  'Downtime & Retraining Rules',
  'Spending Downtime',
  'Gifting Rules',
  'Rituals',
  'Character Death & Resurrection',
  'Character Retirement'
] as const;

const normalizeHeading = (value: string) => value
  .replace(/\uFEFF/g, '')
  .replace(/:$/, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLocaleLowerCase();

const topLevelHeadings = new Set(TOP_LEVEL_HEADINGS.map(normalizeHeading));

const slugify = (value: string) => value
  .toLocaleLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '') || 'rule';

const categoryForHeading = (title: string, previousCategory: string) => {
  const heading = normalizeHeading(title);
  if (['server rules', 'mission statement'].includes(heading)) return 'Community';
  if (heading === 'lore') return 'World Primer';
  if ([
    'character creation rules (index)', 'variant rules', 'rarity', 'bans/blacklists',
    '3rd-party material (battlezoo)', 'server house rules/tweaks',
    'server house rules/tweaks/clarifications', 'character theme guidelines',
    'creating a character', 'character rebuilds'
  ].includes(heading)) return 'Characters';
  if ([
    'playing the game', 'gameplay guidelines', 'signing up for a session',
    'session rewards', 'afflictions in between sessions'
  ].includes(heading)) return 'Playing the Game';
  if ([
    'gming on shattered convergence', 'gm ethics', 'foundry vtt',
    'guilds and rp guidelines', 'roleplay in shattered convergence'
  ].includes(heading.replace('&', 'and'))) return 'Game Mastering';
  if (['downtime and retraining rules', 'spending downtime', 'gifting rules'].includes(heading.replace('&', 'and'))) return 'Downtime & Crafting';
  if (['rituals', 'character death and resurrection', 'character retirement'].includes(heading.replace('&', 'and'))) return 'Rituals & Mortality';
  return previousCategory;
};

const cleanSource = RAW_RULES_DOCUMENT
  .replace(/\uFEFF/g, '')
  .replace(/\r\n?/g, '\n')
  .replace(/[ \t]+$/gm, '')
  .replace(/^\s*_{8,}\s*$/gm, '________________')
  .replace(/\n{4,}/g, '\n\n\n');

const lines = cleanSource.split('\n');
const tocStart = lines.findIndex(line => line.trim() === 'Table of Contents');
const actualLoreStart = lines.findIndex((line, index) => {
  if (index <= tocStart || line.trim() !== 'Lore') return false;
  const nextContent = lines.slice(index + 1).find(candidate => candidate.trim());
  return nextContent?.trim().startsWith('Planet:') ?? false;
});
const secondaryTabStart = lines.findIndex((line, index) => index > actualLoreStart && line.trim() === 'Reformat test (should widen margins)');

const tocHeadings = new Map<string, string>();
if (tocStart >= 0 && actualLoreStart > tocStart) {
  lines.slice(tocStart + 1, actualLoreStart).forEach(line => {
    const match = line.trim().match(/^(.+?)\s{2,}\d+$/);
    if (!match?.[1]) return;
    const title = match[1].trim();
    if (!title.startsWith('Shattered Convergence Rules') && title !== 'Table of Contents') {
      tocHeadings.set(normalizeHeading(title), title);
    }
  });
}

const serverRulesStart = lines.findIndex(line => line.trim() === 'Server Rules');
const documentLines = [
  ...lines.slice(Math.max(serverRulesStart, 0), Math.max(tocStart, 0)),
  ...lines.slice(Math.max(actualLoreStart, tocStart + 1, 0), secondaryTabStart > actualLoreStart ? secondaryTabStart : undefined)
];

const sections: RuleSection[] = [];
const usedIds = new Map<string, number>();
let currentTitle = '';
let currentContent: string[] = [];
let currentCategory = 'Community';
let previousWasSeparator = false;

const finishSection = () => {
  if (!currentTitle) return;
  const content = currentContent
    .join('\n')
    .replace(/^\s+|\s+$/g, '')
    .replace(/\n{3,}/g, '\n\n');
  if (!content) return;
  const baseId = slugify(currentTitle);
  const idCount = usedIds.get(baseId) || 0;
  usedIds.set(baseId, idCount + 1);
  const id = idCount === 0 ? baseId : `${baseId}-${idCount + 1}`;
  sections.push({
    id,
    title: currentTitle.replace(/:$/, ''),
    category: currentCategory,
    level: topLevelHeadings.has(normalizeHeading(currentTitle)) ? 1 : 2,
    content,
    searchText: `${currentTitle} ${currentCategory} ${content}`.toLocaleLowerCase(),
    wordCount: content.split(/\s+/).filter(Boolean).length
  });
};

documentLines.forEach(rawLine => {
  const line = rawLine.trim();
  if (line === '________________') {
    previousWasSeparator = true;
    return;
  }
  if (!line) {
    if (currentContent[currentContent.length - 1] !== '') currentContent.push('');
    return;
  }

  const normalized = normalizeHeading(line);
  const knownHeading = tocHeadings.get(normalized);
  const isIndexRepeat = normalizeHeading(currentTitle) === normalizeHeading('Character Creation Rules (Index)') && !previousWasSeparator;
  const separatorHeading = previousWasSeparator
    && line.length <= 110
    && !/^\d+[.)]\s/.test(line)
    && !/^\*/.test(line);
  const shouldStartSection = Boolean(
    line === 'Server Rules'
    || line === 'Mission Statement'
    || line === 'Lore'
    || line === 'Character Creation Rules (Index)'
    || topLevelHeadings.has(normalized)
    || separatorHeading
    || (knownHeading && !isIndexRepeat)
  );

  if (shouldStartSection) {
    finishSection();
    currentTitle = knownHeading || line;
    currentCategory = categoryForHeading(currentTitle, currentCategory);
    currentContent = [];
  } else if (currentTitle) {
    currentContent.push(rawLine.trimEnd());
  }
  previousWasSeparator = false;
});
finishSection();

export const rulesDocumentMeta = {
  title: 'Shattered Convergence Rules',
  version: cleanSource.match(/Shattered Convergence Rules v\.?([^\n]+)/i)?.[1]?.trim() || '1.07',
  sourceUrl: 'https://docs.google.com/document/d/1-FVWYSZ3aFs0HewarSShYaTqVAFCbE5uJNdYX10HEZs/edit?tab=t.0',
  wordCount: sections.reduce((total, section) => total + section.wordCount, 0)
};

export const rulesSections = sections;

export const rulesCategories = Array.from(new Set(rulesSections.map(section => section.category)));
