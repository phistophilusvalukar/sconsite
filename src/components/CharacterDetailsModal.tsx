import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Download,
  FileJson,
  Network,
  Plus,
  Save,
  Trash2,
  Upload,
  Users,
  X
} from 'lucide-react';
import {
  Character,
  CharacterJournalEntry,
  CharacterRelationship,
  FoundryJsonEntry
} from '../types/database';

type DetailsTab = 'foundry' | 'journal' | 'relationships';

interface CharacterDetailsModalProps {
  character: Character;
  characters: Character[];
  onClose: () => void;
  onEdit: (character: Character) => void;
  onSaveMetadata: (character: Character) => Promise<void>;
}

interface CharacterMeta {
  foundryFiles: FoundryJsonEntry[];
  journalEntries: CharacterJournalEntry[];
  relationships: CharacterRelationship[];
}

const defaultPortrait = 'https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=900&h=1200&fit=crop';

const CharacterDetailsModal: React.FC<CharacterDetailsModalProps> = ({
  character,
  characters,
  onClose,
  onEdit,
  onSaveMetadata
}) => {
  const initialMeta = useMemo(() => getCharacterMeta(character), [character]);
  const [activeTab, setActiveTab] = useState<DetailsTab>('foundry');
  const [foundryFiles, setFoundryFiles] = useState<FoundryJsonEntry[]>(initialMeta.foundryFiles);
  const [journalEntries, setJournalEntries] = useState<CharacterJournalEntry[]>(initialMeta.journalEntries);
  const [relationships, setRelationships] = useState<CharacterRelationship[]>(initialMeta.relationships);
  const [selectedFoundryId, setSelectedFoundryId] = useState(initialMeta.foundryFiles[0]?.id || '');
  const [journalDraft, setJournalDraft] = useState({ title: '', body: '' });
  const [relationshipDraft, setRelationshipDraft] = useState({ targetCharacterId: '', label: '' });
  const [graphRootId, setGraphRootId] = useState(character._id || '');
  const [graphDepth, setGraphDepth] = useState(1);
  const [isSaving, setIsSaving] = useState(false);

  const parsedData = character.foundryJson ? getCharacterDataFromJson(character.foundryJson) : null;
  const characterPortrait = parsedData?.avatar || character.stats?.avatar || defaultPortrait;
  const selectedFoundry = foundryFiles.find(file => file.id === selectedFoundryId) || foundryFiles[0];
  const otherCharacters = characters.filter(item => item._id && item._id !== character._id);
  const graph = buildRelationshipGraph(character, characters, relationships, graphRootId, graphDepth);

  const handleFoundryImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const json = JSON.parse(await readFileAsText(file));
      const entry: FoundryJsonEntry = {
        id: createId(),
        name: file.name,
        json,
        createdAt: new Date().toISOString()
      };

      setFoundryFiles(prev => [...prev, entry]);
      setSelectedFoundryId(entry.id);
      event.target.value = '';
    } catch (error) {
      console.error('Error importing Foundry JSON:', error);
      alert('Unable to import that file. Please choose a valid JSON file.');
    }
  };

  const handleDownloadFoundry = (entry: FoundryJsonEntry) => {
    const dataBlob = new Blob([JSON.stringify(entry.json, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = entry.name || `${character.name}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleRenameFoundry = (entry: FoundryJsonEntry) => {
    const nextName = prompt('Rename Foundry JSON', entry.name);
    if (!nextName?.trim()) return;
    setFoundryFiles(prev => prev.map(file => file.id === entry.id ? { ...file, name: nextName.trim() } : file));
  };

  const handleMoveFoundry = (entryId: string, direction: -1 | 1) => {
    setFoundryFiles(prev => {
      const index = prev.findIndex(file => file.id === entryId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(nextIndex, 0, moved);
      return next;
    });
  };

  const handleDeleteFoundry = (entryId: string) => {
    setFoundryFiles(prev => {
      const next = prev.filter(file => file.id !== entryId);
      if (selectedFoundryId === entryId) {
        setSelectedFoundryId(next[0]?.id || '');
      }
      return next;
    });
  };

  const handleAddJournal = () => {
    if (!journalDraft.title.trim() || !journalDraft.body.trim()) return;

    setJournalEntries(prev => [
      {
        id: createId(),
        title: journalDraft.title.trim(),
        body: journalDraft.body.trim(),
        createdAt: new Date().toISOString()
      },
      ...prev
    ]);
    setJournalDraft({ title: '', body: '' });
  };

  const handleAddRelationship = () => {
    if (!relationshipDraft.targetCharacterId || !relationshipDraft.label.trim()) return;
    if (relationships.some(link => link.targetCharacterId === relationshipDraft.targetCharacterId)) return;

    setRelationships(prev => [
      ...prev,
      {
        id: createId(),
        targetCharacterId: relationshipDraft.targetCharacterId,
        label: relationshipDraft.label.trim()
      }
    ]);
    setRelationshipDraft({ targetCharacterId: '', label: '' });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const primaryFoundry = foundryFiles[0];
      const updatedCharacter: Character = {
        ...character,
        stats: {
          ...(character.stats || {}),
          foundryFiles,
          journalEntries,
          relationships
        },
        foundryJson: primaryFoundry?.json || null,
        foundryFileName: primaryFoundry?.name || ''
      };

      await onSaveMetadata(updatedCharacter);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-fantasy-700/40 bg-midnight-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-fantasy-700/30 px-6 py-4">
          <div>
            <p className="text-sm uppercase tracking-[0.14em] text-yellow-300">Character Dossier</p>
            <h2 className="font-fantasy text-2xl font-bold text-white">{character.name}</h2>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => onEdit(character)}
              className="rounded-lg bg-fantasy-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-fantasy-600"
            >
              Edit
            </button>
            <button onClick={onClose} className="p-2 text-gray-400 transition-colors hover:text-white" title="Close">
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-2">
          <section className="border-b border-fantasy-700/30 lg:border-b-0 lg:border-r">
            <div className="grid gap-6 p-6 md:grid-cols-[minmax(220px,0.85fr)_1fr] lg:grid-cols-1 xl:grid-cols-[minmax(260px,0.85fr)_1fr]">
              <img src={characterPortrait} alt={character.name} className="h-[420px] w-full rounded-lg object-cover" />
              <div className="space-y-5">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.12em] text-yellow-300">
                    Level {character.level} {character.class}
                  </p>
                  <h3 className="font-fantasy text-4xl font-bold text-white">{character.name}</h3>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Detail label="Ancestry" value={character.ancestry || character.race} />
                  <Detail label="Heritage" value={character.heritage || 'Unknown'} />
                  <Detail label="Background" value={character.background || 'Unrecorded'} />
                  <Detail label="Status" value={character.isActive ? 'Active' : 'Inactive'} />
                  <Detail label="Age" value={parsedData?.age || character.stats?.age || 'Unknown'} />
                  <Detail label="Height" value={parsedData?.height || character.stats?.height || 'Unknown'} />
                  <Detail label="Weight" value={parsedData?.weight || character.stats?.weight || 'Unknown'} />
                  <Detail label="Wealth" value={parsedData?.wealth !== undefined ? `${parsedData.wealth} gp` : 'Unknown'} />
                </div>

                {character.backstory && (
                  <div>
                    <h4 className="mb-2 text-sm font-semibold uppercase tracking-[0.12em] text-gray-400">Backstory</h4>
                    <div className="max-h-48 overflow-y-auto rounded-lg bg-fantasy-900/30 p-4 text-sm leading-relaxed text-gray-100" dangerouslySetInnerHTML={{ __html: character.backstory }} />
                  </div>
                )}

                {character.notes && (
                  <div>
                    <h4 className="mb-2 text-sm font-semibold uppercase tracking-[0.12em] text-gray-400">Notes</h4>
                    <p className="rounded-lg bg-fantasy-900/30 p-4 text-sm leading-relaxed text-gray-100">{character.notes}</p>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="flex min-h-[620px] flex-col">
            <div className="grid grid-cols-3 border-b border-fantasy-700/30">
              <TabButton active={activeTab === 'foundry'} label="Foundry" icon={<FileJson className="h-4 w-4" />} onClick={() => setActiveTab('foundry')} />
              <TabButton active={activeTab === 'journal'} label="Journal" icon={<BookOpen className="h-4 w-4" />} onClick={() => setActiveTab('journal')} />
              <TabButton active={activeTab === 'relationships'} label="Relations" icon={<Network className="h-4 w-4" />} onClick={() => setActiveTab('relationships')} />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              {activeTab === 'foundry' && (
                <div className="space-y-5">
                  <label className="flex cursor-pointer items-center justify-center space-x-2 rounded-lg border-2 border-dashed border-fantasy-700/50 p-4 text-gray-300 transition-colors hover:border-yellow-400/60">
                    <Upload className="h-5 w-5" />
                    <span>Add Foundry JSON</span>
                    <input type="file" accept=".json,application/json" onChange={handleFoundryImport} className="hidden" />
                  </label>

                  <div className="space-y-2">
                    {foundryFiles.map((entry, index) => (
                      <button
                        key={entry.id}
                        onClick={() => setSelectedFoundryId(entry.id)}
                        className={`flex w-full items-center gap-2 rounded-lg border p-3 text-left transition-colors ${
                          selectedFoundry?.id === entry.id
                            ? 'border-yellow-400/70 bg-yellow-400/10'
                            : 'border-fantasy-700/40 bg-fantasy-900/30 hover:border-fantasy-500'
                        }`}
                      >
                        <FileJson className="h-5 w-5 shrink-0 text-yellow-300" />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{entry.name}</span>
                        <IconButton title="Move up" disabled={index === 0} onClick={() => handleMoveFoundry(entry.id, -1)} icon={<ArrowUp className="h-4 w-4" />} />
                        <IconButton title="Move down" disabled={index === foundryFiles.length - 1} onClick={() => handleMoveFoundry(entry.id, 1)} icon={<ArrowDown className="h-4 w-4" />} />
                        <IconButton title="Rename" onClick={() => handleRenameFoundry(entry)} icon={<span className="text-xs font-bold">Aa</span>} />
                        <IconButton title="Download" onClick={() => handleDownloadFoundry(entry)} icon={<Download className="h-4 w-4" />} />
                        <IconButton title="Delete" onClick={() => handleDeleteFoundry(entry.id)} icon={<Trash2 className="h-4 w-4" />} danger />
                      </button>
                    ))}
                    {foundryFiles.length === 0 && <p className="rounded-lg bg-fantasy-900/30 p-4 text-sm text-gray-400">No Foundry JSON files saved yet.</p>}
                  </div>

                  {selectedFoundry && (
                    <pre className="max-h-80 overflow-auto rounded-lg bg-black/40 p-4 text-xs text-gray-200">
                      {JSON.stringify(selectedFoundry.json, null, 2)}
                    </pre>
                  )}
                </div>
              )}

              {activeTab === 'journal' && (
                <div className="space-y-5">
                  <div className="rounded-lg bg-fantasy-900/30 p-4">
                    <input
                      value={journalDraft.title}
                      onChange={event => setJournalDraft(prev => ({ ...prev, title: event.target.value }))}
                      className="mb-3 w-full rounded-lg border border-fantasy-700/30 bg-fantasy-800/50 p-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                      placeholder="Entry title"
                    />
                    <textarea
                      value={journalDraft.body}
                      onChange={event => setJournalDraft(prev => ({ ...prev, body: event.target.value }))}
                      className="mb-3 h-32 w-full resize-none rounded-lg border border-fantasy-700/30 bg-fantasy-800/50 p-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                      placeholder="What happened on the road?"
                    />
                    <button onClick={handleAddJournal} className="flex items-center space-x-2 rounded-lg bg-yellow-500 px-4 py-2 font-bold text-midnight-900 transition-colors hover:bg-yellow-400">
                      <Plus className="h-4 w-4" />
                      <span>Add Entry</span>
                    </button>
                  </div>

                  {journalEntries.map(entry => (
                    <article key={entry.id} className="rounded-lg border border-fantasy-700/30 bg-fantasy-900/30 p-4">
                      <div className="mb-2 flex items-start justify-between gap-4">
                        <div>
                          <h4 className="text-lg font-bold text-white">{entry.title}</h4>
                          <p className="text-xs text-gray-400">{new Date(entry.createdAt).toLocaleString()}</p>
                        </div>
                        <button onClick={() => setJournalEntries(prev => prev.filter(item => item.id !== entry.id))} className="p-2 text-gray-400 transition-colors hover:text-red-300" title="Delete entry">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-200">{entry.body}</p>
                    </article>
                  ))}
                  {journalEntries.length === 0 && <p className="rounded-lg bg-fantasy-900/30 p-4 text-sm text-gray-400">No journal entries yet.</p>}
                </div>
              )}

              {activeTab === 'relationships' && (
                <div className="space-y-5">
                  <div className="rounded-lg bg-fantasy-900/30 p-4">
                    <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                      <select
                        value={relationshipDraft.targetCharacterId}
                        onChange={event => setRelationshipDraft(prev => ({ ...prev, targetCharacterId: event.target.value }))}
                        className="rounded-lg border border-fantasy-700/30 bg-fantasy-800/50 p-3 text-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
                      >
                        <option value="">Select character</option>
                        {otherCharacters.map(item => (
                          <option key={item._id} value={item._id}>{item.name}</option>
                        ))}
                      </select>
                      <input
                        value={relationshipDraft.label}
                        onChange={event => setRelationshipDraft(prev => ({ ...prev, label: event.target.value }))}
                        className="rounded-lg border border-fantasy-700/30 bg-fantasy-800/50 p-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                        placeholder="Mentor, rival, sibling..."
                      />
                      <button onClick={handleAddRelationship} className="flex items-center justify-center space-x-2 rounded-lg bg-yellow-500 px-4 py-2 font-bold text-midnight-900 transition-colors hover:bg-yellow-400">
                        <Plus className="h-4 w-4" />
                        <span>Add</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {relationships.map(link => {
                      const target = characters.find(item => item._id === link.targetCharacterId);
                      return (
                        <div key={link.id} className="flex items-center justify-between gap-3 rounded-lg border border-fantasy-700/30 bg-fantasy-900/30 p-3">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-white">{target?.name || 'Unknown character'}</p>
                            <p className="truncate text-sm text-yellow-200">{link.label}</p>
                          </div>
                          <button onClick={() => setRelationships(prev => prev.filter(item => item.id !== link.id))} className="p-2 text-gray-400 transition-colors hover:text-red-300" title="Delete relationship">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                    {relationships.length === 0 && <p className="rounded-lg bg-fantasy-900/30 p-4 text-sm text-gray-400">No direct relationships yet.</p>}
                  </div>

                  <div className="rounded-lg border border-fantasy-700/30 bg-black/30 p-4">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center space-x-2 text-white">
                        <Users className="h-5 w-5 text-yellow-300" />
                        <span className="font-semibold">Graph View</span>
                      </div>
                      <div className="flex rounded-lg border border-fantasy-700/40">
                        {[1, 2, 3].map(depth => (
                          <button
                            key={depth}
                            onClick={() => setGraphDepth(depth)}
                            className={`px-3 py-2 text-sm ${graphDepth === depth ? 'bg-yellow-500 text-midnight-900' : 'text-gray-300 hover:text-white'}`}
                          >
                            {depth === 1 ? 'Direct' : `${depth} levels`}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="relative min-h-[280px] overflow-hidden rounded-lg bg-midnight-900/70 p-4">
                      <div className="flex min-h-[240px] items-center justify-center">
                        <GraphNodes graph={graph} rootId={graphRootId} onSelectRoot={setGraphRootId} />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-fantasy-700/30 p-4">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex w-full items-center justify-center space-x-2 rounded-lg bg-yellow-500 px-5 py-3 font-bold text-midnight-900 transition-colors hover:bg-yellow-400 disabled:bg-gray-600"
              >
                <Save className="h-5 w-5" />
                <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-fantasy-900/30 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-gray-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function TabButton({ active, label, icon, onClick }: { active: boolean; label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center space-x-2 px-3 py-4 text-sm font-semibold transition-colors ${
        active ? 'bg-fantasy-800/60 text-yellow-300' : 'text-gray-400 hover:bg-fantasy-900/40 hover:text-white'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function IconButton({ title, icon, onClick, disabled, danger }: { title: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <span
      role="button"
      aria-label={title}
      title={title}
      onClick={event => {
        event.stopPropagation();
        if (!disabled) onClick();
      }}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors ${
        disabled
          ? 'cursor-not-allowed text-gray-600'
          : danger
            ? 'text-gray-400 hover:bg-red-500/20 hover:text-red-200'
            : 'text-gray-400 hover:bg-fantasy-700/60 hover:text-white'
      }`}
    >
      {icon}
    </span>
  );
}

function GraphNodes({ graph, rootId, onSelectRoot }: { graph: RelationshipGraph; rootId: string; onSelectRoot: (id: string) => void }) {
  if (graph.nodes.length === 0) {
    return <p className="text-sm text-gray-400">Add relationships to build the graph.</p>;
  }

  const root = graph.nodes.find(node => node.id === rootId) || graph.nodes[0];
  const rings = [0, 1, 2, 3].map(depth => graph.nodes.filter(node => node.depth === depth));

  return (
    <div className="w-full space-y-5">
      <div className="flex justify-center">
        <button onClick={() => onSelectRoot(root.id)} className="rounded-full border border-yellow-300/60 bg-yellow-400/20 px-5 py-3 font-bold text-white">
          {root.name}
        </button>
      </div>
      {rings.slice(1).map((nodes, ringIndex) => (
        nodes.length > 0 && (
          <div key={ringIndex} className="flex flex-wrap items-center justify-center gap-3">
            {nodes.map(node => (
              <button
                key={node.id}
                onClick={() => onSelectRoot(node.id)}
                className="rounded-full border border-fantasy-500/50 bg-fantasy-900/70 px-4 py-2 text-sm text-white transition-colors hover:border-yellow-300"
                title={node.pathLabel}
              >
                <span className="font-semibold">{node.name}</span>
                {node.pathLabel && <span className="ml-2 text-yellow-200">{node.pathLabel}</span>}
              </button>
            ))}
          </div>
        )
      ))}
    </div>
  );
}

interface RelationshipGraph {
  nodes: Array<{ id: string; name: string; depth: number; pathLabel: string }>;
}

function buildRelationshipGraph(character: Character, characters: Character[], draftRelationships: CharacterRelationship[], rootId: string, maxDepth: number): RelationshipGraph {
  const byId = new Map(characters.filter(item => item._id).map(item => [item._id as string, item]));
  byId.set(character._id || '', { ...character, stats: { ...(character.stats || {}), relationships: draftRelationships } });

  const startId = rootId || character._id || '';
  const queue = [{ id: startId, depth: 0, pathLabel: '' }];
  const visited = new Set<string>();
  const nodes: RelationshipGraph['nodes'] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current.id) || current.depth > maxDepth) continue;

    visited.add(current.id);
    const currentCharacter = byId.get(current.id);
    if (currentCharacter) {
      nodes.push({
        id: current.id,
        name: currentCharacter.name,
        depth: current.depth,
        pathLabel: current.pathLabel
      });
    }

    if (current.depth >= maxDepth) continue;

    const currentRelationships = current.id === character._id ? draftRelationships : getCharacterMeta(currentCharacter).relationships;
    currentRelationships.forEach(link => {
      if (!visited.has(link.targetCharacterId)) {
        queue.push({
          id: link.targetCharacterId,
          depth: current.depth + 1,
          pathLabel: link.label
        });
      }
    });
  }

  return { nodes };
}

