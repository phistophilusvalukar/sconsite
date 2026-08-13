import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, Plus, Save, Trash2 } from 'lucide-react';
import type { FoundryJsonEntry } from '../../types/database';
import CharacterService from '../../services/characterService';
import {
  CharacterPlannerData,
  createDefaultPlanner,
  exportActorAtLevel,
  getPlannerFeats,
  parsePlannerActor,
  parsePlannerData,
  proficiencyRanks,
  skillLabels,
  validatePlanner
} from './characterPlanner';

interface CharacterPlannerProps {
  characterName: string;
  sourceJson: unknown;
  sourceFile?: FoundryJsonEntry;
  onFileUpdated?: (file: FoundryJsonEntry) => void;
}

const CharacterLevelPlanner: React.FC<CharacterPlannerProps> = ({ characterName, sourceJson, sourceFile, onFileUpdated }) => {
  const service = useMemo(() => CharacterService.getInstance(), []);
  const actorResult = useMemo(() => {
    try { return { actor: parsePlannerActor(sourceJson), error: '' }; }
    catch { return { actor: undefined, error: 'The active file is not a supported PF2e Foundry actor JSON.' }; }
  }, [sourceJson]);
  const [planner, setPlanner] = useState<CharacterPlannerData>();
  const [targetLevel, setTargetLevel] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    if (!actorResult.actor) {
      setPlanner(undefined);
      return;
    }
    setPlanner(parsePlannerData(sourceFile?.plannerData) || createDefaultPlanner(actorResult.actor));
    setTargetLevel(Math.max(1, Math.min(20, actorResult.actor.system.details.level.value)));
    setSaveMessage('');
  }, [actorResult.actor, sourceFile?.id, sourceFile?.plannerData]);

  if (actorResult.error || !actorResult.actor || !planner) {
    return <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">{actorResult.error || 'No active Foundry JSON is available.'}</p>;
  }

  const actor = actorResult.actor;
  const feats = getPlannerFeats(actor).sort((a, b) => (planner.featLevels[a._id] || 1) - (planner.featLevels[b._id] || 1) || a.name.localeCompare(b.name));
  const availableSkills = Object.keys(actor.system.skills || {}).sort((a, b) => (skillLabels[a] || a).localeCompare(skillLabels[b] || b));
  const issues = validatePlanner(planner);

  const updateFeatLevel = (id: string, level: number) => {
    setPlanner(current => current && ({ ...current, featLevels: { ...current.featLevels, [id]: level } }));
  };

  const addSkillUpgrade = (level: number) => {
    const skill = availableSkills[0];
    if (!skill) return;
    const currentRanks = planner.skillUpgrades.filter(item => item.skill === skill).map(item => item.rank);
    const rank = Math.min(4, Math.max(1, currentRanks.length ? Math.max(...currentRanks) + 1 : 1));
    setPlanner(current => current && ({
      ...current,
      skillUpgrades: [...current.skillUpgrades, { id: crypto.randomUUID(), level, skill, rank }]
    }));
  };

  const updateSkillUpgrade = (id: string, updates: Partial<CharacterPlannerData['skillUpgrades'][number]>) => {
    setPlanner(current => current && ({
      ...current,
      skillUpgrades: current.skillUpgrades.map(item => item.id === id ? { ...item, ...updates } : item)
    }));
  };

  const removeSkillUpgrade = (id: string) => {
    setPlanner(current => current && ({ ...current, skillUpgrades: current.skillUpgrades.filter(item => item.id !== id) }));
  };

  const savePlanner = async () => {
    if (!sourceFile) {
      setSaveMessage('Import this legacy JSON into the Foundry file list before saving its planner. Export is still available.');
      return;
    }
    setIsSaving(true);
    const response = await service.updateFoundryFile(sourceFile.id, { plannerData: planner });
    setIsSaving(false);
    if (response.success && response.data) {
      onFileUpdated?.(response.data);
      setSaveMessage('Planner saved.');
    } else {
      setSaveMessage(response.error || 'Unable to save the planner.');
    }
  };

  const downloadExport = () => {
    const exported = exportActorAtLevel(actor, planner, targetLevel);
    const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${characterName.replace(/[^a-z0-9_-]+/gi, '-') || 'character'}-level-${targetLevel}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-yellow-400/25 bg-yellow-500/10 p-4">
        <h3 className="font-fantasy text-xl font-bold text-white">Level JSON Export</h3>
        <p className="mt-1 text-sm text-gray-300">Source: {sourceFile?.name || 'legacy character JSON'} (level {actor.system.details.level.value})</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm font-semibold text-gray-200">
            Export level
            <select value={targetLevel} onChange={event => setTargetLevel(Number(event.target.value))} className="mt-1 block rounded-lg border border-fantasy-700/40 bg-midnight-900 px-3 py-2 text-white">
              {Array.from({ length: 20 }, (_, index) => index + 1).map(level => <option key={level} value={level}>Level {level}</option>)}
            </select>
          </label>
          <button onClick={downloadExport} className="flex items-center gap-2 rounded-lg bg-yellow-500 px-4 py-2 font-bold text-midnight-900 hover:bg-yellow-400">
            <Download className="h-4 w-4" /> Export JSON
          </button>
          <button onClick={savePlanner} disabled={isSaving} className="flex items-center gap-2 rounded-lg bg-fantasy-800/60 px-4 py-2 font-bold text-gray-100 hover:text-white disabled:opacity-50">
            <Save className="h-4 w-4" /> {isSaving ? 'Saving...' : 'Save Planner'}
          </button>
        </div>
        {saveMessage && <p className="mt-3 text-sm text-yellow-200">{saveMessage}</p>}
      </div>

      <div className="flex gap-3 rounded-lg border border-amber-400/25 bg-amber-500/10 p-4 text-sm text-amber-100">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <p>Items, spells, crafting formulas, and their quantities are carried through unchanged in this release. Review those sections in Foundry after importing a lower-level export.</p>
      </div>

      {issues.length > 0 && <div className="rounded-lg border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-100">
        <p className="font-bold">Skill timeline needs review:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul>
      </div>}

      <section>
        <h3 className="font-fantasy text-xl font-bold text-white">Feat choices by level</h3>
        <p className="mb-3 mt-1 text-sm text-gray-400">Levels were inferred from Foundry choice slots and granted parents. Correct any unusual or manually-added feats here.</p>
        <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
          {feats.map(feat => <div key={feat._id} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg border border-fantasy-700/30 bg-fantasy-900/30 p-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-white">{feat.name}</p>
              <p className="text-xs capitalize text-gray-400">{feat.system?.category || 'feat'}{feat.system?.location ? ` · ${feat.system.location}` : ''}</p>
            </div>
            <select aria-label={`Level for ${feat.name}`} value={planner.featLevels[feat._id] || 1} onChange={event => updateFeatLevel(feat._id, Number(event.target.value))} className="rounded-md border border-fantasy-700/40 bg-midnight-900 px-2 py-2 text-sm text-white">
              {Array.from({ length: 20 }, (_, index) => index + 1).map(level => <option key={level} value={level}>Level {level}</option>)}
            </select>
          </div>)}
        </div>
      </section>

      <section>
        <h3 className="font-fantasy text-xl font-bold text-white">Skill proficiency upgrades</h3>
        <p className="mb-3 mt-1 text-sm text-gray-400">Each row records when a skill reaches trained, expert, master, or legendary. Prefilled levels are legal starting points and should be adjusted to match the build.</p>
        <div className="space-y-3">
          {Array.from({ length: 20 }, (_, index) => index + 1).map(level => {
            const upgrades = planner.skillUpgrades.filter(item => item.level === level).sort((a, b) => a.skill.localeCompare(b.skill) || a.rank - b.rank);
            return <div key={level} className="rounded-lg border border-fantasy-700/30 bg-fantasy-900/20 p-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-white">Level {level}</h4>
                <button onClick={() => addSkillUpgrade(level)} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold text-yellow-200 hover:bg-yellow-500/10"><Plus className="h-3.5 w-3.5" /> Add upgrade</button>
              </div>
              {upgrades.length > 0 && <div className="mt-2 space-y-2">{upgrades.map(upgrade => <div key={upgrade.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
                <select value={upgrade.skill} onChange={event => updateSkillUpgrade(upgrade.id, { skill: event.target.value })} className="min-w-0 rounded-md border border-fantasy-700/40 bg-midnight-900 px-2 py-2 text-sm text-white">
                  {availableSkills.map(skill => <option key={skill} value={skill}>{skillLabels[skill] || skill}</option>)}
                </select>
                <select value={upgrade.rank} onChange={event => updateSkillUpgrade(upgrade.id, { rank: Number(event.target.value) })} className="min-w-0 rounded-md border border-fantasy-700/40 bg-midnight-900 px-2 py-2 text-sm capitalize text-white">
                  {proficiencyRanks.slice(1).map((rank, index) => <option key={rank} value={index + 1}>{rank}</option>)}
                </select>
                <button aria-label="Remove skill upgrade" onClick={() => removeSkillUpgrade(upgrade.id)} className="rounded-md p-2 text-red-300 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
              </div>)}</div>}
            </div>;
          })}
        </div>
      </section>
    </div>
  );
};

export default CharacterLevelPlanner;
