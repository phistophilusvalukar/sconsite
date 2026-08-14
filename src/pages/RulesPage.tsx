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
  ['Limited Free Archetype', 'free-archetype']
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

const RuleBody: React.FC<{ section: RuleSection; query: string }> = ({ section, query }) => {
  const blocks = section.content.split(/\n\s*\n/).map(block => block.trim()).filter(Boolean);
  const orderedServerRules = section.title === 'Server Rules';

  if (orderedServerRules) {
    const rules = blocks.filter(block => /^\d+[.)]\s/.test(block));
    const notes = blocks.filter(block => !/^\d+[.)]\s/.test(block));
    return <div className="rules-article-body"><ol className="rules-commandments">{rules.map(rule => <li key={rule}><LinkedRuleText text={rule.replace(/^\d+[.)]\s*/, '')} query={query} currentSectionId={section.id} /></li>)}</ol>{notes.map(note => <p className="rules-note" key={note}><LinkedRuleText text={note} query={query} currentSectionId={section.id} /></p>)}</div>;
  }

  return (
    <div className="rules-article-body">
      {blocks.map((block, index) => {
        const blockLines = block.split('\n').map(line => line.trim()).filter(Boolean);
        if (blockLines.length > 0 && blockLines.every(line => /^\*\s+/.test(line))) {
          return <ul key={index}>{blockLines.map(line => <li key={line}><LinkedRuleText text={line.replace(/^\*\s+/, '')} query={query} currentSectionId={section.id} /></li>)}</ul>;
        }
        if (blockLines.length > 2 && blockLines.some(line => /\t/.test(line))) {
          return <pre className="rules-data-block" key={index}><LinkedRuleText text={blockLines.join('\n')} query={query} currentSectionId={section.id} /></pre>;
        }
        return <p key={index}><LinkedRuleText text={blockLines.join('\n')} query={query} currentSectionId={section.id} /></p>;
      })}
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
          <h1>Scattered Convergence Rules Document</h1>
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
