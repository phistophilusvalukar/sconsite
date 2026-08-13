import React, { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, Edit3, Eye, Feather, Image, Library, Loader2, MapPin, Plus, Save, Search, Sparkles, Tag, Trash2, X } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DATABASE_TABLES } from '../config/database';
import { useAuth } from '../context/useAuth';
import RichTextEditor from '../features/guilds/RichTextEditor';
import SafeRichText from '../features/guilds/SafeRichText';
import { useSupabaseRealtime } from '../hooks/useSupabaseRealtime';
import LoreService, { type SaveLoreEntryInput } from '../services/loreService';
import type { LoreCategory, LoreEntry, LoreEntryStatus } from '../types/database';
import './rulesLore.css';

const categories: Array<'All' | LoreCategory> = ['All', 'Places', 'People', 'Factions', 'History', 'Mysteries', 'Artifacts'];

const emptyEditor = {
  title: '',
  summary: '',
  bodyHtml: '<p></p>',
  category: 'Places' as LoreCategory,
  tagsText: '',
  imageUrl: '',
  status: 'draft' as LoreEntryStatus,
  isFeatured: false
};

const LorePage: React.FC = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const loreService = useMemo(() => LoreService.getInstance(), []);
  const canEdit = Boolean(user?.isAdmin || user?.profile?.isAdmin || user?.profile?.isLoremaster);
  const [entries, setEntries] = useState<LoreEntry[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'All' | LoreCategory>('All');
  const [editor, setEditor] = useState(emptyEditor);
  const [editingId, setEditingId] = useState<string>();
  const [showEditor, setShowEditor] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();

  const loadEntries = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    const response = await loreService.getEntries(canEdit);
    if (response.success && response.data) {
      setEntries(response.data);
      setError(undefined);
    } else {
      setError(response.error || 'The atlas could not be opened.');
    }
    setIsLoading(false);
  }, [canEdit, loreService]);

  useEffect(() => { void loadEntries(true); }, [loadEntries]);

  useSupabaseRealtime({
    channelName: `lore-atlas-${user?.id || 'public'}-${canEdit ? 'desk' : 'reader'}`,
    tables: [DATABASE_TABLES.LORE_ENTRIES],
    onChange: loadEntries
  });

  const selectedEntry = slug ? entries.find(entry => entry.slug === slug) : undefined;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredEntries = entries.filter(entry => {
    if (!canEdit && entry.status !== 'published') return false;
    if (category !== 'All' && entry.category !== category) return false;
    if (!normalizedQuery) return true;
    const searchable = `${entry.title} ${entry.summary} ${entry.category} ${entry.tags.join(' ')}`.toLocaleLowerCase();
    return normalizedQuery.split(/\s+/).every(term => searchable.includes(term));
  });
  const featuredEntry = filteredEntries.find(entry => entry.isFeatured && entry.status === 'published');
  const listEntries = featuredEntry ? filteredEntries.filter(entry => entry._id !== featuredEntry._id) : filteredEntries;

  useEffect(() => {
    if (slug && !isLoading && !selectedEntry) setError('That lore entry does not exist or has not been published.');
  }, [isLoading, selectedEntry, slug]);

  const resetEditor = () => {
    setEditor(emptyEditor);
    setEditingId(undefined);
    setShowEditor(false);
  };

  const startEditing = (entry?: LoreEntry) => {
    if (entry) {
      setEditor({
        title: entry.title,
        summary: entry.summary,
        bodyHtml: entry.bodyHtml,
        category: entry.category,
        tagsText: entry.tags.join(', '),
        imageUrl: entry.imageUrl || '',
        status: entry.status,
        isFeatured: entry.isFeatured
      });
      setEditingId(entry._id);
    } else {
      setEditor(emptyEditor);
      setEditingId(undefined);
    }
    setError(undefined);
    setMessage(undefined);
    setShowEditor(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveEntry = async (event: FormEvent, status: LoreEntryStatus) => {
    event.preventDefault();
    if (!canEdit) return;
    setIsSaving(true);
    setError(undefined);
    setMessage(undefined);
    const input: SaveLoreEntryInput = {
      title: editor.title,
      summary: editor.summary,
      bodyHtml: editor.bodyHtml,
      category: editor.category,
      tags: editor.tagsText.split(',').map(tag => tag.trim()).filter(Boolean),
      status,
      imageUrl: editor.imageUrl,
      isFeatured: editor.isFeatured
    };
    const response = await loreService.saveEntry(editingId, input);
    if (response.success) {
      setMessage(response.message);
      await loadEntries();
      resetEditor();
    } else {
      setError(response.error || 'The entry could not be saved.');
    }
    setIsSaving(false);
  };

  const deleteEntry = async (entry: LoreEntry) => {
    if (!entry._id || !canEdit || !window.confirm(`Delete “${entry.title}”?`)) return;
    const response = await loreService.deleteEntry(entry._id);
    if (response.success) {
      setMessage(response.message);
      if (slug === entry.slug) navigate('/lore');
      await loadEntries();
    } else {
      setError(response.error || 'The entry could not be deleted.');
    }
  };

  if (slug && selectedEntry) {
    return (
      <div className="lore-page lore-entry-page">
        <Link className="lore-back-link" to="/lore"><ArrowLeft /> Return to the atlas</Link>
        <article className="lore-entry-article">
          {selectedEntry.imageUrl && <div className="lore-entry-image"><img src={selectedEntry.imageUrl} alt="" /></div>}
          <header>
            <div className="lore-entry-meta"><span>{selectedEntry.category}</span>{selectedEntry.status === 'draft' && <strong>Draft</strong>}</div>
            <h1>{selectedEntry.title}</h1>
            <p>{selectedEntry.summary}</p>
            <div className="lore-byline"><Feather /> Recorded by {selectedEntry.authorName} · Updated {formatDate(selectedEntry.updatedAt)}</div>
            {selectedEntry.tags.length > 0 && <div className="lore-tags">{selectedEntry.tags.map(tag => <span key={tag}><Tag /> {tag}</span>)}</div>}
          </header>
          <SafeRichText className="lore-rich-text" html={selectedEntry.bodyHtml} />
          {canEdit && <div className="lore-entry-actions"><button type="button" onClick={() => { navigate('/lore'); window.setTimeout(() => startEditing(selectedEntry), 0); }}><Edit3 /> Edit entry</button><button type="button" className="is-danger" onClick={() => void deleteEntry(selectedEntry)}><Trash2 /> Delete</button></div>}
        </article>
      </div>
    );
  }

  return (
    <div className="lore-page">
      <header className="lore-hero">
        <div><p className="site-kicker"><MapPin /> The living atlas</p><h1>What survives<br /><em>the Convergence.</em></h1><p>Places, people, histories, and unanswered questions recorded by the Loremaster as the shared world grows.</p></div>
        <div className="lore-hero-mark"><Library /><span>Atlas of</span><strong>Ao</strong><small>{entries.filter(entry => entry.status === 'published').length} published entries</small></div>
      </header>

      {canEdit && (
        <section className="lore-desk-bar">
          <div><Feather /><span><strong>Loremaster desk</strong><small>{entries.filter(entry => entry.status === 'draft').length} drafts awaiting publication</small></span></div>
          <button type="button" onClick={() => showEditor ? resetEditor() : startEditing()}>{showEditor ? <X /> : <Plus />}{showEditor ? 'Close desk' : 'New entry'}</button>
        </section>
      )}

      {(error || message) && <div className={`lore-notice${error ? ' is-error' : ''}`} role="status">{error || message}</div>}

      {showEditor && canEdit && (
        <form className="lore-editor" onSubmit={event => void saveEntry(event, editor.status)}>
          <header><div><p className="site-kicker"><Feather /> Loremaster desk</p><h2>{editingId ? 'Revise an entry' : 'Record new lore'}</h2></div>{editingId && <span>Editing existing entry</span>}</header>
          <div className="lore-editor-grid">
            <label className="lore-field lore-field-wide"><span>Entry title</span><input required maxLength={100} value={editor.title} onChange={event => setEditor(current => ({ ...current, title: event.target.value }))} placeholder="The City of Axiom" /></label>
            <label className="lore-field"><span>Category</span><select value={editor.category} onChange={event => setEditor(current => ({ ...current, category: event.target.value as LoreCategory }))}>{categories.slice(1).map(option => <option key={option}>{option}</option>)}</select></label>
            <label className="lore-field"><span>Tags <small>comma separated</small></span><input value={editor.tagsText} onChange={event => setEditor(current => ({ ...current, tagsText: event.target.value }))} placeholder="Axiom, planar travel" /></label>
            <label className="lore-field lore-field-wide"><span>Short summary</span><textarea required maxLength={500} rows={3} value={editor.summary} onChange={event => setEditor(current => ({ ...current, summary: event.target.value }))} /></label>
            <label className="lore-field lore-field-wide"><span><Image /> Header image URL <small>optional HTTPS link</small></span><input type="url" value={editor.imageUrl} onChange={event => setEditor(current => ({ ...current, imageUrl: event.target.value }))} placeholder="https://…" /></label>
            <div className="lore-field-wide"><RichTextEditor label="Lore entry" value={editor.bodyHtml} onChange={bodyHtml => setEditor(current => ({ ...current, bodyHtml }))} placeholder="Record what is known…" /></div>
            <label className="lore-feature-toggle"><input type="checkbox" checked={editor.isFeatured} onChange={event => setEditor(current => ({ ...current, isFeatured: event.target.checked }))} /><Sparkles /><span><strong>Feature this entry</strong><small>Place it prominently at the front of the atlas.</small></span></label>
          </div>
          <footer><button type="button" disabled={isSaving} onClick={event => void saveEntry(event, 'draft')}><Save /> Save draft</button><button className="is-primary" type="button" disabled={isSaving} onClick={event => void saveEntry(event, 'published')}>{isSaving ? <Loader2 className="spin" /> : <Eye />} Publish entry</button></footer>
        </form>
      )}

      <section className="lore-controls" aria-label="Search lore">
        <div className="lore-search"><Search /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search the atlas…" /><kbd>{filteredEntries.length}</kbd></div>
        <div className="lore-categories">{categories.map(item => <button type="button" className={category === item ? 'is-active' : ''} onClick={() => setCategory(item)} key={item}>{item}</button>)}</div>
      </section>

      {isLoading ? <div className="lore-loading"><Loader2 className="spin" /> Opening the atlas…</div> : (
        <main>
          {featuredEntry && <LoreCard entry={featuredEntry} featured canEdit={canEdit} onEdit={startEditing} onDelete={deleteEntry} />}
          <div className="lore-grid">{listEntries.map(entry => <LoreCard entry={entry} canEdit={canEdit} onEdit={startEditing} onDelete={deleteEntry} key={entry._id} />)}</div>
          {filteredEntries.length === 0 && <div className="lore-empty"><BookOpen /><h2>No entry found</h2><p>Try another search or category. Some corners of Ao remain unrecorded.</p></div>}
        </main>
      )}
    </div>
  );
};

const LoreCard: React.FC<{ entry: LoreEntry; featured?: boolean; canEdit: boolean; onEdit: (entry: LoreEntry) => void; onDelete: (entry: LoreEntry) => void }> = ({ entry, featured, canEdit, onEdit, onDelete }) => (
  <article className={`lore-card${featured ? ' is-featured' : ''}`}>
    {entry.imageUrl && <Link className="lore-card-image" to={`/lore/${entry.slug}`}><img src={entry.imageUrl} alt="" /></Link>}
    <div className="lore-card-copy"><div className="lore-card-meta"><span>{entry.category}</span>{entry.status === 'draft' && <strong>Draft</strong>}{featured && <small><Sparkles /> Featured</small>}</div><h2><Link to={`/lore/${entry.slug}`}>{entry.title}</Link></h2><p>{entry.summary}</p><footer><span>Updated {formatDate(entry.updatedAt)}</span><Link to={`/lore/${entry.slug}`}>Open entry <ArrowLeft /></Link></footer>{canEdit && <div className="lore-card-actions"><button type="button" onClick={() => onEdit(entry)}><Edit3 /> Edit</button><button type="button" onClick={() => void onDelete(entry)}><Trash2 /> Delete</button></div>}</div>
  </article>
);

const formatDate = (date: Date) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);

export default LorePage;
