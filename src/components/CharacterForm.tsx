import React, { useEffect, useState } from 'react';
import { Save, Upload, X } from 'lucide-react';
import { Character, CharacterRoleBadge, CharacterRoleCategory } from '../types/database';
import { CharacterService, FoundryCharacterData } from '../services/characterService';
import { mainRoleOptions, roleBadgeMap, roleBadgeTone, roleCategories, rolePillTone } from '../utils/characterRoles';

interface CharacterFormProps {
  character?: Character;
  onSave: (character: Character) => void;
  onCancel: () => void;
  userId: string;
}

const CharacterForm: React.FC<CharacterFormProps> = ({
  character,
  onSave,
  onCancel,
  userId
}) => {
  const [formData, setFormData] = useState({
    name: '',
    classPrimary: '',
    classSecondary: '',
    ancestry: '',
    heritage: '',
    level: 1,
    background: '',
    backstory: '',
    notes: '',
    isActive: true,
    mainRole: '' as CharacterRoleCategory | '',
    roleBadges: [] as CharacterRoleBadge[]
  });
  const [isLoading, setIsLoading] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const [importedJson, setImportedJson] = useState<FoundryCharacterData | null>(null);

  const characterService = CharacterService.getInstance();

  useEffect(() => {
    if (character) {
      setFormData({
        name: character.name,
        classPrimary: character.classPrimary || character.class,
        classSecondary: character.classSecondary || '',
        ancestry: character.ancestry || character.race,
        heritage: character.heritage || '',
        level: character.level,
        background: character.background || '',
        backstory: character.backstory || '',
        notes: character.notes || '',
        isActive: character.isActive,
        mainRole: character.mainRole || '',
        roleBadges: character.roleBadges || []
      });
      setImportedJson(character.foundryJson || null);
      setImportFileName(character.foundryFileName || '');
    }
  }, [character]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox'
        ? (e.target as HTMLInputElement).checked
        : type === 'number'
          ? parseInt(value, 10) || 1
          : value
    }));
  };

  const handleToggleRoleBadge = (badge: CharacterRoleBadge) => {
    setFormData(prev => ({
      ...prev,
      roleBadges: prev.roleBadges.includes(badge)
        ? prev.roleBadges.filter(item => item !== badge)
        : [...prev.roleBadges, badge]
    }));
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const fileContent = await readFileAsText(file);
      const jsonData = JSON.parse(fileContent) as FoundryCharacterData;
      const parsedData = characterService.parseFoundryData(jsonData);

      setFormData(prev => ({
        ...prev,
        name: parsedData.name || prev.name,
        classPrimary: parsedData.classPrimary || prev.classPrimary,
        classSecondary: parsedData.classSecondary || prev.classSecondary,
        ancestry: parsedData.ancestry || prev.ancestry,
        heritage: parsedData.heritage || prev.heritage,
        background: parsedData.background || prev.background,
        backstory: parsedData.backstory || prev.backstory,
        level: parsedData.level || parsedData.stats?.level || prev.level
      }));

      setImportedJson(jsonData);
      setImportFileName(file.name);
    } catch (error) {
      console.error('Error importing file:', error);
      alert('Failed to import file. Please ensure it is a valid FoundryVTT character JSON file.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const parsedData = importedJson ? characterService.parseFoundryData(importedJson) : {};
      const characterData = {
        name: formData.name,
        class: [formData.classPrimary, formData.classSecondary].filter(Boolean).join(' - '),
        classPrimary: formData.classPrimary,
        classSecondary: formData.classSecondary,
        race: formData.ancestry,
        ancestry: formData.ancestry,
        heritage: formData.heritage,
        level: formData.level,
        background: formData.background,
        backstory: formData.backstory,
        notes: formData.notes,
        isActive: formData.isActive,
        mainRole: formData.mainRole || undefined,
        roleBadges: formData.roleBadges,
        userId,
        stats: parsedData.stats || character?.stats || {},
        equipment: character?.equipment || [],
        foundryJson: importedJson || character?.foundryJson || null,
        foundryFileName: importFileName || character?.foundryFileName || undefined
      };

      const result = character?._id
        ? await characterService.updateCharacter(character._id, userId, characterData)
        : await characterService.createCharacter(characterData);

      if (result.success && result.data) {
        onSave(result.data);
      } else {
        alert(result.error || 'Failed to save character');
      }
    } catch (error) {
      console.error('Error saving character:', error);
      alert('Failed to save character');
    } finally {
      setIsLoading(false);
    }
  };

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-fantasy-900 border border-fantasy-700 rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">
            {character ? 'Edit Character' : 'Create Character'}
          </h2>
          <button
            onClick={onCancel}
            className="p-2 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Import from FoundryVTT
            </label>
            <label className="flex items-center space-x-2 p-3 border-2 border-dashed border-fantasy-700/50 rounded-lg hover:border-yellow-400/50 transition-colors cursor-pointer">
              <Upload className="w-5 h-5 text-gray-400" />
              <span className="text-gray-300">Choose FoundryVTT JSON file</span>
              <input
                type="file"
                accept=".json"
                onChange={handleFileImport}
                className="hidden"
              />
            </label>
            {importFileName && (
              <p className="text-green-400 text-sm mt-2">
                Imported: {importFileName}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Basic Information</h3>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Character Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                  className="w-full p-3 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  placeholder="Enter character name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Primary Class *
                </label>
                <input
                  type="text"
                  name="classPrimary"
                  value={formData.classPrimary}
                  onChange={handleInputChange}
                  required
                  className="w-full p-3 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  placeholder="e.g., Cleric"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Secondary Class
                </label>
                <input
                  type="text"
                  name="classSecondary"
                  value={formData.classSecondary}
                  onChange={handleInputChange}
                  className="w-full p-3 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  placeholder="e.g., Rogue"
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Lineage</h3>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Ancestry *
                </label>
                <input
                  type="text"
                  name="ancestry"
                  value={formData.ancestry}
                  onChange={handleInputChange}
                  required
                  className="w-full p-3 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  placeholder="e.g., Swarmblood"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Heritage
                </label>
                <input
                  type="text"
                  name="heritage"
                  value={formData.heritage}
                  onChange={handleInputChange}
                  className="w-full p-3 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  placeholder="e.g., Wingswarm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Level
                </label>
                <input
                  type="number"
                  name="level"
                  value={formData.level}
                  onChange={handleInputChange}
                  min="1"
                  max="20"
                  className="w-full p-3 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Background
            </label>
            <input
              type="text"
              name="background"
              value={formData.background}
              onChange={handleInputChange}
              className="w-full p-3 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400"
              placeholder="e.g., Corpse Stitcher"
            />
          </div>

          <div>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                name="isActive"
                checked={formData.isActive}
                onChange={handleInputChange}
                className="form-checkbox h-4 w-4 text-yellow-500 bg-fantasy-800 border-fantasy-600 rounded focus:ring-yellow-400"
              />
              <span className="text-gray-300">Active Character</span>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Main Role
            </label>
            <select
              name="mainRole"
              value={formData.mainRole}
              onChange={handleInputChange}
              className="w-full p-3 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
            >
              <option value="">Choose main role</option>
              {mainRoleOptions.map(role => <option key={role} value={role}>{role}</option>)}
            </select>
            {formData.mainRole && (
              <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-sm font-bold ring-1 ${rolePillTone(formData.mainRole)}`}>
                {formData.mainRole}
              </span>
            )}
          </div>

          <div>
            <h3 className="mb-3 text-lg font-semibold text-white">Role Badges</h3>
            <div className="grid gap-4 md:grid-cols-2">
              {roleCategories.map(group => (
                <div key={group.category} className="rounded-lg border border-fantasy-700/30 bg-fantasy-800/30 p-4">
                  <p className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-yellow-300">{group.category}</p>
                  <div className="flex flex-wrap gap-2">
                    {group.badges.map(badge => {
                      const selected = formData.roleBadges.includes(badge.id);
                      return (
                        <button
                          key={badge.id}
                          type="button"
                          onClick={() => handleToggleRoleBadge(badge.id)}
                          className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ring-1 transition-colors ${
                            selected
                              ? roleBadgeTone(roleBadgeMap.get(badge.id)?.category)
                              : 'bg-midnight-900/60 text-gray-300 ring-fantasy-600/40 hover:text-white'
                          }`}
                        >
                          {badge.icon}
                          <span>{badge.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Backstory
            </label>
            <textarea
              name="backstory"
              value={formData.backstory}
              onChange={handleInputChange}
              rows={4}
              className="w-full p-3 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400 resize-none"
              placeholder="Tell your character's story..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Notes
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              rows={3}
              className="w-full p-3 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400 resize-none"
              placeholder="Additional notes about your character..."
            />
          </div>

          <div className="flex space-x-4 pt-6 border-t border-fantasy-700/30">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-6 py-3 border border-fantasy-600 text-gray-300 hover:text-white hover:border-fantasy-500 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 px-6 py-3 bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-600 text-midnight-900 font-bold rounded-lg transition-colors flex items-center justify-center space-x-2"
            >
              <Save className="w-5 h-5" />
              <span>{isLoading ? 'Saving...' : 'Save Character'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CharacterForm;
