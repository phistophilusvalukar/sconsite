import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Download,
  FileJson,
  Ghost,
  Heart,
  Loader2,
  MessageCircle,
  Network,
  Plus,
  RefreshCw,
  Search,
  Skull,
  Trash2,
  Upload,
  Users,
  X
} from 'lucide-react';
import { DATABASE_TABLES } from '../config/database';
import { useSupabaseRealtime } from '../hooks/useSupabaseRealtime';
import {
  Character,
  CharacterCompanion,
  CharacterJournalEntry,
  CharacterRelationship,
  FoundryJsonEntry
} from '../types/database';
import { CharacterService } from '../services/characterService';
import type { PublicCharacterProfileBundle } from '../services/characterService';
import { defaultCharacterProfileSectionVisibility } from '../features/characters/characterProfileCustomization';
import DynamicCharacterPortrait from '../features/characters/DynamicCharacterPortrait';
import {
  getRelationshipColor,
  getRelationshipSentimentLabel
} from '../features/characters/relationshipSentiment';
import SafeRichText from '../features/guilds/SafeRichText';
import { DEFAULT_NPC_PLACEHOLDER, abilityLabels, getAbilityScoresFromFoundryJson, normalizeFoundryAvatar } from '../utils/foundryCharacter';

type DetailsTab = 'backstory' | 'journal' | 'relationships' | 'foundry';

interface CharacterDetailsModalProps {
  character: Character;
  characters: Character[];
  currentUserId: string;
  canEdit: boolean;
  onClose?: () => void;
  onEdit?: (character: Character) => void;
  onRelationshipsChanged?: () => void | Promise<void>;
  pageMode?: boolean;
  readOnlyData?: Pick<PublicCharacterProfileBundle, 'journalEntries' | 'relationships' | 'relatedCharacterNames' | 'companions'>;
  companionData?: CharacterCompanion[];
  onChangeShape?: () => void;
  shapeVersion?: 1 | 2;
}

const defaultPortrait = DEFAULT_NPC_PLACEHOLDER;

