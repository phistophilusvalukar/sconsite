import React from 'react';
import { Calendar, Edit, Shield, Trash2, Users } from 'lucide-react';
import { Character } from '../types/database';
import CharacterRoleBadges from './CharacterRoleBadges';
import { roleBorderTone, rolePillTone } from '../utils/characterRoles';

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

  return (
    <div
      className={`group overflow-hidden rounded-xl border bg-fantasy-900/30 hover:bg-fantasy-800/30 transition-all cursor-pointer ${roleBorderTone(character.mainRole)} ${
        isSelected ? 'ring-2 ring-yellow-400' : ''
      }`}
      onClick={() => onSelect(character)}
    >
      <div className="relative min-h-[260px] overflow-hidden">
        <img src={characterAvatar} alt={character.name} className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-midnight-950 via-midnight-950/45 to-midnight-950/10" />
        <div className="absolute left-4 right-4 top-4 flex items-center justify-between">
          <div className={`px-3 py-1 rounded-full text-xs font-semibold backdrop-blur ${
            character.isActive
              ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/30'
              : 'bg-gray-500/25 text-gray-200 ring-1 ring-gray-300/20'
          }`}>
            {character.isActive ? 'Active' : 'Inactive'}
          </div>
          {character.guildId && (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/20 text-blue-200 ring-1 ring-blue-300/30 backdrop-blur" title="Guild Member">
              <Users className="w-4 h-4" />
            </div>
          )}
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-5">
          {character.mainRole && (
            <span className={`mb-2 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 backdrop-blur ${rolePillTone(character.mainRole)}`}>
              {character.mainRole}
            </span>
          )}
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-yellow-300">
            Level {parsedData?.level || character.level} {character.class}
          </p>
          <h3 className="font-fantasy text-3xl font-bold text-white drop-shadow">{character.name}</h3>
          <p className="mt-2 text-sm text-gray-200">
            {[character.heritage, character.ancestry || character.race].filter(Boolean).join(' ') || 'Adventurer'}
          </p>
        </div>
        <CharacterRoleBadges badges={character.roleBadges} limit={5} className="absolute bottom-4 right-4 max-w-[46%]" />
      </div>

      <div className="grid grid-cols-2 gap-4 p-4 text-sm">
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

      <div className="flex space-x-2 px-4 pb-4">
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
function getCharacterDataFromJson(jsonData: unknown) {
  try {
    const data = jsonData as {
      img?: string;
      system?: {
        details?: {
          biography?: {
            appearance?: string;
            backstory?: string;
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
      name: '',
      appearance: biography.appearance || '',
      backstory: biography.backstory || '',
      age: details.age?.value || null,
      height: details.height?.value || '',
      weight: details.weight?.value || '',
      level: details.level?.value || 1,
      wealth: attributes.wealth?.value || 0,
      avatar: data.img || ''
    };
  } catch (error) {
    console.error('Error parsing character JSON:', error);
    return null;
  }
}

export default CharacterCard;
