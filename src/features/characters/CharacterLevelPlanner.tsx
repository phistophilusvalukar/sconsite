import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, Save } from 'lucide-react';
import type { FoundryJsonEntry } from '../../types/database';
import CharacterService from '../../services/characterService';
import {
  CharacterPlannerData,
  abilityBoostLevels,
  abilityKeys,
  abilityLabels,
  abilityModifier,
  abilityScore,
  automaticClassFeatureLevel,
  createDefaultPlanner,
  exportActorAtLevel,
  getAutomaticClassFeatures,
  getSelectablePlannerFeats,
  inferAbilityBaseScores,
  inferFeatLevels,
  isPartialAbilityBoost,
  parsePlannerActor,
  parsePlannerData,
  proficiencyRanks,
  rankAtLevel,
  setAbilityBoost,
  setSkillBoost,
  skillLabels,
  validatePlanner
} from './characterPlanner';

interface CharacterPlannerProps {
  characterName: string;
  sourceJson: unknown;
  sourceFile?: FoundryJsonEntry;
  onFileUpdated?: (file: FoundryJsonEntry) => void;
}

const rankTones = [
  '',
  'border-sky-300/70 bg-sky-400/25 text-sky-100',
  'border-emerald-300/70 bg-emerald-400/25 text-emerald-100',
  'border-violet-300/70 bg-violet-400/25 text-violet-100',
  'border-yellow-300/70 bg-yellow-400/25 text-yellow-100'
];