function getCharacterMeta(character?: Character): CharacterMeta {
  const stats = character?.stats || {};
  const legacyFoundry = character?.foundryJson
    ? [{
        id: 'primary-foundry-json',
        name: character.foundryFileName || `${character.name}.json`,
        json: character.foundryJson,
        createdAt: character.createdAt?.toISOString?.() || new Date().toISOString()
      }]
    : [];

  return {
    foundryFiles: Array.isArray(stats.foundryFiles) && stats.foundryFiles.length > 0 ? stats.foundryFiles : legacyFoundry,
    journalEntries: Array.isArray(stats.journalEntries) ? stats.journalEntries : [],
    relationships: Array.isArray(stats.relationships) ? stats.relationships : []
  };
}

function getCharacterDataFromJson(jsonData: unknown) {
  try {
    const data = jsonData as {
      img?: string;
      system?: {
        details?: {
          biography?: {
            appearance?: string;
          };
          age?: { value?: number };
          height?: { value?: string };
          weight?: { value?: string };
          level?: { value?: number };
        };
        attributes?: {
          wealth?: { value?: number };
        };
      };
    };
    const system = data.system || {};
    const details = system.details || {};
    const biography = details.biography || {};
    const attributes = system.attributes || {};

    return {
      age: details.age?.value || null,
      height: details.height?.value || '',
      weight: details.weight?.value || '',
      level: details.level?.value || 1,
      wealth: attributes.wealth?.value || 0,
      avatar: data.img || biography.appearance || ''
    };
  } catch (error) {
    console.error('Error parsing character JSON:', error);
    return null;
  }
}

function createId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => resolve(event.target?.result as string);
    reader.onerror = event => reject(event);
    reader.readAsText(file);
  });
}

export default CharacterDetailsModal;
