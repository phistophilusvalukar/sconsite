import React from 'react';
import { Calendar, Download, Edit, Shield, Trash2, Users } from 'lucide-react';
import { Character } from '../types/database';

interface CharacterCardProps {
  character: Character;
  onEdit: (character: Character) => void;
  onDelete: (characterId: string) => void;
  onSelect: (character: Character) => void;
  isSelected: boolean;
}

const CharacterCard: React.FC<CharacterCardProps> = ({
  character,
  onEdit,
  onDelete,
  onSelect,
  isSelected
}) => {
  const parsedData = character.foundryJson ? getCharacterDataFromJson(character.foundryJson) : null;

  // Get character avatar from main file or use default
  const characterAvatar = parsedData?.avatar || character.stats?.avatar || 
    `https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=128&h=128&fit=crop`;

  const handleDownloadJson = () => {
    if (!character.foundryJson) return;

    const dataBlob = new Blob([JSON.stringify(character.foundryJson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = character.foundryFileName || `${character.name}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className={`bg-fantasy-900/30 border border-fantasy-700/30 rounded-xl p-6 hover:bg-fantasy-800/30 transition-all cursor-pointer ${
        isSelected ? 'ring-2 ring-yellow-400' : ''
      }`}
      onClick={() => onSelect(character)}
    >
      <div className="flex items-center justify-between mb-4">
        <img
          src={characterAvatar}
          alt={character.name}
          className="w-16 h-16 rounded-full border-2 border-yellow-400 object-cover"
        />
        <div className={`px-3 py-1 rounded-full text-sm font-medium ${
          character.isActive 
            ? 'bg-emerald-500/20 text-emerald-400' 
            : 'bg-gray-500/20 text-gray-400'
        }`}>
          {character.isActive ? 'Active' : 'Inactive'}
        </div>
      </div>

      <h3 className="text-xl font-bold text-white mb-2">{character.name}</h3>
      <p className="text-fantasy-300 mb-2">
        Level {parsedData?.level || character.level} {character.class}
      </p>
      
      {(character.ancestry || character.race) && (
        <p className="text-gray-400 text-sm mb-1">{character.ancestry || character.race}</p>
      )}

      {character.heritage && (
        <p className="text-gray-500 text-xs mb-3">{character.heritage}</p>
      )}

      {/* Character Details from JSON */}
      {parsedData && (
        <div className="mb-4 p-3 bg-fantasy-800/30 rounded-lg">
          <h4 className="text-sm font-semibold text-yellow-400 mb-2">Character Details</h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {parsedData.age && (
              <div>
                <span className="text-gray-400">Age:</span>
                <span className="text-white ml-1">{parsedData.age}</span>
              </div>
            )}
            {parsedData.height && (
              <div>
                <span className="text-gray-400">Height:</span>
                <span className="text-white ml-1">{parsedData.height}</span>
              </div>
            )}
            {parsedData.weight && (
              <div>
                <span className="text-gray-400">Weight:</span>
                <span className="text-white ml-1">{parsedData.weight}</span>
              </div>
            )}
            {parsedData.wealth !== undefined && (
              <div>
                <span className="text-gray-400">Wealth:</span>
                <span className="text-white ml-1">{parsedData.wealth} gp</span>
              </div>
            )}
          </div>
        </div>
      )}

      {character.guildId && (
        <div className="flex items-center space-x-2 mb-3">
          <Users className="w-4 h-4 text-blue-400" />
          <span className="text-blue-400 text-sm">Guild Member</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
        <div className="flex items-center space-x-2">
          <Shield className="w-4 h-4 text-yellow-400" />
          <span className="text-gray-300">{character.foundryJson ? 'JSON saved' : 'No JSON'}</span>
        </div>
        <div className="flex items-center space-x-2">
          <Calendar className="w-4 h-4 text-purple-400" />
          <span className="text-gray-300">
            {character.createdAt ? new Date(character.createdAt).toLocaleDateString() : 'Unknown'}
          </span>
        </div>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-white">Foundry JSON</h4>
        </div>
        {character.foundryJson ? (
          <div className="flex items-center justify-between p-2 bg-fantasy-700/30 rounded text-xs">
            <span className="text-white truncate">{character.foundryFileName || `${character.name}.json`}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDownloadJson();
              }}
              className="p-1 text-gray-400 hover:text-blue-400 transition-colors"
              title="Download"
            >
              <Download className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <p className="text-gray-400 text-xs">No JSON saved</p>
        )}
      </div>

      <div className="flex space-x-2">
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onEdit(character);
          }}
          className="flex-1 px-3 py-2 bg-fantasy-700 hover:bg-fantasy-600 text-white rounded-md transition-colors text-sm flex items-center justify-center space-x-1"
        >
          <Edit className="w-4 h-4" />
          <span>Edit</span>
        </button>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            if (character._id) onDelete(character._id);
          }}
          className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// Helper function to parse character data from FoundryVTT JSON
function getCharacterDataFromJson(jsonData: any) {
  try {
    const system = jsonData.system || {};
    const details = system.details || {};
    const biography = details.biography || {};
    const attributes = system.attributes || {};

    return {
      name: jsonData.name || '',
      appearance: biography.appearance || '',
      backstory: biography.backstory || '',
      age: details.age?.value || null,
      height: details.height?.value || '',
      weight: details.weight?.value || '',
      level: details.level?.value || 1,
      wealth: attributes.wealth?.value || 0,
      avatar: jsonData.img || ''
    };
  } catch (error) {
    console.error('Error parsing character JSON:', error);
    return null;
  }
}

export default CharacterCard;