const CharacterLevelPlanner: React.FC<CharacterPlannerProps> = ({ characterName, sourceJson, sourceFile, onFileUpdated }) => {
  const service = useMemo(() => CharacterService.getInstance(), []);
  const actorResult = useMemo(() => {
    try { return { actor: parsePlannerActor(sourceJson), error: '' }; }
    catch (error) { return { actor: undefined, error: error instanceof Error ? error.message : 'The active file is not a supported PF2e Foundry actor JSON.' }; }
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
    const defaults = createDefaultPlanner(actorResult.actor);
    const saved = parsePlannerData(sourceFile?.plannerData);
    const savedValue = sourceFile?.plannerData;
    const savedHasAbilityBoosts = Boolean(savedValue && typeof savedValue === 'object' && 'abilityBoosts' in savedValue);
    const savedHasAbilityBaseScores = Boolean(savedValue && typeof savedValue === 'object' && 'abilityBaseScores' in savedValue);
    if (saved) {
      const abilityBoosts = savedHasAbilityBoosts ? saved.abilityBoosts : defaults.abilityBoosts;
      const abilityBaseScores = savedHasAbilityBaseScores ? saved.abilityBaseScores : inferAbilityBaseScores(actorResult.actor, abilityBoosts);
      setPlanner({ ...saved, abilityBoosts, abilityBaseScores });
    } else {
      setPlanner(defaults);
    }
    setTargetLevel(Math.max(1, Math.min(20, actorResult.actor.system.details.level.value)));
    setSaveMessage('');
  }, [actorResult.actor, sourceFile?.id, sourceFile?.plannerData]);

  if (actorResult.error || !actorResult.actor || !planner) {
    return <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">{actorResult.error || 'No active Foundry JSON is available.'}</p>;
  }

  const actor = actorResult.actor;
  const inferredFeatLevels = inferFeatLevels(actor);
  const feats = getSelectablePlannerFeats(actor).sort((left, right) => (planner.featLevels[left._id] || 1) - (planner.featLevels[right._id] || 1) || left.name.localeCompare(right.name));
  const classFeatures = getAutomaticClassFeatures(actor).sort((left, right) => automaticClassFeatureLevel(left, inferredFeatLevels) - automaticClassFeatureLevel(right, inferredFeatLevels) || left.name.localeCompare(right.name));
  const availableSkills = Object.keys(actor.system.skills || {}).sort((left, right) => (skillLabels[left] || left).localeCompare(skillLabels[right] || right));
  const availableAbilities = abilityKeys.filter(ability => abilityScore(actor, ability) !== undefined);
  const issues = validatePlanner(planner, availableAbilities.length > 0);

  const updateFeatLevel = (id: string, level: number) => {
    setPlanner(current => current && ({ ...current, featLevels: { ...current.featLevels, [id]: level } }));
  };

  const toggleSkillBoost = (skill: string, level: number, selected: boolean) => {
    setPlanner(current => current && setSkillBoost(current, skill, level, selected));
  };

  const toggleAbilityBoost = (ability: typeof abilityKeys[number], level: number, selected: boolean) => {
    setPlanner(current => current && setAbilityBoost(current, ability, level, selected));
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
        <p className="font-bold">Planner needs review:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul>
      </div>}

      <section>
        <h3 className="font-fantasy text-xl font-bold text-white">Feat choices by level</h3>
        <p className="mb-3 mt-1 text-sm text-gray-400">Only player-selected feats appear here. Levels were inferred from Foundry choice slots and granted parents.</p>
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

      {classFeatures.length > 0 && <section>
        <h3 className="font-fantasy text-xl font-bold text-white">Automatic class features</h3>
        <p className="mb-3 mt-1 text-sm text-gray-400">These are granted by the class and are automatically included when the exported level reaches their level.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {classFeatures.map(feature => {
            const level = automaticClassFeatureLevel(feature, inferredFeatLevels);
            return <div key={feature._id} className="flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-400/30 text-xs font-black text-emerald-200">{level}</span>
              <div className="min-w-0"><p className="truncate font-semibold text-white">{feature.name}</p><p className="text-xs text-emerald-200/70">Granted automatically at level {level}</p></div>
            </div>;
          })}
        </div>
      </section>}

      <section>
        <h3 className="font-fantasy text-xl font-bold text-white">Skill increase graph</h3>
        <p className="mt-1 text-sm text-gray-400">Skills run down the left and character levels run across the top. Select a point to spend a boost there; each selected point advances that skill one rank.</p>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold uppercase tracking-wide text-gray-300">
          {proficiencyRanks.slice(1).map(rank => <span key={rank} className="rounded-full border border-fantasy-700/40 bg-fantasy-900/40 px-2.5 py-1"><b className="mr-1 text-yellow-200">{rank.charAt(0).toUpperCase()}</b>{rank}</span>)}
        </div>
        <div className="mt-4 overflow-x-auto rounded-xl border border-fantasy-700/35 bg-midnight-950/45">
          <table className="w-full min-w-[1260px] border-separate border-spacing-0 text-xs">
            <thead><tr>
              <th className="sticky left-0 z-20 min-w-40 border-b border-r border-fantasy-700/40 bg-midnight-950 p-3 text-left text-gray-300">Skill</th>
              {Array.from({ length: 20 }, (_, index) => index + 1).map(level => <th key={level} className={`min-w-11 border-b border-fantasy-700/30 p-2 text-center ${level % 5 === 0 ? 'bg-yellow-500/10 text-yellow-200' : 'text-gray-500'}`}>{level}</th>)}
              <th className="sticky right-0 z-20 min-w-24 border-b border-l border-fantasy-700/40 bg-midnight-950 p-3 text-center text-gray-300">Rank</th>
            </tr></thead>
            <tbody>{availableSkills.map(skill => {
              const boosts = planner.skillUpgrades.filter(upgrade => upgrade.skill === skill).sort((left, right) => left.level - right.level || left.id.localeCompare(right.id));
              const finalRank = rankAtLevel(planner, skill, 20);
              return <tr key={skill}>
                <th className="sticky left-0 z-10 border-b border-r border-fantasy-700/25 bg-midnight-950 p-3 text-left font-semibold text-white">{skillLabels[skill] || skill}</th>
                {Array.from({ length: 20 }, (_, index) => index + 1).map(level => {
                  const selectedIndex = boosts.findIndex(boost => boost.level === level);
                  const selected = selectedIndex >= 0;
                  const rank = selectedIndex + 1;
                  const disabled = !selected && boosts.length >= 4;
                  return <td key={level} className={`border-b border-fantasy-700/20 p-1.5 text-center ${level % 5 === 0 ? 'bg-yellow-500/[.025]' : ''}`}>
                    <button
                      type="button"
                      aria-label={`${selected ? 'Remove' : 'Add'} ${skillLabels[skill] || skill} skill boost at level ${level}`}
                      aria-pressed={selected}
                      disabled={disabled}
                      title={selected ? `${proficiencyRanks[rank]} at level ${level}` : disabled ? 'This skill is already legendary' : `Boost at level ${level}`}
                      onClick={() => toggleSkillBoost(skill, level, !selected)}
                      className={`mx-auto flex h-8 w-8 items-center justify-center rounded-md border font-black transition-colors ${selected ? rankTones[rank] : 'border-fantasy-700/30 bg-fantasy-900/30 text-transparent hover:border-yellow-300/50 hover:bg-yellow-500/10'} disabled:cursor-not-allowed disabled:opacity-25`}
                    >{selected ? proficiencyRanks[rank].charAt(0).toUpperCase() : '·'}</button>
                  </td>;
                })}
                <td className="sticky right-0 z-10 border-b border-l border-fantasy-700/25 bg-midnight-950 p-2 text-center font-bold capitalize text-yellow-100">{proficiencyRanks[finalRank]}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </section>

      {availableAbilities.length > 0 && <section>
        <h3 className="font-fantasy text-xl font-bold text-white">Ability boosts</h3>
        <p className="mt-1 text-sm text-gray-400">Your ancestry, background, class, and four free level-1 boosts remain exactly as imported. At levels 5, 10, 15, and 20, choose four different abilities.</p>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {abilityBoostLevels.map(level => {
            const selectedAbilities = planner.abilityBoosts.filter(boost => boost.level === level).map(boost => boost.ability);
            return <article key={level} className="rounded-xl border border-fantasy-700/35 bg-fantasy-900/25 p-4">
              <div className="mb-3 flex items-center justify-between"><h4 className="font-fantasy text-lg font-bold text-white">Level {level}</h4><span className={`rounded-full px-2.5 py-1 text-xs font-black ${selectedAbilities.length === 4 ? 'bg-emerald-500/15 text-emerald-200' : 'bg-amber-500/15 text-amber-200'}`}>{selectedAbilities.length}/4 boosts</span></div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {availableAbilities.map(ability => {
                  const selected = selectedAbilities.includes(ability);
                  const disabled = !selected && selectedAbilities.length >= 4;
                  const score = abilityScore(actor, ability, planner, level);
                  const modifier = score === undefined ? undefined : abilityModifier(score);
                  const partial = score !== undefined && isPartialAbilityBoost(score);
                  return <button
                    type="button"
                    key={ability}
                    aria-pressed={selected}
                    disabled={disabled}
                    onClick={() => toggleAbilityBoost(ability, level, !selected)}
                    className={`min-w-0 rounded-lg border p-3 text-left transition-colors ${selected ? 'border-yellow-300/55 bg-yellow-500/15 text-white' : 'border-fantasy-700/35 bg-midnight-950/45 text-gray-400 hover:border-yellow-300/35'} disabled:cursor-not-allowed disabled:opacity-35`}
                  >
                    <span className="flex items-center justify-between gap-2"><strong className="truncate text-xs uppercase tracking-wide">{abilityLabels[ability]}</strong><b className="text-yellow-200">{modifier === undefined ? '—' : `${modifier >= 0 ? '+' : ''}${modifier}${partial ? '½' : ''}`}</b></span>
                    <small className="mt-1 block text-[10px] text-gray-500">{score === undefined ? 'No source value' : `Score ${score}${partial ? ' · partial boost' : ''}`}</small>
                  </button>;
                })}
              </div>
            </article>;
          })}
        </div>
      </section>}
    </div>
  );
};

export default CharacterLevelPlanner;
