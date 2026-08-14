import structuredRules from './rulesDocumentData.json';

export interface RuleSection {
  id: string;
  title: string;
  category: string;
  level: 1 | 2;
  blocks: RuleBlock[];
  references?: RuleReference[];
  searchText: string;
  wordCount: number;
}

export interface RuleReference { label: string; url: string }

export type RuleBlock =
  | { type: 'paragraph' | 'note' | 'data' | 'subheading'; text: string }
  | { type: 'callout'; tone: 'example' | 'outcome' | 'note'; title: string; text: string }
  | { type: 'list' | 'ordered-list'; items: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] };

interface StructuredRuleSection {
  title: string;
  category: string;
  level: 1 | 2;
  blocks: RuleBlock[];
  references?: RuleReference[];
}

const slugify = (value: string) => value
  .toLocaleLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '') || 'rule';

const usedIds = new Map<string, number>();

export const rulesSections: RuleSection[] = (structuredRules as StructuredRuleSection[]).map(section => {
  const baseId = slugify(section.title);
  const idCount = usedIds.get(baseId) || 0;
  usedIds.set(baseId, idCount + 1);
  const id = idCount === 0 ? baseId : `${baseId}-${idCount + 1}`;
  const searchableContent = section.blocks.flatMap(block => {
    if (block.type === 'callout') return [block.title, block.text];
    if ('text' in block) return [block.text];
    if ('items' in block) return block.items;
    return [...block.headers, ...block.rows.flat()];
  }).join(' ');
  const wordCount = searchableContent.split(/\s+/).filter(Boolean).length;

  return {
    ...section,
    id,
    searchText: `${section.title} ${section.category} ${searchableContent}`.toLocaleLowerCase(),
    wordCount
  };
});

export const rulesDocumentMeta = {
  title: 'Scattered Convergence Rules Document',
  version: '1.07',
  sourceUrl: 'https://docs.google.com/document/d/1-FVWYSZ3aFs0HewarSShYaTqVAFCbE5uJNdYX10HEZs/edit?tab=t.0',
  wordCount: rulesSections.reduce((total, section) => total + section.wordCount, 0)
};

export const rulesCategories = Array.from(new Set(rulesSections.map(section => section.category)));
