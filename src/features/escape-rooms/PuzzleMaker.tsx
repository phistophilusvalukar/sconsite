import { useEffect, useRef, useState } from 'react';
import { Download, Plus, Save, Upload } from 'lucide-react';
import ClueMap from './ClueMap';
import { blueprintSchema, isLock, newNode, nodeKinds, propKinds, validateBlueprint, type Blueprint, type PuzzleNode } from './model';

export default function PuzzleMaker({ initial, onSave, busy, onDirty }: { initial: Blueprint; onSave: (draft: Blueprint) => Promise<void>; busy: boolean; onDirty: (dirty: boolean) => void }) {
  const [draft, setDraft] = useState<Blueprint>(() => structuredClone(initial));
  const [selected, setSelected] = useState(initial.nodes[0]?.id ?? '');
  const [fileError, setFileError] = useState('');
  const [dirty, setDirty] = useState(false);
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const guardLink = (event: MouseEvent) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest('a') : null;
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
      const destination = new URL(link.href, window.location.href);
      if (destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      if (!window.confirm('Leave the puzzle maker and discard unsaved changes?')) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', guardLink, true);
    return () => { window.removeEventListener('beforeunload', warn); document.removeEventListener('click', guardLink, true); };
  }, [dirty]);
  const inputRef = useRef<HTMLInputElement>(null);
  const current = draft.nodes.find(n => n.id === selected);
  const errors = validateBlueprint(draft);
  const update = (value: Blueprint) => { setDraft(value); setDirty(true); };
  const patch = (change: Partial<PuzzleNode>) => update({ ...draft, nodes: draft.nodes.map(n => n.id === selected ? { ...n, ...change } : n) });
  const exportFile = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'escape-room-blueprint.json'; a.click(); URL.revokeObjectURL(url);
  };
  return <fieldset className="er-maker" disabled={busy} aria-label="Puzzle maker">
    <div className="er-section-heading"><div><span className="er-eyebrow">Puzzle maker</span><h2>Design the path to discovery</h2><p>Solid lines are prerequisites. Dashed lines connect required items to locks.</p></div>
      <div className="er-actions">
        <button onClick={exportFile}><Download size={16} /> Export</button>
        <button onClick={() => inputRef.current?.click()}><Upload size={16} /> Import</button>
        <button className="er-primary" disabled={busy || errors.length > 0} onClick={async () => { try { await onSave(draft); setDirty(false); } catch { /* Parent displays the server error; retain the unsaved draft. */ } }}><Save size={16} /> {busy ? 'Saving…' : dirty ? 'Save changes' : 'Save blueprint'}</button>
      </div>
    </div>
    <input ref={inputRef} type="file" accept=".json,application/json" hidden onChange={async e => {
      const file = e.target.files?.[0]; e.target.value = '';
      if (!file) return;
      try {
        if (file.size > 2_000_000) throw new Error('Blueprint files must be smaller than 2 MB.');
        const imported = blueprintSchema.parse(JSON.parse(await file.text()));
        if (dirty && !window.confirm('Replace the unsaved draft with this imported blueprint?')) return;
        update(imported); setSelected(imported.nodes[0].id); setFileError('');
      } catch (err) { setFileError(err instanceof Error ? err.message : 'Invalid blueprint file.'); }
    }} />
    {fileError && <p className="er-error" role="alert">{fileError}</p>}
    <div className="er-blueprint-fields"><label>Adventure title<input maxLength={120} value={draft.title} onChange={e => update({ ...draft, title: e.target.value })} /></label><label>Player introduction<textarea maxLength={2000} value={draft.description} onChange={e => update({ ...draft, description: e.target.value })} /></label></div>
    <div className="er-editor-layout"><div>
      <div className="er-map-toolbar"><span>{draft.nodes.length} discoveries · {dirty ? 'Unsaved draft' : 'Blueprint'}</span><button disabled={draft.nodes.length >= 100} onClick={() => { const n = newNode(); update({ ...draft, nodes: [...draft.nodes, n] }); setSelected(n.id); }}><Plus size={16} /> Add discovery</button></div>
      <ClueMap blueprint={draft} selected={selected} onSelect={setSelected} />
      <div className="er-diagnostics"><h3>Path check</h3>{errors.length ? <ul>{errors.map(e => <li key={e}>{e}</li>)}</ul> : <p>All references are valid, the path has no cycles, and an ending is defined.</p>}<p>Manual discoveries wait for a GM reveal. All treasure nodes must be claimed to complete the room.</p></div>
    </div>
    {current && <aside className="er-node-editor" key={current.id}>
      <span className="er-eyebrow">Discovery details</span>
      <label>Name<input maxLength={120} value={current.title} onChange={e => patch({ title: e.target.value })} /></label>
      <div className="er-field-pair"><label>Type<select value={current.kind} onChange={e => { const kind = e.target.value as PuzzleNode['kind']; patch({ kind, ...(!isLock({ kind }) ? { code: '', keyIds: [] } : {}) }); }}>{nodeKinds.map(k => <option key={k}>{k}</option>)}</select></label>
      <label>Physical prop<select value={current.prop} onChange={e => patch({ prop: e.target.value as PuzzleNode['prop'] })}>{propKinds.map(k => <option key={k}>{k}</option>)}</select></label></div>
      <label>Where it is found<input maxLength={200} value={current.location} placeholder="Library · beneath the desk" onChange={e => patch({ location: e.target.value })} /></label>
      <label>Handout / front text<textarea maxLength={8000} rows={4} value={current.text} onChange={e => patch({ text: e.target.value })} /></label>
      <label>Back / inside text<textarea maxLength={8000} rows={3} value={current.backText} onChange={e => patch({ backText: e.target.value })} /><small>Players can read both sides once this item is revealed. Make a separate hidden clue for text requiring another discovery.</small></label>
      <label>GM-only notes<textarea maxLength={8000} value={current.gmNotes} onChange={e => patch({ gmNotes: e.target.value })} /></label>
      <label>Reveal<select value={current.reveal} onChange={e => patch({ reveal: e.target.value as PuzzleNode['reveal'] })}><option value="manual">GM reveals manually</option><option value="automatic">When prerequisites are met</option></select></label>
      <fieldset><legend>Prerequisites</legend>
        <label>Join branches<select value={current.gate} onChange={e => patch({ gate: e.target.value as PuzzleNode['gate'] })}><option value="all">ALL selected paths required</option><option value="any">ANY selected path is enough</option></select></label>
        {draft.nodes.filter(n => n.id !== current.id).map(n => {
          const requirement = current.requires.find(r => r.nodeId === n.id);
          return <div className="er-requirement" key={n.id}><label><input type="checkbox" checked={!!requirement} onChange={e => patch({ requires: e.target.checked ? [...current.requires, { nodeId: n.id, state: 'used' }] : current.requires.filter(r => r.nodeId !== n.id) })} />{n.title}</label>{requirement && <select aria-label={`Required state of ${n.title}`} value={requirement.state} onChange={e => patch({ requires: current.requires.map(r => r.nodeId === n.id ? { ...r, state: e.target.value as 'known' | 'used' } : r) })}><option value="known">Known</option><option value="used">Used / solved</option></select>}</div>;
        })}
      </fieldset>
      {isLock(current) && <fieldset><legend>Unlock requirements</legend><label>Secret answer / code<input maxLength={120} value={current.code} onChange={e => patch({ code: e.target.value })} placeholder="Optional; ignores case and outer spaces" /></label><p>All selected items must be in the shared stash and applied by a player. Items remain available after use.</p>{draft.nodes.filter(n => n.kind === 'item' && n.id !== current.id).map(n => <label className="er-checkbox" key={n.id}><input type="checkbox" checked={current.keyIds.includes(n.id)} onChange={e => patch({ keyIds: e.target.checked ? [...current.keyIds, n.id] : current.keyIds.filter(k => k !== n.id) })} />{n.title}</label>)}</fieldset>}
      <button className="er-danger" disabled={draft.nodes.length < 2} onClick={() => {
        if (!window.confirm(`Delete “${current.title}” and its connections?`)) return;
        const nodes = draft.nodes.filter(n => n.id !== current.id).map(n => ({ ...n, requires: n.requires.filter(r => r.nodeId !== current.id), keyIds: n.keyIds.filter(k => k !== current.id) }));
        update({ ...draft, nodes }); setSelected(nodes[0]?.id ?? '');
      }}>Delete discovery</button>
      <small>Reference ID: {current.id}</small>
    </aside>}
    </div>
  </fieldset>;
}