const CharacterDetailsModal: React.FC<CharacterDetailsModalProps> = ({
  character,
  characters,
  currentUserId,
  canEdit,
  onClose,
  onEdit,
  onRelationshipsChanged,
  pageMode = false,
  readOnlyData,
  companionData,
  onChangeShape,
  shapeVersion = 1
}) => {
  const characterService = useMemo(() => CharacterService.getInstance(), []);
  const isReadOnly = Boolean(readOnlyData);
  const [activeTab, setActiveTab] = useState<DetailsTab>('backstory');
  const [foundryFiles, setFoundryFiles] = useState<FoundryJsonEntry[]>([]);
  const [companions, setCompanions] = useState<CharacterCompanion[]>([]);
  const [activeSubjectIndex, setActiveSubjectIndex] = useState(0);
  const [journalEntries, setJournalEntries] = useState<CharacterJournalEntry[]>([]);
  const [relationships, setRelationships] = useState<CharacterRelationship[]>([]);
  const [journalDraft, setJournalDraft] = useState({ title: '', body: '' });
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [editingComments, setEditingComments] = useState<Record<string, string>>({});
  const [relationshipDraft, setRelationshipDraft] = useState({
    targetCharacterId: '',
    name: '',
    tag: '',
    sentiment: 0
  });
  const [relationshipSearch, setRelationshipSearch] = useState('');
  const [relationshipMessage, setRelationshipMessage] = useState('');
  const [isRelationshipSearchFocused, setIsRelationshipSearchFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const activeFoundryEntry = foundryFiles.find(file => file.isActive) || foundryFiles[0];
  const activeFoundryJson = activeFoundryEntry?.json || character.foundryJson;
  const parsedData = activeFoundryJson ? getCharacterDataFromJson(activeFoundryJson) : null;
  const activeCompanion = activeSubjectIndex > 0 ? companions[activeSubjectIndex - 1] : null;
  const activeCompanionLabel = activeCompanion?.companionType === 'familiar'
    ? 'Familiar'
    : activeCompanion?.companionType === 'eidolon' ? 'Eidolon' : 'Animal companion';
  const activeCompanionIsFollower = activeCompanion?.creatureType?.trim().toLowerCase() === 'follower';
  const characterPortrait = activeCompanion?.imageUrl || character.profilePortraitImageUrl || parsedData?.avatar || normalizeFoundryAvatar(character.stats?.avatar) || defaultPortrait;
  const savedAbilityScores = character.stats?.abilityBoosts?.scores || null;
  const abilityScores = activeFoundryJson ? getAbilityScoresFromFoundryJson(activeFoundryJson) : savedAbilityScores;
  const sectionVisibility = character.profileSectionVisibility || defaultCharacterProfileSectionVisibility;
  const visibleTabs: DetailsTab[] = [
    ...(sectionVisibility.details ? ['backstory' as const] : []),
    ...(sectionVisibility.journal ? ['journal' as const] : []),
    ...(canEdit || sectionVisibility.relationships ? ['relationships' as const] : []),
    ...(canEdit ? ['foundry' as const] : [])
  ];
  const initialTab: DetailsTab = visibleTabs[0] || 'backstory';
  const directRelationships = relationships.filter(link => (
    link.sourceCharacterId === character._id || link.targetCharacterId === character._id
  ));
  const confirmedRelationships = directRelationships.filter(link => link.status === 'confirmed');
  const pendingRelationships = directRelationships.filter(link => link.status === 'pending');
  const otherCharacters = characters.filter(item => item._id && item._id !== character._id);
  const selectedRelationshipTarget = otherCharacters.find(item => item._id === relationshipDraft.targetCharacterId);
  const relationshipSuggestions = otherCharacters
    .filter(item => {
      const term = relationshipSearch.trim().toLowerCase();
      const alreadyLinked = relationships.some(link => (
        (link.sourceCharacterId === character._id && link.targetCharacterId === item._id)
        || (link.targetCharacterId === character._id && link.sourceCharacterId === item._id)
      ));
      if (alreadyLinked) return false;
      if (!term) return true;
      return [item.name, item.class, item.ancestry, item.race]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(term));
    })
    .slice(0, 8);

  useEffect(() => {
    setActiveTab(initialTab);
    setRelationshipSearch('');
    setRelationshipMessage('');
  }, [character._id, canEdit, initialTab, sectionVisibility.details, sectionVisibility.journal, sectionVisibility.relationships]);

  useEffect(() => {
    setActiveSubjectIndex(current => Math.min(current, companions.length));
  }, [companions.length]);

  const loadModalData = useCallback(async (showLoading = false) => {
    if (!character._id) return;

    if (showLoading) setIsLoading(true);
    if (readOnlyData) {
      setJournalEntries(readOnlyData.journalEntries);
      setRelationships(readOnlyData.relationships);
      setFoundryFiles([]);
      setCompanions(readOnlyData.companions || []);
      setIsLoading(false);
      return;
    }
    try {
      const [journalResponse, relationshipResponse, foundryResponse, companionResponse] = await Promise.all([
        characterService.getJournalEntries(character._id, currentUserId),
        characterService.getRelationshipsForCharacters([character._id], canEdit),
        canEdit ? characterService.getFoundryFiles(character._id) : Promise.resolve({ success: true, data: [] as FoundryJsonEntry[] }),
        companionData
          ? Promise.resolve({ success: true, data: companionData })
          : characterService.getCompanionFiles(character._id)
      ]);

      if (journalResponse.success && journalResponse.data) setJournalEntries(journalResponse.data);
      if (relationshipResponse.success && relationshipResponse.data) setRelationships(relationshipResponse.data);
      if (foundryResponse.success && foundryResponse.data) setFoundryFiles(foundryResponse.data);
      if (companionResponse.success && companionResponse.data) setCompanions(companionResponse.data);
    } finally {
      setIsLoading(false);
    }
  }, [canEdit, character._id, characterService, companionData, currentUserId, readOnlyData]);

  useEffect(() => {
    void loadModalData(true);
  }, [loadModalData]);

  useSupabaseRealtime({
    channelName: `character-details-${character._id || 'unknown'}`,
    tables: [
      DATABASE_TABLES.CHARACTER_FOUNDRY_FILES,
      DATABASE_TABLES.CHARACTER_JOURNAL_ENTRIES,
      DATABASE_TABLES.CHARACTER_JOURNAL_COMMENTS,
      DATABASE_TABLES.CHARACTER_JOURNAL_LIKES,
      DATABASE_TABLES.CHARACTER_RELATIONSHIPS
    ],
    onChange: loadModalData,
    enabled: Boolean(character._id) && !isReadOnly,
    debounceMs: 1500
  });

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

  const handleDownloadCompanion = (companion: CharacterCompanion) => {
    if (!companion.json) return;
    const dataBlob = new Blob([JSON.stringify(companion.json, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = companion.fileName || `${companion.name}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDeleteCompanion = async (companionId: string) => {
    const response = await characterService.deleteFoundryFile(companionId);
    if (response.success) setCompanions(current => current.filter(companion => companion.id !== companionId));
    else alert(response.error || 'Failed to delete companion file');
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

  const handleAddRelationship = async () => {
    if (!character._id || !relationshipDraft.targetCharacterId || !relationshipDraft.name.trim()) return;
    if (relationships.some(link => (
      (link.sourceCharacterId === character._id && link.targetCharacterId === relationshipDraft.targetCharacterId)
      || (link.targetCharacterId === character._id && link.sourceCharacterId === relationshipDraft.targetCharacterId)
    ))) return;

    const response = await characterService.createRelationship(
      character._id,
      relationshipDraft.targetCharacterId,
      relationshipDraft.name.trim(),
      relationshipDraft.tag.trim(),
      relationshipDraft.sentiment
    );
    if (response.success && response.data) {
      setRelationships(prev => [...prev, response.data as CharacterRelationship]);
      void onRelationshipsChanged?.();
      setRelationshipDraft({ targetCharacterId: '', name: '', tag: '', sentiment: 0 });
      setRelationshipSearch('');
      setRelationshipMessage('Request sent. It will remain private until the other character approves it.');
    } else {
      alert(response.error || 'Failed to add relationship');
    }
  };

  const handleDeleteRelationship = async (relationshipId: string) => {
    if (!character._id) return;
    const response = await characterService.deleteRelationship(relationshipId, character._id);
    if (response.success) {
      setRelationships(prev => prev.filter(link => link.id !== relationshipId));
      void onRelationshipsChanged?.();
    } else {
      alert(response.error || 'Failed to delete relationship');
    }
  };

  const handleRelationshipResponse = async (relationshipId: string, approve: boolean) => {
    if (!character._id) return;
    const response = await characterService.respondToRelationship(relationshipId, character._id, approve);
    if (response.success) {
      await loadModalData();
      void onRelationshipsChanged?.();
      setRelationshipMessage(approve ? 'Relationship approved.' : 'Relationship request declined.');
    } else {
      alert(response.error || 'Failed to respond to relationship');
    }
  };

  const hasPortraitColumn = sectionVisibility.portrait || sectionVisibility.abilityMatrix;

  return (
    <div className={pageMode ? 'character-profile-view' : 'fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4'}>
      <div
        className={pageMode
          ? 'character-profile-document'
          : 'flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-fantasy-700/40 bg-midnight-950 shadow-2xl'}
        data-layout={character.profileLayoutStyle || 'chronicle'}
      >
        <div
          className={pageMode ? `character-profile-heading${character.profileBannerImageUrl ? ' has-banner-image' : ''}` : 'flex items-center justify-between border-b border-fantasy-700/30 px-6 py-4'}
          style={pageMode && character.profileBannerImageUrl ? {
            backgroundImage: `linear-gradient(90deg, color-mix(in srgb, var(--character-base) 96%, transparent), color-mix(in srgb, var(--character-base) 48%, transparent), color-mix(in srgb, var(--character-base) 82%, transparent)), url(${JSON.stringify(character.profileBannerImageUrl)})`
          } : undefined}
        >
          <div>
            <p className={pageMode ? 'character-profile-kicker' : 'text-sm uppercase tracking-[0.14em] text-yellow-300'}>{'Character Profile'}</p>
            <h2 className={pageMode ? '' : 'font-fantasy text-2xl font-bold text-white'}>{character.name}{character.status === 'dead' && <Skull className="character-profile-skull" aria-label="Deceased" />}</h2>
            {pageMode && <p className="character-profile-subtitle">{character.profileSubtitle || 'An adventurer of the Shattered Convergence'}</p>}
          </div>
          <div className="flex items-center space-x-2">
            {canEdit && onEdit && (
              <button onClick={() => onEdit(character)} className="rounded-lg bg-fantasy-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-fantasy-600">
                Edit character
              </button>
            )}
            {!pageMode && onClose && <button onClick={onClose} className="p-2 text-gray-400 transition-colors hover:text-white" title="Close"><X className="h-6 w-6" /></button>}
          </div>
        </div>

        <div className={pageMode ? `character-profile-content${visibleTabs.length === 0 ? ' has-no-records' : ''}` : 'grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-2'}>
          <section className={pageMode ? 'character-profile-core' : 'border-b border-fantasy-700/30 lg:border-b-0 lg:border-r'}>
            <div className={pageMode ? `character-profile-identity${hasPortraitColumn ? '' : ' has-no-portrait'}` : 'grid gap-6 p-6 md:grid-cols-[minmax(220px,0.85fr)_1fr] lg:grid-cols-1 xl:grid-cols-[minmax(260px,0.85fr)_1fr]'}>
              {hasPortraitColumn && <div className={pageMode ? 'character-profile-portrait-column' : 'space-y-4'}>
                {sectionVisibility.portrait && (activeCompanion
                  ? <img src={characterPortrait} alt={`${activeCompanion.name} portrait`} className={pageMode ? 'character-profile-portrait' : 'h-[420px] w-full rounded-lg object-cover'} />
                  : <DynamicCharacterPortrait character={character} fallbackSrc={characterPortrait} alt={character.name} className={pageMode ? 'character-profile-portrait' : 'h-[420px] w-full rounded-lg object-cover'} motion={pageMode ? 'parallax' : 'hover'} allowDynamic={pageMode} />)}
                {pageMode && sectionVisibility.portrait && (onChangeShape || companions.length > 0) && <div className="character-profile-portrait-actions">
                  {onChangeShape && <button type="button" className="character-profile-shape-button" onClick={onChangeShape} aria-label={`Change Shape — currently Version ${shapeVersion}`} data-tooltip="Change Shape"><RefreshCw size={16} /></button>}
                  {companions.length > 0 && <button type="button" className="character-profile-shape-button character-profile-companion-button" onClick={() => setActiveSubjectIndex(current => (current + 1) % (companions.length + 1))} aria-label={activeSubjectIndex === companions.length ? `Return to ${character.name}` : `Show ${companions[activeSubjectIndex]?.name || character.name}`} data-tooltip={activeSubjectIndex === companions.length ? character.name : companions[activeSubjectIndex]?.name || character.name}><Ghost size={17} /></button>}
                </div>}
                {sectionVisibility.abilityMatrix && !activeCompanion && <AbilityRadarChart scores={abilityScores} pageMode={pageMode} />}
              </div>}
              <div className="space-y-5">
                <div className={pageMode ? 'character-profile-rankline' : 'flex flex-wrap items-baseline gap-3'}>
                  <span>{activeCompanion ? activeCompanionLabel : `Level ${character.level}`}</span>
                  <strong>{activeCompanion?.name || character.class}</strong>
                </div>
                {activeCompanion && sectionVisibility.details && <div className={pageMode ? 'character-profile-facts' : 'grid grid-cols-2 gap-3 text-sm'}>
                  <Detail label="Companion" value={activeCompanionIsFollower ? activeCompanion.heritage || 'Unknown' : activeCompanionLabel} />
                  <Detail label="Creature" value={activeCompanionIsFollower ? activeCompanion.className || 'Unknown' : activeCompanion.creatureType || 'Unknown'} />
                  <Detail label="Level" value={character.level} />
                  <Detail label="Hit points" value={activeCompanion.hpMax ? `${activeCompanion.hpValue ?? 0} / ${activeCompanion.hpMax}` : activeCompanion.hpValue ?? '—'} />
                </div>}
                {!activeCompanion && sectionVisibility.backstory && (
                  character.backstory
                    ? <SafeRichText className="character-profile-backstory character-profile-main-backstory rounded-lg bg-fantasy-900/30 p-5 text-sm leading-relaxed text-gray-100" html={character.backstory} />
                    : <p className="character-profile-main-backstory-empty rounded-lg bg-fantasy-900/30 p-4 text-sm text-gray-400">No backstory has been added yet.</p>
                )}
                {activeCompanion && <div className="character-profile-companion-features">
                  <h4>{activeCompanion.companionType === 'familiar' ? 'Familiar abilities' : activeCompanion.companionType === 'eidolon' ? 'Eidolon feats' : 'Companion features'}</h4>
                  {activeCompanion.features.length > 0
                    ? <ul>{activeCompanion.features.map(feature => <li key={feature}>{feature}</li>)}</ul>
                    : <p>No features found in this Foundry export.</p>}
                </div>}
                {sectionVisibility.notes && character.notes && (
                  <div>
                    <h4 className="mb-2 text-sm font-semibold uppercase tracking-[0.12em] text-gray-400">Notes</h4>
                    <p className="rounded-lg bg-fantasy-900/30 p-4 text-sm leading-relaxed text-gray-100">{character.notes}</p>
                  </div>
                )}
              </div>
            </div>
          </section>

          {visibleTabs.length > 0 && <section className={pageMode ? 'character-profile-records' : 'flex min-h-[620px] flex-col'}>
            <div className={`grid border-b border-fantasy-700/30 ${visibleTabs.length === 4 ? 'grid-cols-4' : visibleTabs.length === 3 ? 'grid-cols-3' : visibleTabs.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {sectionVisibility.details && <TabButton active={activeTab === 'backstory'} label="Character Info" icon={<BookOpen className="h-4 w-4" />} onClick={() => setActiveTab('backstory')} />}
              {sectionVisibility.journal && <TabButton active={activeTab === 'journal'} label="Journal" icon={<MessageCircle className="h-4 w-4" />} onClick={() => setActiveTab('journal')} />}
              {(canEdit || sectionVisibility.relationships) && <TabButton active={activeTab === 'relationships'} label="Relations" icon={<Network className="h-4 w-4" />} onClick={() => setActiveTab('relationships')} />}
              {canEdit && <TabButton active={activeTab === 'foundry'} label="Foundry" icon={<FileJson className="h-4 w-4" />} onClick={() => setActiveTab('foundry')} />}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              {isLoading ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-yellow-300" />
                </div>
              ) : (
                <>
                  {activeTab === 'backstory' && sectionVisibility.details && <div className="character-profile-facts">
                    <Detail label="Ancestry" value={character.ancestry || character.race} />
                    <Detail label="Heritage" value={character.heritage || 'Unknown'} />
                    <Detail label="Background" value={character.background || 'Unrecorded'} />
                    <Detail label="Status" value={character.status.charAt(0).toUpperCase() + character.status.slice(1)} />
                    <Detail label="Age" value={parsedData?.age || character.stats?.age || 'Unknown'} />
                    <Detail label="Height" value={parsedData?.height || character.stats?.height || 'Unknown'} />
                    <Detail label="Weight" value={parsedData?.weight || character.stats?.weight || 'Unknown'} />
                    <Detail label="Deity" value={parsedData?.deity || 'Unknown'} />
                  </div>}

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
                      <div className="border-t border-fantasy-700/30 pt-5">
                        <h3 className="mb-3 font-fantasy text-lg font-semibold text-white">Familiars, animal companions, and Eidolons</h3>
                        <div className="space-y-2">
                          {companions.map(companion => <div key={companion.id} className="flex items-center gap-3 rounded-lg border border-fantasy-700/40 bg-fantasy-900/30 p-3">
                            {companion.imageUrl && <img src={companion.imageUrl} alt="" className="h-10 w-10 rounded-full object-cover" />}
                            <div className="min-w-0 flex-1"><strong className="block truncate text-white">{companion.name}</strong><span className="text-xs text-gray-400">{companion.companionType === 'familiar' ? 'Familiar' : companion.companionType === 'eidolon' ? 'Eidolon' : 'Animal companion'} · {companion.fileName}</span></div>
                            <IconButton title="Download" onClick={() => handleDownloadCompanion(companion)} icon={<Download className="h-4 w-4" />} />
                            <IconButton title="Delete" onClick={() => void handleDeleteCompanion(companion.id)} icon={<Trash2 className="h-4 w-4" />} danger />
                          </div>)}
                          {companions.length === 0 && <p className="rounded-lg bg-fantasy-900/30 p-4 text-sm text-gray-400">No familiar, animal companion, or Eidolon JSON files saved yet. Add them from Edit character.</p>}
                        </div>
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
                            <button disabled={isReadOnly} onClick={() => { if (!isReadOnly) void handleToggleLike(entry); }} className={`flex items-center space-x-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-default ${entry.likedByCurrentUser ? 'bg-red-500/20 text-red-200' : 'bg-fantasy-800/50 text-gray-300 hover:text-white'}`}>
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
                                <p className="text-xs text-gray-500">{Boolean(currentUserId) && comment.authorId === currentUserId ? 'You' : 'Player'} - {new Date(comment.createdAt).toLocaleString()}</p>
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
                                {((Boolean(currentUserId) && comment.authorId === currentUserId) || canEdit) && (
                                  <div className="mt-2 flex items-center gap-3">
                                    {Boolean(currentUserId) && comment.authorId === currentUserId && (
                                      <button onClick={() => setEditingComments(prev => ({ ...prev, [comment.id]: comment.body }))} className="text-xs text-yellow-200 hover:text-yellow-100">Edit</button>
                                    )}
                                    <button onClick={() => handleDeleteComment(entry.id, comment.id)} className="text-xs text-red-200 hover:text-red-100">Delete</button>
                                  </div>
                                )}
                              </div>
                            ))}
                            {!isReadOnly && <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                              <input value={commentDrafts[entry.id] || ''} onChange={event => setCommentDrafts(prev => ({ ...prev, [entry.id]: event.target.value }))} className="rounded-lg border border-fantasy-700/30 bg-fantasy-800/50 p-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400" placeholder="Add a comment" />
                              <button onClick={() => handleAddComment(entry.id)} className="rounded-lg bg-fantasy-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-fantasy-600">Comment</button>
                            </div>}
                          </div>
                        </article>
                      ))}
                      {journalEntries.length === 0 && <p className="rounded-lg bg-fantasy-900/30 p-4 text-sm text-gray-400">No journal entries yet.</p>}
                    </div>
                  )}

                  {activeTab === 'relationships' && (
                    <div className="space-y-5">
                      {canEdit && (
                        <div className="rounded-xl border border-white/10 bg-fantasy-900/30 p-4 sm:p-5">
                          <div className="mb-4">
                            <h3 className="font-fantasy text-lg font-semibold text-white">Define a relationship</h3>
                            <p className="mt-1 text-sm text-gray-400">The connection stays private until the other character approves it.</p>
                          </div>
                          <div className="grid gap-4">
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

                            <div className="grid gap-3 sm:grid-cols-2">
                              <label className="grid gap-1.5 text-sm font-semibold text-gray-200">
                                Relationship name
                                <input
                                  value={relationshipDraft.name}
                                  maxLength={80}
                                  onChange={event => setRelationshipDraft(prev => ({ ...prev, name: event.target.value }))}
                                  className="rounded-lg border border-fantasy-700/30 bg-fantasy-800/50 p-3 font-normal text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                                  placeholder="Trusted confidants"
                                />
                              </label>
                              <label className="grid gap-1.5 text-sm font-semibold text-gray-200">
                                Optional tag
                                <input
                                  value={relationshipDraft.tag}
                                  maxLength={40}
                                  onChange={event => setRelationshipDraft(prev => ({ ...prev, tag: event.target.value }))}
                                  className="rounded-lg border border-fantasy-700/30 bg-fantasy-800/50 p-3 font-normal text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                                  placeholder="family, lover, mentor…"
                                />
                              </label>
                            </div>

                            <label className="grid gap-3 text-sm font-semibold text-gray-200">
                              <span className="flex items-center justify-between gap-3">
                                Sentiment
                                <span
                                  className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs"
                                  style={{ color: getRelationshipColor(relationshipDraft.sentiment) }}
                                >
                                  {getRelationshipSentimentLabel(relationshipDraft.sentiment)} · {relationshipDraft.sentiment}
                                </span>
                              </span>
                              <input
                                type="range"
                                min="-100"
                                max="100"
                                step="1"
                                value={relationshipDraft.sentiment}
                                onChange={event => setRelationshipDraft(prev => ({ ...prev, sentiment: Number(event.target.value) }))}
                                className="relationship-sentiment-slider"
                                aria-label="Relationship sentiment from negative to positive"
                              />
                              <span className="flex justify-between text-xs font-normal uppercase tracking-[0.14em] text-gray-400">
                                <span>Negative</span>
                                <span>Neutral</span>
                                <span>Positive</span>
                              </span>
                            </label>

                            <button
                              type="button"
                              disabled={!relationshipDraft.targetCharacterId || !relationshipDraft.name.trim()}
                              onClick={handleAddRelationship}
                              className="flex items-center justify-center space-x-2 rounded-lg bg-yellow-500 px-4 py-2 font-bold text-midnight-900 transition-colors hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <Plus className="h-4 w-4" />
                              <span>Send approval request</span>
                            </button>
                            {relationshipMessage && <p className="text-sm text-gray-300" role="status">{relationshipMessage}</p>}
                          </div>
                        </div>
                      )}

                      {canEdit && pendingRelationships.length > 0 && (
                        <div className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-4">
                          <div className="mb-3 flex items-center gap-2 text-white">
                            <MessageCircle className="h-5 w-5 text-amber-200" />
                            <h3 className="font-semibold">Pending approval</h3>
                          </div>
                          <div className="space-y-2">
                            {pendingRelationships.map(link => {
                              const relatedCharacterId = link.sourceCharacterId === character._id
                                ? link.targetCharacterId
                                : link.sourceCharacterId;
                              const relatedCharacter = characters.find(item => item._id === relatedCharacterId);
                              const characterApproved = link.sourceCharacterId === character._id
                                ? link.sourceApproved
                                : link.targetApproved;
                              return (
                                <div key={link.id} className="flex flex-col gap-3 rounded-lg border border-white/10 bg-black/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                                  <div className="min-w-0">
                                    <p className="font-semibold text-white">{relatedCharacter?.name || 'Unknown character'}</p>
                                    <p className="text-sm" style={{ color: getRelationshipColor(link.sentiment) }}>
                                      {link.name}{link.tag ? ` · ${link.tag}` : ''}
                                    </p>
                                    <p className="mt-1 text-xs text-gray-400">
                                      {characterApproved ? 'Waiting for the other character.' : 'This character needs your approval.'}
                                    </p>
                                  </div>
                                  {characterApproved ? (
                                    <button type="button" onClick={() => handleDeleteRelationship(link.id)} className="rounded-lg border border-red-300/20 px-3 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/10">
                                      Cancel request
                                    </button>
                                  ) : (
                                    <div className="flex gap-2">
                                      <button type="button" onClick={() => handleRelationshipResponse(link.id, false)} className="rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-gray-200 hover:bg-white/5">Decline</button>
                                      <button type="button" onClick={() => handleRelationshipResponse(link.id, true)} className="rounded-lg bg-emerald-300 px-3 py-2 text-sm font-bold text-emerald-950 hover:bg-emerald-200">Approve</button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="rounded-lg border border-fantasy-700/30 bg-black/30 p-4">
                        <div className="mb-4 flex items-center space-x-2 text-white">
                          <Users className="h-5 w-5 text-yellow-300" />
                          <span className="font-semibold">Direct relationships</span>
                        </div>
                        <div className="space-y-2">
                          {confirmedRelationships.map(link => {
                            const relatedCharacterId = link.sourceCharacterId === character._id
                              ? link.targetCharacterId
                              : link.sourceCharacterId;
                            const relatedCharacter = characters.find(item => item._id === relatedCharacterId);
                            return (
                              <div key={link.id} className="flex items-center justify-between gap-3 rounded-lg border border-fantasy-700/30 bg-fantasy-900/30 p-3">
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-semibold text-white">{relatedCharacter?.name || readOnlyData?.relatedCharacterNames[relatedCharacterId] || 'Unknown character'}</p>
                                  <p className="truncate text-sm" style={{ color: getRelationshipColor(link.sentiment) }}>
                                    {link.name}{link.tag ? ` · ${link.tag}` : ''}
                                  </p>
                                </div>
                                {canEdit && <IconButton title="Delete relationship" onClick={() => handleDeleteRelationship(link.id)} icon={<Trash2 className="h-4 w-4" />} danger />}
                              </div>
                            );
                          })}
                          {confirmedRelationships.length === 0 && <p className="rounded-lg bg-fantasy-900/30 p-4 text-sm text-gray-400">No confirmed direct relationships for this character.</p>}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>}
        </div>
      </div>
    </div>
  );
};

function AbilityRadarChart({ scores, pageMode = false }: { scores: ReturnType<typeof getAbilityScoresFromFoundryJson> | null; pageMode?: boolean }) {
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
    <div className={pageMode ? 'character-profile-ability' : 'rounded-lg border border-fantasy-700/30 bg-fantasy-900/30 p-4'}>
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
              stroke={pageMode ? 'var(--character-accent)' : 'rgb(250, 204, 21)'}
              strokeOpacity="0.22"
              strokeWidth="1"
            />
          ))}
          {abilityLabels.map((ability, index) => {
            const axisEnd = pointFor(index, 1);
            const labelPoint = pointFor(index, 1.25);
            return (
              <g key={ability.key}>
                <line x1={center} y1={center} x2={axisEnd.x} y2={axisEnd.y} stroke={pageMode ? 'var(--character-accent)' : 'rgb(148, 163, 184)'} strokeOpacity="0.28" strokeWidth="1" />
                <text x={labelPoint.x} y={labelPoint.y} textAnchor="middle" dominantBaseline="middle" fill={pageMode ? 'var(--character-ink)' : 'rgb(229, 231, 235)'} style={pageMode ? { fontFamily: 'var(--character-accent-font)', fontSize: 'var(--character-accent-size)' } : undefined} className="text-[11px] font-bold">
                  {ability.label}
                </text>
                <text x={labelPoint.x} y={labelPoint.y + 13} textAnchor="middle" dominantBaseline="middle" fill={pageMode ? 'var(--character-ink)' : 'rgb(254, 240, 138)'} style={pageMode ? { fontFamily: 'var(--character-accent-font)', fontSize: 'calc(var(--character-accent-size) * .9)' } : undefined} className="text-[10px] font-semibold">
                  {scores?.[ability.key] ?? '-'}
                </text>
              </g>
            );
          })}
          <polygon points={polygonPoints} fill={pageMode ? 'var(--character-accent)' : 'rgb(250, 204, 21)'} fillOpacity="0.24" stroke={pageMode ? 'var(--character-accent)' : 'rgb(250, 204, 21)'} strokeWidth="2" />
          {values.map((value, index) => {
            const point = pointFor(index, scoreToRatio(value));
            return <circle key={abilityLabels[index].key} cx={point.x} cy={point.y} r="3.5" fill={pageMode ? 'var(--character-accent)' : 'rgb(253, 224, 71)'} />;
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

function getCharacterDataFromJson(jsonData: unknown) {
  try {
    const data = jsonData as {
      img?: string;
      items?: Array<{ name?: string; type?: string }>;
      system?: {
        details?: {
          biography?: { appearance?: string };
          age?: { value?: number };
          height?: { value?: string };
          weight?: { value?: string };
        };
      };
    };
    const details = data.system?.details || {};
    const deity = data.items?.find(item => item.type === 'deity')?.name || '';

    return {
      age: details.age?.value || null,
      height: details.height?.value || '',
      weight: details.weight?.value || '',
      deity,
      avatar: normalizeFoundryAvatar(data.img || details.biography?.appearance)
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
