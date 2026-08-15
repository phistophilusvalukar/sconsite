import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, FileJson, Loader2, Shield } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import CharacterLevelPlanner from '../features/characters/CharacterLevelPlanner';
import { CharacterService } from '../services/characterService';
import type { Character, FoundryJsonEntry } from '../types/database';

const CharacterPlannerPage: React.FC = () => {
  const { characterId } = useParams<{ characterId: string }>();
  const { isAuthenticated, user } = useAuth();
  const characterService = useMemo(() => CharacterService.getInstance(), []);
  const [character, setCharacter] = useState<Character | null>(null);
  const [foundryFiles, setFoundryFiles] = useState<FoundryJsonEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadPlanner = useCallback(async () => {
    if (!characterId || !user?.id) return;
    setIsLoading(true);
    const characterResponse = await characterService.getCharacterById(characterId);
    if (!characterResponse.success || !characterResponse.data) {
      setLoadError(characterResponse.error || 'Character not found.');
      setIsLoading(false);
      return;
    }
    if (characterResponse.data.userId !== user.id) {
      setLoadError('Only the character owner can open this planner.');
      setIsLoading(false);
      return;
    }
    const foundryResponse = await characterService.getFoundryFiles(characterId);
    setCharacter(characterResponse.data);
    setFoundryFiles(foundryResponse.data || []);
    setLoadError(foundryResponse.success ? '' : (foundryResponse.error || 'Unable to load Foundry files.'));
    setIsLoading(false);
  }, [characterId, characterService, user?.id]);

  useEffect(() => { void loadPlanner(); }, [loadPlanner]);

  if (!isAuthenticated) {
    return <main className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center gap-4 px-6 text-center text-gray-200"><Shield className="h-10 w-10 text-yellow-300" /><h1 className="font-fantasy text-3xl font-bold text-white">Sign in to use the Foundry planner.</h1></main>;
  }

  if (isLoading) {
    return <main className="flex min-h-[60vh] items-center justify-center gap-3 text-gray-300"><Loader2 className="h-7 w-7 animate-spin text-yellow-300" /> Loading planner...</main>;
  }

  if (!character || loadError) {
    return <main className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center gap-4 px-6 text-center text-gray-200"><Shield className="h-10 w-10 text-yellow-300" /><h1 className="font-fantasy text-3xl font-bold text-white">{loadError || 'Character not found.'}</h1><Link className="text-yellow-300 hover:text-yellow-200" to={characterId ? `/characters/${characterId}` : '/characters'}>Return to character profile</Link></main>;
  }

  const activeFoundryEntry = foundryFiles.find(file => file.isActive) || foundryFiles[0];
  const activeFoundryJson = activeFoundryEntry?.json || character.foundryJson;

  return (
    <main className="min-h-screen bg-midnight-950 px-4 py-8 text-gray-100 sm:px-6 lg:px-10">
      <div className="mx-auto w-full max-w-[1600px]">
        <nav className="mb-6">
          <Link to={`/characters/${character._id}`} className="inline-flex items-center gap-2 rounded-lg border border-fantasy-700/40 bg-fantasy-900/40 px-4 py-2 text-sm font-semibold text-gray-200 transition-colors hover:border-yellow-400/40 hover:text-white"><ArrowLeft className="h-4 w-4" /> Back to {character.name}</Link>
        </nav>
        <header className="mb-6 rounded-2xl border border-fantasy-700/40 bg-fantasy-900/30 p-6 shadow-xl">
          <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-yellow-300"><FileJson className="h-5 w-5" /> Foundry JSON planner</p>
          <h1 className="mt-2 font-fantasy text-3xl font-bold text-white sm:text-4xl">{character.name}</h1>
          <p className="mt-2 max-w-3xl text-gray-300">Plan level choices and export a Foundry-ready JSON from the character's active file.</p>
        </header>
        <section className="rounded-2xl border border-fantasy-700/40 bg-midnight-900/70 p-4 shadow-2xl sm:p-6 lg:p-8">
          {activeFoundryJson
            ? <CharacterLevelPlanner characterName={character.name} sourceJson={activeFoundryJson} sourceFile={activeFoundryEntry} onFileUpdated={updated => setFoundryFiles(current => current.map(file => file.id === updated.id ? updated : file))} />
            : <div className="rounded-lg border border-fantasy-700/40 bg-fantasy-900/30 p-6 text-gray-300">Add a Foundry JSON from the Foundry tab on the character profile before using the planner.</div>}
        </section>
      </div>
    </main>
  );
};

export default CharacterPlannerPage;
