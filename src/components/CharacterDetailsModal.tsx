import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Download,
  FileJson,
  Heart,
  Loader2,
  MessageCircle,
  Network,
  Plus,
  Search,
  Trash2,
  Upload,
  Users,
  X
} from 'lucide-react';
import {
  Character,
  CharacterJournalEntry,
  CharacterRelationship,
  CharacterRelationshipType,
  FoundryJsonEntry
} from '../types/database';
import { CharacterService } from '../services/characterService';
import { abilityLabels, getAbilityScoresFromFoundryJson } from '../utils/foundryCharacter';

type DetailsTab = 'foundry' | 'journal' | 'relationships';

interface CharacterDetailsModalProps {
  character: Character;
  characters: Character[];
  currentUserId: string;
  canEdit: boolean;
  onClose: () => void;
  onEdit: (character: Character) => void;
}

const defaultPortrait = 'https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=900&h=1200&fit=crop';

const CharacterDetailsModal: React.FC<CharacterDetailsModalProps> = ({
  character,
  characters,
  currentUserId,
  canEdit,
  onClose,
  onEdit
}) => {
  const characterService = useMemo(() => CharacterService.getInstance(), []);
  const [activeTab, setActiveTab] = useState<DetailsTab>(canEdit ? 'foundry' : 'journal');
  const [foundryFiles, setFoundryFiles] = useState<FoundryJsonEntry[]>([]);
  const [journalEntries, setJournalEntries] = useState<CharacterJournalEntry[]>([]);
  const [relationships, setRelationships] = useState<CharacterRelationship[]>([]);
  const [graphStack, setGraphStack] = useState<string[]>([character._id || '']);
  const [journalDraft, setJournalDraft] = useState({ title: '', body: '' });
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [editingComments, setEditingComments] = useState<Record<string, string>>({});
  const [relationshipDraft, setRelationshipDraft] = useState<{ targetCharacterId: string; relationshipTypes: CharacterRelationshipType[]; subtype: string }>({
    targetCharacterId: '',
    relationshipTypes: ['family'],
    subtype: ''
  });
  const [relationshipSearch, setRelationshipSearch] = useState('');
  const [isRelationshipSearchFocused, setIsRelationshipSearchFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const activeFoundryEntry = foundryFiles.find(file => file.isActive) || foundryFiles[0];
  const activeFoundryJson = activeFoundryEntry?.json || character.foundryJson;
  const parsedData = activeFoundryJson ? getCharacterDataFromJson(activeFoundryJson) : null;
  const characterPortrait = parsedData?.avatar || character.stats?.avatar || defaultPortrait;
  const savedAbilityScores = character.stats?.abilityBoosts?.scores || null;
  const abilityScores = activeFoundryJson ? getAbilityScoresFromFoundryJson(activeFoundryJson) : savedAbilityScores;
  const visibleTabs: DetailsTab[] = canEdit ? ['foundry', 'journal', 'relationships'] : ['journal', 'relationships'];
  const allCharacterIds = characters.map(item => item._id).filter(Boolean) as string[];
  const graphRootId = graphStack[graphStack.length - 1] || character._id || '';
  const graphRoot = characters.find(item => item._id === graphRootId) || character;
  const graphRelationships = relationships.filter(link => link.sourceCharacterId === graphRootId);
  const graphDepth = Math.max(0, graphStack.length - 1);
  const otherCharacters = characters.filter(item => item._id && item._id !== character._id);
  const selectedRelationshipTarget = otherCharacters.find(item => item._id === relationshipDraft.targetCharacterId);
  const relationshipSuggestions = otherCharacters
    .filter(item => {
      const term = relationshipSearch.trim().toLowerCase();
      const alreadyLinked = relationships.some(link => link.sourceCharacterId === character._id && link.targetCharacterId === item._id);
      if (alreadyLinked) return false;
      if (!term) return true;
      return [item.name, item.class, item.ancestry, item.race]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(term));
    })
    .slice(0, 8);

  useEffect(() => {
    setActiveTab(canEdit ? 'foundry' : 'journal');
    setGraphStack([character._id || '']);
    setRelationshipSearch('');
  }, [character._id, canEdit]);

  useEffect(() => {
    loadModalData();
  }, [character._id, currentUserId, canEdit]);

  const loadModalData = async () => {
    if (!character._id) return;

    setIsLoading(true);
    try {
      const [journalResponse, relationshipResponse, foundryResponse] = await Promise.all([
        characterService.getJournalEntries(character._id, currentUserId),
        characterService.getRelationshipsForCharacters(allCharacterIds),
        canEdit ? characterService.getFoundryFiles(character._id) : Promise.resolve({ success: true, data: [] as FoundryJsonEntry[] })
      ]);

      if (journalResponse.success && journalResponse.data) setJournalEntries(journalResponse.data);
      if (relationshipResponse.success && relationshipResponse.data) setRelationships(relationshipResponse.data);
      if (foundryResponse.success && foundryResponse.data) setFoundryFiles(foundryResponse.data);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFoundryImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!character._id || !canEdit) return;
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const json = JSON.parse(await readFileAsText(file));
      const response = await characterService.addFoundryFile(character._id, currentUserId, file.name, json, foundryFiles.length);
      if (response.success && response.data) {
        setFoundryFiles(prev => [...prev, response.data as FoundryJsonEntry]);
      } else {
        alert(response.error || 'Failed to add Foundry file');
      }
      event.target.value = '';
    } catch (error) {
      console.error('Error importing Foundry JSON:', error);
      alert('Unable to import that file. Please choose a valid JSON file.');
    }
  };

  const handleRenameFoundry = async (entry: FoundryJsonEntry) => {
    const nextName = prompt('Rename Foundry JSON', entry.name);
    if (!nextName?.trim()) return;
    const response = await characterService.updateFoundryFile(entry.id, { name: nextName.trim() });
    if (response.success && response.data) {
      setFoundryFiles(prev => prev.map(file => file.id === entry.id ? response.data as FoundryJsonEntry : file));
    } else {
      alert(response.error || 'Failed to rename file');
    }
  };

  const handleMoveFoundry = async (entryId: string, direction: -1 | 1) => {
    const index = foundryFiles.findIndex(file => file.id === entryId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= foundryFiles.length) return;

    const next = [...foundryFiles];
    const [moved] = next.splice(index, 1);
    next.splice(nextIndex, 0, moved);
    setFoundryFiles(next);

    await Promise.all(next.map((file, sortOrder) => characterService.updateFoundryFile(file.id, { sortOrder })));
  };

  const handleDeleteFoundry = async (entryId: string) => {
    const response = await characterService.deleteFoundryFile(entryId);
    if (response.success) {
      setFoundryFiles(prev => prev.filter(file => file.id !== entryId));
    } else {
      alert(response.error || 'Failed to delete Foundry file');
    }
  };

  const handleSetActiveFoundry = async (entry: FoundryJsonEntry) => {
    if (entry.isActive) return;

    const response = await characterService.updateFoundryFile(entry.id, { isActive: true });
    if (response.success && response.data) {
      setFoundryFiles(prev => prev.map(file => ({
        ...file,
        isActive: file.id === entry.id
      })));
    } else {
      alert(response.error || 'Failed to set active Foundry JSON');
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

  const handleAddJournal = async () => {
    if (!character._id || !journalDraft.title.trim() || !journalDraft.body.trim()) return;

    const response = await characterService.createJournalEntry(character._id, currentUserId, journalDraft.title.trim(), journalDraft.body.trim());
    if (response.success && response.data) {
      setJournalEntries(prev => [response.data as CharacterJournalEntry, ...prev]);
      setJournalDraft({ title: '', body: '' });
    } else {
      alert(response.error || 'Failed to add journal entry');
    }
  };

  const handleDeleteJournal = async (entryId: string) => {
    const response = await characterService.deleteJournalEntry(entryId);
    if (response.success) {
      setJournalEntries(prev => prev.filter(entry => entry.id !== entryId));
    } else {
      alert(response.error || 'Failed to delete journal entry');
    }
  };

  const handleToggleLike = async (entry: CharacterJournalEntry) => {
    const response = await characterService.toggleJournalLike(entry.id, currentUserId, entry.likedByCurrentUser);
    if (!response.success) {
      alert(response.error || 'Failed to update like');
      return;
    }

    setJournalEntries(prev => prev.map(item => item.id === entry.id
      ? {
          ...item,
          likedByCurrentUser: !item.likedByCurrentUser,
          likeCount: item.likedByCurrentUser ? Math.max(0, item.likeCount - 1) : item.likeCount + 1
        }
      : item
    ));
  };

  const handleAddComment = async (entryId: string) => {
    const body = commentDrafts[entryId]?.trim();
    if (!body) return;

    const response = await characterService.addJournalComment(entryId, currentUserId, body);
    if (response.success && response.data) {
      setJournalEntries(prev => prev.map(entry => entry.id === entryId
        ? { ...entry, comments: [...entry.comments, response.data!] }
        : entry
      ));
      setCommentDrafts(prev => ({ ...prev, [entryId]: '' }));
    } else {
      alert(response.error || 'Failed to add comment');
    }
  };

  const handleUpdateComment = async (entryId: string, commentId: string) => {
    const body = editingComments[commentId]?.trim();
    if (!body) return;

    const response = await characterService.updateJournalComment(commentId, body);
    if (response.success && response.data) {
      setJournalEntries(prev => prev.map(entry => entry.id === entryId
        ? {
            ...entry,
            comments: entry.comments.map(comment => comment.id === commentId ? response.data! : comment)
          }
        : entry
      ));
      setEditingComments(prev => {
        const next = { ...prev };
        delete next[commentId];
        return next;
      });
    } else {
      alert(response.error || 'Failed to update comment');
    }
  };

  const handleDeleteComment = async (entryId: string, commentId: string) => {
    const response = await characterService.deleteJournalComment(commentId);
    if (response.success) {
      setJournalEntries(prev => prev.map(entry => entry.id === entryId
        ? { ...entry, comments: entry.comments.filter(comment => comment.id !== commentId) }
        : entry
      ));
    } else {
      alert(response.error || 'Failed to delete comment');
    }
  };

  const handleToggleRelationshipType = (type: CharacterRelationshipType) => {
    setRelationshipDraft(prev => {
      const hasType = prev.relationshipTypes.includes(type);
      const relationshipTypes = hasType
        ? prev.relationshipTypes.filter(item => item !== type)
        : [...prev.relationshipTypes, type];
      return { ...prev, relationshipTypes };
    });
  };

  const handleAddRelationship = async () => {
    if (!character._id || !relationshipDraft.targetCharacterId || relationshipDraft.relationshipTypes.length === 0) return;
    if (relationships.some(link => link.sourceCharacterId === character._id && link.targetCharacterId === relationshipDraft.targetCharacterId)) return;

    const response = await characterService.createRelationship(
      character._id,
      currentUserId,
      relationshipDraft.targetCharacterId,
      relationshipDraft.relationshipTypes,
      relationshipDraft.subtype.trim()
    );
    if (response.success && response.data) {
      setRelationships(prev => [...prev, response.data as CharacterRelationship]);
      setRelationshipDraft({ targetCharacterId: '', relationshipTypes: ['family'], subtype: '' });
      setRelationshipSearch('');
    } else {
      alert(response.error || 'Failed to add relationship');
    }
  };

  const handleDeleteRelationship = async (relationshipId: string) => {
    const response = await characterService.deleteRelationship(relationshipId);
    if (response.success) {
      setRelationships(prev => prev.filter(link => link.id !== relationshipId));
    } else {
      alert(response.error || 'Failed to delete relationship');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-fantasy-700/40 bg-midnight-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-fantasy-700/30 px-6 py-4">
          <div>
            <p className="text-sm uppercase tracking-[0.14em] text-yellow-300">{canEdit ? 'Character Dossier' : 'Public Character'}</p>
            <h2 className="font-fantasy text-2xl font-bold text-white">{character.name}</h2>
          </div>
          <div className="flex items-center space-x-2">
            {canEdit && (
              <button onClick={() => onEdit(character)} className="rounded-lg bg-fantasy-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-fantasy-600">
                Edit
              </button>
            )}
            <button onClick={onClose} className="p-2 text-gray-400 transition-colors hover:text-white" title="Close">
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-2">
          <section className="border-b border-fantasy-700/30 lg:border-b-0 lg:border-r">
            <div className="grid gap-6 p-6 md:grid-cols-[minmax(220px,0.85fr)_1fr] lg:grid-cols-1 xl:grid-cols-[minmax(260px,0.85fr)_1fr]">
              <div className="space-y-4">
                <img src={characterPortrait} alt={character.name} className="h-[420px] w-full rounded-lg object-cover" />
                <AbilityRadarChart scores={abilityScores} />
              </div>
              <div className="space-y-5">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.12em] text-yellow-300">Level {character.level} {character.class}</p>
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
            <div className={`grid border-b border-fantasy-700/30 ${visibleTabs.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {canEdit && <TabButton active={activeTab === 'foundry'} label="Foundry" icon={<FileJson className="h-4 w-4" />} onClick={() => setActiveTab('foundry')} />}
              <TabButton active={activeTab === 'journal'} label="Journal" icon={<BookOpen className="h-4 w-4" />} onClick={() => setActiveTab('journal')} />
              <TabButton active={activeTab === 'relationships'} label="Relations" icon={<Network className="h-4 w-4" />} onClick={() => setActiveTab('relationships')} />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              {isLoading ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-yellow-300" />
                </div>
              ) : (
                <>
                  {activeTab === 'foundry' && canEdit && (
                    <div className="space-y-5">
                      <label className="flex cursor-pointer items-center justify-center space-x-2 rounded-lg border-2 border-dashed border-fantasy-700/50 p-4 text-gray-300 transition-colors hover:border-yellow-400/60">
                        <Upload className="h-5 w-5" />
                        <span>Add Foundry JSON</span>
                        <input type="file" accept=".json,application/json" onChange={handleFoundryImport} className="hidden" />
                      </label>
                      <div className="space-y-2">
                        {foundryFiles.map((entry, index) => (
                          <div key={entry.id} className="flex w-full items-center gap-2 rounded-lg border border-fantasy-700/40 bg-fantasy-900/30 p-3">
                            <FileJson className="h-5 w-5 shrink-0 text-yellow-300" />
                            <div className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-white">{entry.name}</span>
                              {entry.isActive && <span className="text-xs font-semibold text-emerald-300">Active power</span>}
                            </div>
                            <button
                              onClick={() => handleSetActiveFoundry(entry)}
                              className={`rounded-md px-3 py-2 text-xs font-bold transition-colors ${
                                entry.isActive
                                  ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/30'
                                  : 'bg-fantasy-800/60 text-gray-300 hover:text-white'
                              }`}
                            >
                              {entry.isActive ? 'Active' : 'Set Active'}
                            </button>
                            <IconButton title="Move up" disabled={index === 0} onClick={() => handleMoveFoundry(entry.id, -1)} icon={<ArrowUp className="h-4 w-4" />} />
                            <IconButton title="Move down" disabled={index === foundryFiles.length - 1} onClick={() => handleMoveFoundry(entry.id, 1)} icon={<ArrowDown className="h-4 w-4" />} />
                            <IconButton title="Rename" onClick={() => handleRenameFoundry(entry)} icon={<span className="text-xs font-bold">Aa</span>} />
                            <IconButton title="Download" onClick={() => handleDownloadFoundry(entry)} icon={<Download className="h-4 w-4" />} />
                            <IconButton title="Delete" onClick={() => handleDeleteFoundry(entry.id)} icon={<Trash2 className="h-4 w-4" />} danger />
                          </div>
                        ))}
                        {foundryFiles.length === 0 && <p className="rounded-lg bg-fantasy-900/30 p-4 text-sm text-gray-400">No Foundry JSON files saved yet.</p>}
                      </div>
                    </div>
                  )}

                  {activeTab === 'journal' && (
                    <div className="space-y-5">
                      {canEdit && (
                        <div className="rounded-lg bg-fantasy-900/30 p-4">
                          <input value={journalDraft.title} onChange={event => setJournalDraft(prev => ({ ...prev, title: event.target.value }))} className="mb-3 w-full rounded-lg border border-fantasy-700/30 bg-fantasy-800/50 p-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400" placeholder="Entry title" />
                          <textarea value={journalDraft.body} onChange={event => setJournalDraft(prev => ({ ...prev, body: event.target.value }))} className="mb-3 h-32 w-full resize-none rounded-lg border border-fantasy-700/30 bg-fantasy-800/50 p-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400" placeholder="What happened on the road?" />
                          <button onClick={handleAddJournal} className="flex items-center space-x-2 rounded-lg bg-yellow-500 px-4 py-2 font-bold text-midnight-900 transition-colors hover:bg-yellow-400">
                            <Plus className="h-4 w-4" />
                            <span>Add Entry</span>
                          </button>
                        </div>
                      )}
                      {journalEntries.map(entry => (
                        <article key={entry.id} className="rounded-lg border border-fantasy-700/30 bg-fantasy-900/30 p-4">
                          <div className="mb-3 flex items-start justify-between gap-4">
                            <div>
                              <h4 className="text-lg font-bold text-white">{entry.title}</h4>
                              <p className="text-xs text-gray-400">{new Date(entry.createdAt).toLocaleString()}</p>
                            </div>
                            {canEdit && <IconButton title="Delete entry" onClick={() => handleDeleteJournal(entry.id)} icon={<Trash2 className="h-4 w-4" />} danger />}
                          </div>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-200">{entry.body}</p>
                          <div className="mt-4 flex items-center gap-3 border-t border-fantasy-700/30 pt-3">
                            <button onClick={() => handleToggleLike(entry)} className={`flex items-center space-x-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${entry.likedByCurrentUser ? 'bg-red-500/20 text-red-200' : 'bg-fantasy-800/50 text-gray-300 hover:text-white'}`}>
                              <Heart className="h-4 w-4" />
                              <span>{entry.likeCount}</span>
                            </button>
                            <div className="flex items-center space-x-2 text-sm text-gray-400">
                              <MessageCircle className="h-4 w-4" />
                              <span>{entry.comments.length}</span>
                            </div>
                          </div>
                          <div className="mt-4 space-y-3">
                            {entry.comments.map(comment => (
                              <div key={comment.id} className="rounded-lg bg-midnight-900/60 p-3">
                                <p className="text-xs text-gray-500">{comment.authorId === currentUserId ? 'You' : 'Player'} - {new Date(comment.createdAt).toLocaleString()}</p>
                                {comment.isEdited && <p className="mt-1 text-xs text-gray-500">Edited</p>}
                                {editingComments[comment.id] !== undefined ? (
                                  <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto_auto]">
                                    <input value={editingComments[comment.id]} onChange={event => setEditingComments(prev => ({ ...prev, [comment.id]: event.target.value }))} className="rounded-lg border border-fantasy-700/30 bg-fantasy-800/50 p-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400" />
                                    <button onClick={() => handleUpdateComment(entry.id, comment.id)} className="rounded-lg bg-yellow-500 px-3 py-2 text-sm font-bold text-midnight-900">Save</button>
                                    <button onClick={() => setEditingComments(prev => {
                                      const next = { ...prev };
                                      delete next[comment.id];
                                      return next;
                                    })} className="rounded-lg bg-fantasy-700 px-3 py-2 text-sm font-semibold text-white">Cancel</button>
                                  </div>
                                ) : (
                                  <p className="mt-1 text-sm text-gray-200">{comment.body}</p>
                                )}
                                {(comment.authorId === currentUserId || canEdit) && (
                                  <div className="mt-2 flex items-center gap-3">
                                    {comment.authorId === currentUserId && (
                                      <button onClick={() => setEditingComments(prev => ({ ...prev, [comment.id]: comment.body }))} className="text-xs text-yellow-200 hover:text-yellow-100">Edit</button>
                                    )}
                                    <button onClick={() => handleDeleteComment(entry.id, comment.id)} className="text-xs text-red-200 hover:text-red-100">Delete</button>
                                  </div>
                                )}
                              </div>
                            ))}
                            <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                              <input value={commentDrafts[entry.id] || ''} onChange={event => setCommentDrafts(prev => ({ ...prev, [entry.id]: event.target.value }))} className="rounded-lg border border-fantasy-700/30 bg-fantasy-800/50 p-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400" placeholder="Add a comment" />
                              <button onClick={() => handleAddComment(entry.id)} className="rounded-lg bg-fantasy-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-fantasy-600">Comment</button>
                            </div>
                          </div>
                        </article>
                      ))}
                      {journalEntries.length === 0 && <p className="rounded-lg bg-fantasy-900/30 p-4 text-sm text-gray-400">No journal entries yet.</p>}
                    </div>
                  )}

                  {activeTab === 'relationships' && (
                    <div className="space-y-5">
                      {canEdit && (
                        <div className="rounded-lg bg-fantasy-900/30 p-4">
                          <div className="grid gap-3">
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                              <input
                                type="search"
                                value={selectedRelationshipTarget && !isRelationshipSearchFocused ? selectedRelationshipTarget.name : relationshipSearch}
                                onChange={event => {
                                  setRelationshipSearch(event.target.value);
                                  setRelationshipDraft(prev => ({ ...prev, targetCharacterId: '' }));
                                }}
                                onFocus={() => {
                                  setIsRelationshipSearchFocused(true);
                                  if (selectedRelationshipTarget) setRelationshipSearch(selectedRelationshipTarget.name);
                                }}
                                onBlur={() => window.setTimeout(() => setIsRelationshipSearchFocused(false), 150)}
                                className="w-full rounded-lg border border-fantasy-700/30 bg-fantasy-800/50 py-3 pl-10 pr-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                                placeholder="Search character name"
                              />
                              {isRelationshipSearchFocused && (
                                <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-64 overflow-y-auto rounded-lg border border-fantasy-700/30 bg-fantasy-900/95 shadow-xl">
                                  {relationshipSuggestions.length > 0 ? (
                                    relationshipSuggestions.map(item => (
                                      <button
                                        key={item._id}
                                        type="button"
                                        onMouseDown={event => event.preventDefault()}
                                        onClick={() => {
                                          setRelationshipDraft(prev => ({ ...prev, targetCharacterId: item._id || '' }));
                                          setRelationshipSearch(item.name);
                                          setIsRelationshipSearchFocused(false);
                                        }}
                                        className="w-full px-4 py-3 text-left transition-colors hover:bg-fantasy-800/50"
                                      >
                                        <span className="block font-semibold text-white">{item.name}</span>
                                        <span className="block text-xs text-gray-400">Level {item.level} {item.class}</span>
                                      </button>
                                    ))
                                  ) : (
                                    <div className="p-3 text-sm text-gray-400">No available characters found</div>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {(['family', 'rival', 'romantic', 'patron', 'owes_debt'] as CharacterRelationshipType[]).map(type => (
                                <label key={type} className="flex items-center gap-2 rounded-lg bg-fantasy-800/40 p-3 text-sm text-gray-200">
                                  <input type="checkbox" checked={relationshipDraft.relationshipTypes.includes(type)} onChange={() => handleToggleRelationshipType(type)} className="h-4 w-4 rounded border-fantasy-600 bg-fantasy-900 text-yellow-500 focus:ring-yellow-400" />
                                  <span>{formatRelationshipType(type)}</span>
                                </label>
                              ))}
                            </div>
                            <input value={relationshipDraft.subtype} onChange={event => setRelationshipDraft(prev => ({ ...prev, subtype: event.target.value }))} className="rounded-lg border border-fantasy-700/30 bg-fantasy-800/50 p-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400" placeholder="Optional subtype, e.g. sibling, mentor, former flame" />
                            <button onClick={handleAddRelationship} className="flex items-center justify-center space-x-2 rounded-lg bg-yellow-500 px-4 py-2 font-bold text-midnight-900 transition-colors hover:bg-yellow-400">
                              <Plus className="h-4 w-4" />
                              <span>Add</span>
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="rounded-lg border border-fantasy-700/30 bg-black/30 p-4">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center space-x-2 text-white">
                            <Users className="h-5 w-5 text-yellow-300" />
                            <span className="font-semibold">{graphRoot.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {graphDepth > 0 && (
                              <button onClick={() => setGraphStack(prev => prev.slice(0, -1))} className="flex items-center space-x-2 rounded-lg bg-fantasy-800/60 px-3 py-2 text-sm text-white">
                                <ArrowLeft className="h-4 w-4" />
                                <span>Back</span>
                              </button>
                            )}
                            <span className="rounded-lg bg-yellow-500/15 px-3 py-2 text-sm font-semibold text-yellow-200">Depth {graphDepth}</span>
                          </div>
                        </div>

                        <div className="space-y-2">
                          {graphRelationships.map(link => {
                            const target = characters.find(item => item._id === link.targetCharacterId);
                            return (
                              <div key={link.id} className="flex items-center justify-between gap-3 rounded-lg border border-fantasy-700/30 bg-fantasy-900/30 p-3">
                                <button disabled={!target} onClick={() => target && setGraphStack(prev => [...prev, target._id || ''])} className="min-w-0 flex-1 text-left">
                                  <p className="truncate font-semibold text-white">{target?.name || 'Unknown character'}</p>
                                  <p className="truncate text-sm text-yellow-200">{describeRelationship(link, relationships)}</p>
                                </button>
                                {canEdit && link.sourceCharacterId === character._id && <IconButton title="Delete relationship" onClick={() => handleDeleteRelationship(link.id)} icon={<Trash2 className="h-4 w-4" />} danger />}
                              </div>
                            );
                          })}
                          {graphRelationships.length === 0 && <p className="rounded-lg bg-fantasy-900/30 p-4 text-sm text-gray-400">No direct relationships for this character.</p>}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

function AbilityRadarChart({ scores }: { scores: ReturnType<typeof getAbilityScoresFromFoundryJson> | null }) {
  const size = 260;
  const center = size / 2;
  const radius = 82;

  const minScore = -1;
  const maxScore = 7;

  const values = abilityLabels.map(ability => scores?.[ability.key] ?? null);
  const hasScores = values.some(value => value !== null);

  const scoreToRatio = (value: number | null) => {
    if (value === null) return 0;

    return Math.max(
      0,
      Math.min(1, (value - minScore) / (maxScore - minScore))
    );
  };


  const gridLevels = [0.25, 0.5, 0.75, 1];

  const pointFor = (index: number, ratio: number) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / abilityLabels.length;
    return {
      x: center + Math.cos(angle) * radius * ratio,
      y: center + Math.sin(angle) * radius * ratio
    };
  };

  const polygonPoints = values
    .map((value, index) => {
      const point = pointFor(index, scoreToRatio(value));
      return `${point.x},${point.y}`;
    }).join(' ');

  return (
    <div className="rounded-lg border border-fantasy-700/30 bg-fantasy-900/30 p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold uppercase tracking-[0.12em] text-gray-400">Ability Matrix</h4>
        <span className="text-xs text-yellow-200">Active Foundry JSON</span>
      </div>
      {hasScores ? (
        <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto h-64 w-full max-w-[280px]" role="img" aria-label="Character ability radar chart">
          {gridLevels.map(level => (
            <polygon
              key={level}
              points={abilityLabels.map((_, index) => {
                const point = pointFor(index, level);
                return `${point.x},${point.y}`;
              }).join(' ')}
              fill="none"
              stroke="rgba(250, 204, 21, 0.18)"
              strokeWidth="1"
            />
          ))}
          {abilityLabels.map((ability, index) => {
            const axisEnd = pointFor(index, 1);
            const labelPoint = pointFor(index, 1.25);
            return (
              <g key={ability.key}>
                <line x1={center} y1={center} x2={axisEnd.x} y2={axisEnd.y} stroke="rgba(148, 163, 184, 0.28)" strokeWidth="1" />
                <text x={labelPoint.x} y={labelPoint.y} textAnchor="middle" dominantBaseline="middle" className="fill-gray-200 text-[11px] font-bold">
                  {ability.label}
                </text>
                <text x={labelPoint.x} y={labelPoint.y + 13} textAnchor="middle" dominantBaseline="middle" className="fill-yellow-200 text-[10px] font-semibold">
                  {scores?.[ability.key] ?? '-'}
                </text>
              </g>
            );
          })}
          <polygon points={polygonPoints} fill="rgba(250, 204, 21, 0.24)" stroke="rgb(250, 204, 21)" strokeWidth="2" />
          {values.map((value, index) => {
            const point = pointFor(index, scoreToRatio(value));
            return <circle key={abilityLabels[index].key} cx={point.x} cy={point.y} r="3.5" fill="rgb(253, 224, 71)" />;
          })}
        </svg>
      ) : (
        <p className="rounded-lg bg-midnight-900/60 p-4 text-sm text-gray-400">No STR, DEX, CON, INT, WIS, or CHA values were found in the active Foundry JSON.</p>
      )}
    </div>
  );
}

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
    <button onClick={onClick} className={`flex items-center justify-center space-x-2 px-3 py-4 text-sm font-semibold transition-colors ${active ? 'bg-fantasy-800/60 text-yellow-300' : 'text-gray-400 hover:bg-fantasy-900/40 hover:text-white'}`}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function IconButton({ title, icon, onClick, disabled, danger }: { title: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      aria-label={title}
      title={title}
      disabled={disabled}
      onClick={event => {
        event.stopPropagation();
        onClick();
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
    </button>
  );
}

function formatRelationshipType(type: CharacterRelationshipType) {
  return type
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function describeRelationship(relationship: CharacterRelationship, relationships: CharacterRelationship[]) {
  const labels = relationship.relationshipTypes.map(type => {
    const status = getRelationshipStatus(relationship, type, relationships);
    return `${formatRelationshipType(type)}${status === 'unofficial' ? ' (unofficial)' : ''}`;
  });
  return [labels.join(', '), relationship.subtype].filter(Boolean).join(' - ');
}

function getRelationshipStatus(relationship: CharacterRelationship, type: CharacterRelationshipType, relationships: CharacterRelationship[]) {
  if (relationship.isAutomatic || type === 'guildmate' || type === 'ally' || type === 'family') return 'official';

  const reciprocal = relationships.find(candidate =>
    candidate.sourceCharacterId === relationship.targetCharacterId &&
    candidate.targetCharacterId === relationship.sourceCharacterId
  );

  if (!reciprocal) return 'unofficial';
  if ((type === 'rival' || type === 'romantic') && reciprocal.relationshipTypes.includes(type)) return 'official';
  if (type === 'patron' && reciprocal.relationshipTypes.includes('owes_debt')) return 'official';
  if (type === 'owes_debt' && reciprocal.relationshipTypes.includes('patron')) return 'official';
  return 'unofficial';
}

function getCharacterDataFromJson(jsonData: unknown) {
  try {
    const data = jsonData as {
      img?: string;
      system?: {
        details?: {
          biography?: { appearance?: string };
          age?: { value?: number };
          height?: { value?: string };
          weight?: { value?: string };
        };
        attributes?: { wealth?: { value?: number } };
      };
    };
    const details = data.system?.details || {};
    const attributes = data.system?.attributes || {};

    return {
      age: details.age?.value || null,
      height: details.height?.value || '',
      weight: details.weight?.value || '',
      wealth: attributes.wealth?.value || 0,
      avatar: data.img || details.biography?.appearance || ''
    };
  } catch (error) {
    console.error('Error parsing character JSON:', error);
    return null;
  }
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
