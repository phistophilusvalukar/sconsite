import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, ExternalLink, Menu, Search, X } from 'lucide-react';
import { rulesCategories, rulesDocumentMeta, rulesSections, type RuleSection } from '../features/rules/rulesDocument';
import './rulesLore.css';

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const HighlightText: React.FC<{ text: string; query: string }> = ({ text, query }) => {
  const terms = query.trim().split(/\s+/).filter(term => term.length >= 2);
  if (terms.length === 0) return <>{text}</>;
  const expression = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi');
  return <>{text.split(expression).map((part, index) => terms.some(term => part.toLocaleLowerCase() === term.toLocaleLowerCase()) ? <mark key={`${part}-${index}`}>{part}</mark> : part)}</>;
};

const referenceAliases = new Map([
  ['Limited Free Archetype rules', 'free-archetype'],
  ['Limited Free Archetype', 'free-archetype'],
  ['Ancestries, Heritages, Classes, Class Features, Skill Feats', 'rare-ancestries-heritages-classes-class-features-skill-feats'],
  ['Backgrounds, Archetypes', 'rare-backgrounds-archetypes'],
  ['Server House Rules/Tweaks', 'server-house-rules-tweaks-clarifications']
]);
const sectionReferences = [...referenceAliases.entries(), ...rulesSections.map(section => [section.title, section.id] as const)]
  .filter(([label]) => label.length >= 5)
  .sort(([left], [right]) => right.length - left.length);
const referenceExpression = new RegExp(`\\b(${sectionReferences.map(([label]) => escapeRegExp(label)).join('|')})\\b`, 'gi');
const referenceTargets = new Map(sectionReferences.map(([label, id]) => [label.toLocaleLowerCase(), id]));

const LinkedRuleText: React.FC<{ text: string; query: string; currentSectionId: string }> = ({ text, query, currentSectionId }) => <>{text.split(referenceExpression).map((part, index) => {
  const targetId = referenceTargets.get(part.toLocaleLowerCase());
  const content = <HighlightText text={part} query={query} />;
  return targetId && targetId !== currentSectionId
    ? <a className="rules-cross-reference" href={`#${targetId}`} key={`${part}-${index}`}>{content}</a>
    : <React.Fragment key={`${part}-${index}`}>{content}</React.Fragment>;
})}</>;

const RulesTable: React.FC<{ headers: string[]; rows: string[][] }> = ({ headers, rows }) => {
  const hasProseCells = rows.some(row => row.some(cell => cell.length > 80));
  return <div className="rules-table-wrap"><table className={`rules-table${hasProseCells ? ' rules-table-prose' : ''}`}><thead><tr>{headers.map(header => <th key={header} scope="col">{header}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row[0]}>{row.map((cell, index) => index === 0 ? <th key={index} scope="row">{cell}</th> : <td key={index}>{cell}</td>)}</tr>)}</tbody></table></div>;
};

const RuleBody: React.FC<{ section: RuleSection; query: string }> = ({ section, query }) => {
  return (
    <div className="rules-article-body">
      {section.blocks.map((block, index) => {
        if (block.type === 'table') return <RulesTable headers={block.headers} rows={block.rows} key={index} />;
        if (block.type === 'list') return <ul key={index}>{block.items.map(item => <li key={item}><LinkedRuleText text={item} query={query} currentSectionId={section.id} /></li>)}</ul>;
        if (block.type === 'ordered-list') return <ol className="rules-commandments" key={index}>{block.items.map(item => <li key={item}><LinkedRuleText text={item} query={query} currentSectionId={section.id} /></li>)}</ol>;
        if (block.type === 'data') return <pre className="rules-data-block" key={index}><LinkedRuleText text={block.text} query={query} currentSectionId={section.id} /></pre>;
        if (block.type === 'subheading') return <h3 className="rules-subheading" key={index}>{block.text}</h3>;
        if (block.type === 'callout') return <aside className={`rules-callout rules-callout-${block.tone}`} key={index}><strong>{block.title}</strong><p><LinkedRuleText text={block.text} query={query} currentSectionId={section.id} /></p></aside>;
        return <p className={block.type === 'note' ? 'rules-note' : undefined} key={index}><LinkedRuleText text={block.text} query={query} currentSectionId={section.id} /></p>;
      })}
      {section.references && section.references.length > 0 && <nav className="rules-official-references" aria-label="Official Pathfinder references"><span>Archives of Nethys</span>{section.references.map(reference => <a href={reference.url} target="_blank" rel="noreferrer" key={reference.url}>{reference.label}<ExternalLink /></a>)}</nav>}
    </div>
  );
};

