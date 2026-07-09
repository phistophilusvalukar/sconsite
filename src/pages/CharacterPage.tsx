import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Loader2, Network, Plus, Shield, Users } from 'lucide-react';
import { DATABASE_TABLES } from '../config/database';
import { Character, CharacterRelationship, CharacterRoleCategory } from '../types/database';
import { CharacterService } from '../services/characterService';
import { useSupabaseRealtime } from '../hooks/useSupabaseRealtime';
import CharacterCard from '../components/CharacterCard';
import CharacterDetailsModal from '../components/CharacterDetailsModal';
import CharacterForm from '../components/CharacterForm';
import CharacterRelationshipGraph from '../components/CharacterRelationshipGraph';
import CharacterRoleBadges from '../components/CharacterRoleBadges';
import { getRoleCategoryForBadge } from '../utils/characterRoles';
import { DEFAULT_NPC_PLACEHOLDER, getAvatarFromFoundryJson, normalizeFoundryAvatar } from '../utils/foundryCharacter';

type CharacterView = 'characters' | 'all' | 'relationships';

const CharacterPage: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [publicCharacters, setPublicCharacters] = useState<Character[]>([]);
  const [publicRelationships, setPublicRelationships] = useState<CharacterRelationship[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [selectedCanEdit, setSelectedCanEdit] = useState(false);
  const [activeView, setActiveView] = useState<CharacterView>('characters');
  const [showForm, setShowForm] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<Character | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);

  const characterService = useMemo(() => CharacterService.getInstance(), []);

  const loadCharacters = useCallback(async () => {
    if (!user?.id) return;

    setIsLoading(true);
    try {
      const response = await characterService.getUserCharacters(user.id);
      if (response.success && response.data) {
        setCharacters(response.data);
      } else {
        console.error('Failed to load characters:', response.error);
      }

      const publicResponse = await characterService.getPublicCharacters();
      if (publicResponse.success && publicResponse.data) {
        setPublicCharacters(publicResponse.data);
        const publicCharacterIds = publicResponse.data.map(character => character._id).filter(Boolean) as string[];
        const relationshipResponse = await characterService.getRelationshipsForCharacters(publicCharacterIds);
        if (relationshipResponse.success && relationshipResponse.data) {
          setPublicRelationships(relationshipResponse.data);
        } else {
          console.error('Failed to load public relationships:', relationshipResponse.error);
        }
      } else {
        console.error('Failed to load public characters:', publicResponse.error);
      }
    } catch (error) {
      console.error('Error loading characters:', error);
    } finally {
      setIsLoading(false);
    }
  }, [characterService, user?.id]);

  useEffect(() => {
    if (user?.id) {
      loadCharacters();
    }
  }, [loadCharacters, user?.id]);

  useSupabaseRealtime({
    channelName: `characters-page-${user?.id || 'anonymous'}`,
    tables: [
      DATABASE_TABLES.CHARACTERS,
      DATABASE_TABLES.CHARACTER_FOUNDRY_FILES,
      DATABASE_TABLES.CHARACTER_JOURNAL_ENTRIES,
      DATABASE_TABLES.CHARACTER_JOURNAL_COMMENTS,
      DATABASE_TABLES.CHARACTER_JOURNAL_LIKES,
      DATABASE_TABLES.CHARACTER_RELATIONSHIPS,
      DATABASE_TABLES.GUILD_MEMBERSHIPS
    ],
    onChange: loadCharacters,
    enabled: Boolean(user?.id),
    debounceMs: 1500
  });

  useEffect(() => {
    if (!selectedCharacter?._id) return;

    const refreshedCharacter = mergeCharacters(characters, publicCharacters)
      .find(character => character._id === selectedCharacter._id);
    if (refreshedCharacter) {
      setSelectedCharacter(refreshedCharacter);
    } else {
      setSelectedCharacter(null);
    }
  }, [characters, publicCharacters, selectedCharacter?._id]);

  const handleCreateCharacter = () => {
    setEditingCharacter(undefined);
    setShowForm(true);
  };

  const handleEditCharacter = (character: Character) => {
    setEditingCharacter(character);
    setShowForm(true);
  };

  const handleDeleteCharacter = async (characterId: string) => {
    if (!user?.id) return;

    if (confirm('Are you sure you want to delete this character? This action cannot be undone.')) {
      try {
        const response = await characterService.deleteCharacter(characterId, user.id);
        if (response.success) {
          await loadCharacters();
          if (selectedCharacter?._id === characterId) {
            setSelectedCharacter(null);
          }
        } else {
          alert(response.error || 'Failed to delete character');
        }
      } catch (error) {
        console.error('Error deleting character:', error);
        alert('Failed to delete character');
      }
    }
  };

  const handleSaveCharacter = async (character: Character) => {
    setShowForm(false);
    setEditingCharacter(undefined);
    await loadCharacters();
    setSelectedCanEdit(true);
    setSelectedCharacter(character);
  };

  const handleSelectOwnCharacter = (character: Character) => {
    setSelectedCanEdit(true);
    setSelectedCharacter(character);
  };

  const handleSelectPublicCharacter = (character: Character) => {
    setSelectedCanEdit(false);
    setSelectedCharacter(character);
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setEditingCharacter(undefined);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <Shield className="w-16 h-16 text-yellow-400 mx-auto mb-6" />
          <h1 className="font-fantasy text-4xl font-bold text-white mb-6">
            Character Management
          </h1>
          <p className="text-xl text-gray-300 mb-8">
            Please log in with Google to access your characters.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
          <div>
            <h1 className="font-fantasy text-4xl font-bold text-white mb-2">
              Characters
            </h1>
            <p className="text-gray-300">
              Manage your Pathfinder 2e characters and FoundryVTT files
            </p>
          </div>
          <button 
            onClick={handleCreateCharacter}
            className="mt-4 sm:mt-0 flex items-center space-x-2 px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-midnight-900 font-bold rounded-lg transition-all transform hover:scale-105"
          >
            <Plus className="w-5 h-5" />
            <span>Create Character</span>
          </button>
        </div>

        <div className="mb-8 grid grid-cols-3 rounded-xl border border-fantasy-700/30 bg-fantasy-900/20 p-1 sm:flex sm:w-fit">
          <button
            onClick={() => setActiveView('characters')}
            className={`flex items-center justify-center space-x-2 rounded-lg px-5 py-3 text-sm font-semibold transition-colors ${
              activeView === 'characters'
                ? 'bg-yellow-500 text-midnight-900'
                : 'text-gray-300 hover:bg-fantasy-800/40 hover:text-white'
            }`}
          >
            <Shield className="h-4 w-4" />
            <span>My Characters</span>
          </button>
          <button
            onClick={() => setActiveView('all')}
            className={`flex items-center justify-center space-x-2 rounded-lg px-5 py-3 text-sm font-semibold transition-colors ${
              activeView === 'all'
                ? 'bg-yellow-500 text-midnight-900'
                : 'text-gray-300 hover:bg-fantasy-800/40 hover:text-white'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>All Characters</span>
          </button>
          <button
            onClick={() => setActiveView('relationships')}
            className={`flex items-center justify-center space-x-2 rounded-lg px-5 py-3 text-sm font-semibold transition-colors ${
              activeView === 'relationships'
                ? 'bg-yellow-500 text-midnight-900'
                : 'text-gray-300 hover:bg-fantasy-800/40 hover:text-white'
            }`}
          >
            <Network className="h-4 w-4" />
            <span>Relationships</span>
          </button>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 text-yellow-400 mx-auto mb-4 animate-spin" />
            <p className="text-gray-300">Loading characters...</p>
          </div>
        )}

        {/* Character Grid */}
        {!isLoading && activeView === 'characters' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {characters.map((character) => (
              <CharacterCard
                key={character._id}
                character={character}
                onEdit={handleEditCharacter}
                onDelete={handleDeleteCharacter}
                onSelect={handleSelectOwnCharacter}
                isSelected={selectedCharacter?._id === character._id}
              />
            ))}

            {/* Add New Character Card */}
            <div 
              onClick={handleCreateCharacter}
              className="bg-fantasy-900/20 border-2 border-dashed border-fantasy-700/50 rounded-xl p-6 flex flex-col items-center justify-center min-h-[300px] hover:border-yellow-400/50 transition-colors cursor-pointer"
            >
              <Plus className="w-12 h-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-400 mb-2">Create New Character</h3>
              <p className="text-gray-500 text-center text-sm">
                Start your adventure with a new hero
              </p>
            </div>
          </div>
        )}

        {!isLoading && activeView === 'all' && (
          <AllCharactersView characters={publicCharacters} currentUserId={user?.id || ''} onSelectCharacter={handleSelectPublicCharacter} />
        )}

        {!isLoading && activeView === 'relationships' && (
          <CharacterRelationshipGraph
            characters={publicCharacters}
            relationships={publicRelationships}
            onSelectCharacter={handleSelectPublicCharacter}
          />
        )}

        {/* Empty State */}
        {!isLoading && activeView === 'characters' && characters.length === 0 && (
          <div className="text-center py-16">
            <Shield className="w-16 h-16 text-gray-400 mx-auto mb-6" />
            <h2 className="text-2xl font-bold text-white mb-4">No Characters Yet</h2>
            <p className="text-gray-300 mb-8 max-w-md mx-auto">
              Create your first character to begin your adventure in the Pathfinder 2e Westmarch world.
            </p>
            <button 
              onClick={handleCreateCharacter}
              className="px-8 py-3 bg-yellow-500 hover:bg-yellow-400 text-midnight-900 font-bold rounded-lg transition-all transform hover:scale-105"
            >
              Create Your First Character
            </button>
          </div>
        )}

        {selectedCharacter && (
          <CharacterDetailsModal
            character={selectedCharacter}
            characters={mergeCharacters(characters, publicCharacters)}
            currentUserId={user?.id || ''}
            canEdit={selectedCanEdit}
            onClose={() => setSelectedCharacter(null)}
            onEdit={handleEditCharacter}
            onRelationshipsChanged={loadCharacters}
          />
        )}

        {/* Character Form Modal */}
        {showForm && user?.id && (
          <CharacterForm
            character={editingCharacter}
            onSave={handleSaveCharacter}
            onCancel={handleCancelForm}
            userId={user.id}
          />
        )}
      </div>
    </div>
  );
};

function AllCharactersView({ characters, currentUserId, onSelectCharacter }: { characters: Character[]; currentUserId: string; onSelectCharacter: (character: Character) => void }) {
  const [activeFilter, setActiveFilter] = useState<CharacterRoleCategory | 'All'>('All');
  const roleFilters: Array<CharacterRoleCategory | 'All'> = ['All', 'Healer', 'Tank', 'DPS', 'Support'];
  const filteredCharacters = activeFilter === 'All'
    ? characters
    : characters.filter(character => (character.roleBadges || []).some(badge => getRoleCategoryForBadge(badge) === activeFilter));

  if (characters.length === 0) {
    return (
      <div className="text-center py-16">
        <Users className="w-16 h-16 text-gray-400 mx-auto mb-6" />
        <h2 className="text-2xl font-bold text-white mb-4">No Public Characters Yet</h2>
        <p className="text-gray-300">Active characters will appear here for other players to browse.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-fantasy-700/30 bg-fantasy-900/20 p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="font-fantasy text-2xl font-bold text-white">All Characters</h2>
          <p className="text-sm text-gray-400">Browse public characters, read journals, and join the conversation.</p>
        </div>
        <Users className="h-8 w-8 text-yellow-300" />
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {roleFilters.map(filter => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              activeFilter === filter
                ? 'bg-yellow-500 text-midnight-900'
                : 'bg-midnight-900/60 text-gray-300 ring-1 ring-fantasy-700/40 hover:text-white'
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredCharacters.map(character => (
          <PublicCharacterCard
            key={character._id}
            character={character}
            isOwnCharacter={character.userId === currentUserId}
            onSelect={() => onSelectCharacter(character)}
          />
        ))}
      </div>
      {filteredCharacters.length === 0 && (
        <p className="rounded-lg bg-midnight-900/60 p-4 text-sm text-gray-400">No active characters match that role yet.</p>
      )}
    </div>
  );
}

function PublicCharacterCard({ character, isOwnCharacter, onSelect }: { character: Character; isOwnCharacter: boolean; onSelect: () => void }) {
  const avatar = getAvatarFromFoundryJson(character.foundryJson) || normalizeFoundryAvatar(character.stats?.avatar) || DEFAULT_NPC_PLACEHOLDER;

  return (
    <button
      onClick={onSelect}
      className="group relative min-h-[210px] overflow-hidden rounded-lg border border-fantasy-700/30 bg-midnight-900/70 p-5 text-left transition-colors hover:border-yellow-400/60"
    >
      <img
        src={avatar}
        alt=""
        aria-hidden="true"
        className="absolute inset-y-0 right-0 h-full w-[58%] object-cover opacity-65 transition-transform duration-300 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-midnight-950 via-midnight-950/90 via-[55%] to-midnight-950/10" />
      <div className="relative z-10 flex min-h-[170px] max-w-[68%] flex-col">
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-yellow-300">Level {character.level} {character.class}</p>
        <h3 className="mt-2 font-fantasy text-3xl font-bold text-white">{character.name}</h3>
        <p className="mt-2 text-sm text-gray-300">
          {[character.heritage, character.ancestry || character.race].filter(Boolean).join(' ') || 'Adventurer'}
          {isOwnCharacter ? ' - Yours' : ''}
        </p>
        {character.background && <p className="mt-3 line-clamp-2 text-sm text-gray-400">{character.background}</p>}
      </div>
      <CharacterRoleBadges badges={character.roleBadges} limit={6} className="absolute bottom-4 right-4 z-10 max-w-[54%]" />
    </button>
  );
}

function mergeCharacters(primary: Character[], secondary: Character[]) {
  const byId = new Map<string, Character>();
  [...primary, ...secondary].forEach(character => {
    if (character._id) byId.set(character._id, character);
  });
  return Array.from(byId.values());
}

export default CharacterPage;
