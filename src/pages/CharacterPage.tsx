import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Loader2, Network, Plus, Shield, Users } from 'lucide-react';
import { Character } from '../types/database';
import { CharacterService } from '../services/characterService';
import CharacterCard from '../components/CharacterCard';
import CharacterDetailsModal from '../components/CharacterDetailsModal';
import CharacterForm from '../components/CharacterForm';

type CharacterView = 'characters' | 'relationships';

const CharacterPage: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [activeView, setActiveView] = useState<CharacterView>('characters');
  const [showForm, setShowForm] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<Character | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);

  const characterService = CharacterService.getInstance();

  useEffect(() => {
    if (user?.id) {
      loadCharacters();
    }
  }, [user?.id]);

  const loadCharacters = async () => {
    if (!user?.id) return;

    setIsLoading(true);
    try {
      const response = await characterService.getUserCharacters(user.id);
      if (response.success && response.data) {
        setCharacters(response.data);
      } else {
        console.error('Failed to load characters:', response.error);
      }
    } catch (error) {
      console.error('Error loading characters:', error);
    } finally {
      setIsLoading(false);
    }
  };

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
    setSelectedCharacter(character);
  };

  const handleSaveCharacterMetadata = async (updatedCharacter: Character) => {
    if (!user?.id || !updatedCharacter._id) return;

    const response = await characterService.updateCharacter(updatedCharacter._id, user.id, {
      stats: updatedCharacter.stats,
      foundryJson: updatedCharacter.foundryJson,
      foundryFileName: updatedCharacter.foundryFileName
    });

    if (response.success && response.data) {
      const savedCharacter = response.data;
      setCharacters(prev => prev.map(character => character._id === savedCharacter._id ? savedCharacter : character));
      setSelectedCharacter(savedCharacter);
    } else {
      alert(response.error || 'Failed to save character details');
    }
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

        <div className="mb-8 grid grid-cols-2 rounded-xl border border-fantasy-700/30 bg-fantasy-900/20 p-1 sm:flex sm:w-fit">
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
                onSelect={setSelectedCharacter}
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

        {!isLoading && activeView === 'relationships' && (
          <RelationshipOverview characters={characters} onSelectCharacter={setSelectedCharacter} />
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
            characters={characters}
            onClose={() => setSelectedCharacter(null)}
            onEdit={handleEditCharacter}
            onSaveMetadata={handleSaveCharacterMetadata}
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

function RelationshipOverview({ characters, onSelectCharacter }: { characters: Character[]; onSelectCharacter: (character: Character) => void }) {
  const links = characters.flatMap(character => {
    const relationships = Array.isArray(character.stats?.relationships) ? character.stats.relationships : [];
    return relationships.map((relationship: { targetCharacterId: string; label: string; id: string }) => ({
      id: relationship.id,
      source: character,
      target: characters.find(item => item._id === relationship.targetCharacterId),
      label: relationship.label
    }));
  });

  if (characters.length === 0) {
    return (
      <div className="text-center py-16">
        <Users className="w-16 h-16 text-gray-400 mx-auto mb-6" />
        <h2 className="text-2xl font-bold text-white mb-4">No Relationship Map Yet</h2>
        <p className="text-gray-300">Create characters first, then connect them from a character details window.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-fantasy-700/30 bg-fantasy-900/20 p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="font-fantasy text-2xl font-bold text-white">Relationship Map</h2>
          <p className="text-sm text-gray-400">Open a character to add direct relationships and explore deeper connections.</p>
        </div>
        <Network className="h-8 w-8 text-yellow-300" />
      </div>

      {links.length === 0 ? (
        <div className="rounded-lg bg-midnight-900/60 p-8 text-center text-gray-300">
          No relationships have been added yet.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {links.map(link => (
            <button
              key={`${link.source._id}-${link.id}`}
              onClick={() => onSelectCharacter(link.source)}
              className="rounded-lg border border-fantasy-700/30 bg-midnight-900/60 p-4 text-left transition-colors hover:border-yellow-400/60"
            >
              <p className="font-semibold text-white">{link.source.name}</p>
              <p className="my-2 text-sm text-yellow-200">{link.label}</p>
              <p className="text-sm text-gray-300">{link.target?.name || 'Unknown character'}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default CharacterPage;