const RulesPage: React.FC = () => {
  const [query, setQuery] = useState('');
  const [isContentsOpen, setIsContentsOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.key === '/' && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  useEffect(() => {
    if (!window.location.hash) return;
    const target = document.getElementById(window.location.hash.slice(1));
    target?.scrollIntoView({ block: 'start' });
  }, []);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleSections = useMemo(() => rulesSections.filter(section => {
    const matchesQuery = !normalizedQuery || normalizedQuery.split(/\s+/).every(term => section.searchText.includes(term));
    return matchesQuery;
  }), [normalizedQuery]);

  const sectionsByCategory = useMemo(() => rulesCategories.map(category => ({
    category,
    sections: rulesSections.filter(section => section.category === category)
  })).filter(group => group.sections.length > 0), []);

  const navigateToSection = (id: string) => {
    setIsContentsOpen(false);
    window.history.replaceState(null, '', `#${id}`);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="rules-page">
      <header className="rules-hero">
        <div className="rules-hero-copy">
          <h1>Shattered Convergence Rules Document</h1>
        </div>
        <div className="rules-document-meta">
          <span>Official rules document</span>
          <strong>Version {rulesDocumentMeta.version}</strong>
          <a href={rulesDocumentMeta.sourceUrl} target="_blank" rel="noreferrer">View source <ExternalLink /></a>
        </div>
      </header>

      <section className="rules-search-panel" aria-label="Search rules">
        <div className="rules-search-field"><Search /><input ref={searchRef} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search dual class, downtime, resurrection…" aria-label="Search all rules" />{query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><X /></button>}<kbd>/</kbd></div>
        <button type="button" className="rules-contents-toggle" onClick={() => setIsContentsOpen(current => !current)} aria-expanded={isContentsOpen}><Menu /> Contents</button>
        <p><strong>{visibleSections.length}</strong> sections shown{normalizedQuery ? ` for “${query.trim()}”` : ''}</p>
      </section>

      <div className="rules-reading-layout">
        <aside className={`rules-contents${isContentsOpen ? ' is-open' : ''}`} aria-label="Rules table of contents">
          <div className="rules-contents-heading"><span>Contents</span><button type="button" onClick={() => setIsContentsOpen(false)} aria-label="Close contents"><X /></button></div>
          {sectionsByCategory.map(group => <section key={group.category}><h2>{group.category}</h2>{group.sections.map(section => <button type="button" onClick={() => navigateToSection(section.id)} key={section.id}>{section.title}</button>)}</section>)}
        </aside>

        <main className="rules-reader" id="rules-reader">
          {visibleSections.map((section, index) => (
            <article className={`rules-article rules-article-level-${section.level}`} id={section.id} key={section.id}>
              <header><div><span>{section.category}</span><small>{String(index + 1).padStart(2, '0')}</small></div><h2><a href={`#${section.id}`}>{section.title}</a></h2></header>
              <RuleBody section={section} query={query} />
            </article>
          ))}
          {visibleSections.length === 0 && <div className="rules-empty"><Search /><h2>No passage found</h2><p>Try a broader phrase.</p><button type="button" onClick={() => setQuery('')}>Clear search</button></div>}
        </main>
      </div>

      <button className="rules-back-to-top" type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}><ArrowUp /> Back to top</button>
    </div>
  );
};

export default RulesPage;
