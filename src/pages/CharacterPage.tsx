import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Plus, Shield, Loader2 } from 'lucide-react';
import { Character } from '../types/database';
import { CharacterService } from '../services/characterService';
import CharacterCard from '../components/CharacterCard';
import CharacterForm from '../components/CharacterForm';

const CharacterPage: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
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
              My Characters
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

        {/* Loading State */}
        {isLoading && (
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 text-yellow-400 mx-auto mb-4 animate-spin" />
            <p className="text-gray-300">Loading characters...</p>
          </div>
        )}

        {/* Character Grid */}
        {!isLoading && (
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

        {/* Empty State */}
        {!isLoading && characters.length === 0 && (
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

        {/* Character Details Panel */}
        {selectedCharacter && (
          <div className="bg-fantasy-900/30 border border-fantasy-700/30 rounded-xl p-6">
            <div className="flex flex-col lg:flex-row gap-8">
              {/* Character Info */}
              <div className="lg:w-1/2">
                <h2 className="font-fantasy text-2xl font-bold text-white mb-4">
                  {selectedCharacter.name}
                </h2>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-400">Class & Level</label>
                      <p className="text-white">
                        Level {selectedCharacter.level} {selectedCharacter.class}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-400">Race</label>
                      <p className="text-white">{selectedCharacter.race}</p>
                    </div>
                    {selectedCharacter.background && (
                      <div>
                        <label className="text-sm font-medium text-gray-400">Background</label>
                        <p className="text-white">{selectedCharacter.background}</p>
                      </div>
                    )}
                    {selectedCharacter.alignment && (
                      <div>
                        <label className="text-sm font-medium text-gray-400">Alignment</label>
                        <p className="text-white">{selectedCharacter.alignment}</p>
                      </div>
                    )}
                  </div>
                  
                  {selectedCharacter.backstory && (
                    <div>
                      <label className="text-sm font-medium text-gray-400">Backstory</label>
                      <p className="text-white leading-relaxed">{selectedCharacter.backstory}</p>
                    </div>
                  )}
                  
                  {selectedCharacter.notes && (
                    <div>
                      <label className="text-sm font-medium text-gray-400">Notes</label>
                      <p className="text-white leading-relaxed">{selectedCharacter.notes}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Character Stats */}
              <div className="lg:w-1/2">
                <h3 className="text-xl font-bold text-white mb-4">Character Statistics</h3>
                <div className="bg-fantasy-800/30 rounded-lg p-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-yellow-400 mb-1">
                        {selectedCharacter.level}
                      </div>
                      <div className="text-gray-300">Level</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-400 mb-1">
                        {selectedCharacter.isActive ? 'Active' : 'Inactive'}
                      </div>
                      <div className="text-gray-300">Status</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-purple-400 mb-1">
                        {selectedCharacter.createdAt ? new Date(selectedCharacter.createdAt).toLocaleDateString() : 'Unknown'}
                      </div>
                      <div className="text-gray-300">Created</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-400 mb-1">
                        {selectedCharacter.guildId ? 'Yes' : 'No'}
                      </div>
                      <div className="text-gray-300">Guild Member</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
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

export default CharacterPage;
