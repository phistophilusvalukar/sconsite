import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Check,
  Clock,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Ticket,
  UserCheck,
  Users
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Character, GameApplication, GameApplicationStatus, GameListing, SchedulePoll } from '../types/database';
import GameService, { getTierForLevel } from '../services/gameService';
import ScheduleService from '../services/scheduleService';
import CharacterService from '../services/characterService';

const defaultTags = ['Exploration', 'Combat', 'Roleplay', 'Downtime', 'Dungeon', 'Hexcrawl', 'One-shot'];

interface GameFormState {
  title: string;
  description: string;
  rewardCharacterId: string;
  schedulePollId: string;
  startLocal: string;
  durationMinutes: number;
  characterLevel: number;
  partySize: number;
  tags: string[];
  manualInviteUserId: string;
  manualInviteName: string;
  invitedUserIds: string[];
}

const GamesPage: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const gameService = useMemo(() => GameService.getInstance(), []);
  const scheduleService = useMemo(() => ScheduleService.getInstance(), []);
  const characterService = useMemo(() => CharacterService.getInstance(), []);
  const [games, setGames] = useState<GameListing[]>([]);
  const [polls, setPolls] = useState<SchedulePoll[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showCreateGame, setShowCreateGame] = useState(false);
  const [applicationCharacters, setApplicationCharacters] = useState<Record<string, string[]>>({});
  const [applicationNotes, setApplicationNotes] = useState<Record<string, string>>({});
  const [filters, setFilters] = useState({
    query: '',
    tag: '',
    tier: '',
    date: ''
  });
  const [form, setForm] = useState<GameFormState>(() => createInitialForm());

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [gameResponse, pollResponse, characterResponse] = await Promise.all([
        gameService.getGames(),
        scheduleService.getPolls(),
        user?.id ? characterService.getUserCharacters(user.id) : Promise.resolve({ success: true, data: [] as Character[] })
      ]);

      if (gameResponse.success && gameResponse.data) {
        setGames(gameResponse.data);
      } else {
        console.error('Failed to load games:', gameResponse.error);
      }

      if (pollResponse.success && pollResponse.data) {
        setPolls(pollResponse.data.filter(poll => poll.creatorId === user?.id));
      }

      if (characterResponse.success && characterResponse.data) {
        setCharacters(characterResponse.data.filter(character => character.isActive));
      }
    } finally {
      setIsLoading(false);
    }
  }, [characterService, gameService, scheduleService, user?.id]);

  useEffect(() => {
    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }

    loadData();
  }, [isAuthenticated, loadData]);

  useEffect(() => {
    if (characters.length > 0 && !form.rewardCharacterId) {
      setForm(prev => ({ ...prev, rewardCharacterId: characters[0]._id || '' }));
    }
  }, [characters, form.rewardCharacterId]);

  const visibleGames = useMemo(() => {
    return games
      .filter(game => game.status === 'Open')
      .filter(game => {
        const query = filters.query.trim().toLowerCase();
        if (!query) return true;
        return [game.title, game.description, game.gmName, ...game.tags]
          .some(value => value.toLowerCase().includes(query));
      })
      .filter(game => !filters.tag || game.tags.includes(filters.tag))
      .filter(game => !filters.tier || game.tier === filters.tier)
      .filter(game => !filters.date || toDateInputValue(game.startTime) === filters.date)
      .sort((first, second) => first.startTime.getTime() - second.startTime.getTime());
  }, [filters, games]);

  const confirmedGames = useMemo(() => {
    const now = Date.now();
    return games
      .filter(game => game.status === 'Closed' && game.startTime.getTime() >= now)
      .sort((first, second) => first.startTime.getTime() - second.startTime.getTime());
  }, [games]);

  const allTags = useMemo(() => {
    return Array.from(new Set([...defaultTags, ...games.flatMap(game => game.tags)])).sort();
  }, [games]);

  const selectedPoll = polls.find(poll => poll._id === form.schedulePollId);
  const selectedPollParticipants = selectedPoll?.participants || [];
  const selectedTier = getTierForLevel(form.characterLevel);

  const handlePollSelect = (pollId: string) => {
    const poll = polls.find(item => item._id === pollId);
    if (!poll) {
      setForm(prev => ({ ...prev, schedulePollId: '' }));
      return;
    }

    const startTime = poll.selectedSlotStart || pollStartFallback(poll);
    setForm(prev => ({
      ...prev,
      schedulePollId: pollId,
      title: prev.title || poll.title,
      description: prev.description || poll.description,
      startLocal: toDateTimeLocalValue(startTime),
      invitedUserIds: poll.participants.map(participant => participant.userId)
    }));
  };

  const handleCreateGame = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user?.id || !form.rewardCharacterId) return;

    setIsSaving(true);
    try {
      const pollInvites = selectedPollParticipants
        .filter(participant => form.invitedUserIds.includes(participant.userId))
        .map(participant => ({
          userId: participant.userId,
          displayName: participant.displayName,
          source: 'Poll' as const
        }));
      const manualInvite = form.manualInviteUserId.trim()
        ? [{
          userId: form.manualInviteUserId.trim(),
          displayName: form.manualInviteName.trim() || form.manualInviteUserId.trim(),
          source: 'Manual' as const
        }]
        : [];

      const result = await gameService.createGame({
        title: form.title,
        description: form.description,
        gmId: user.id,
        gmName: user.username,
        rewardCharacterId: form.rewardCharacterId,
        schedulePollId: form.schedulePollId || undefined,
        startTime: new Date(form.startLocal),
        durationMinutes: form.durationMinutes,
        characterLevel: form.characterLevel,
        partySize: form.partySize,
        tags: form.tags,
        invites: [...pollInvites, ...manualInvite]
      });

      if (result.success) {
        setShowCreateGame(false);
        setForm(createInitialForm(characters[0]?._id));
        await loadData();
      } else {
        alert(result.error || 'Failed to create game');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleApply = async (game: GameListing) => {
    if (!user?.id || !game._id) return;
    const characterIds = applicationCharacters[game._id] || [];
    if (characterIds.length === 0) {
      alert('Pick at least one character to apply.');
      return;
    }

    const result = await gameService.applyToGame({
      gameId: game._id,
      userId: user.id,
      displayName: user.username,
      characterIds,
      note: applicationNotes[game._id] || ''
    });

    if (result.success) {
      await loadData();
    } else {
      alert(result.error || 'Failed to apply');
    }
  };

  const handleApplicationStatus = async (application: GameApplication, status: GameApplicationStatus) => {
    if (!application._id) return;
    const result = await gameService.updateApplicationStatus(application._id, status);
    if (result.success) {
      await loadData();
    } else {
      alert(result.error || 'Failed to update application');
    }
  };

  const handleLockCharacter = async (application: GameApplication, characterId: string) => {
    if (!application._id) return;
    const result = await gameService.lockCharacter(application._id, characterId);
    if (result.success) {
      await loadData();
    } else {
      alert(result.error || 'Failed to lock character');
    }
  };

  const handleCloseGame = async (game: GameListing) => {
    if (!game._id || !user?.id) return;
    const result = await gameService.updateGameStatus(game._id, user.id, 'Closed');
    if (result.success) {
      await loadData();
    } else {
      alert(result.error || 'Failed to confirm game');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <Ticket className="w-16 h-16 text-yellow-400 mx-auto mb-6" />
          <h1 className="font-fantasy text-4xl font-bold text-white mb-6">Game Listings</h1>
          <p className="text-xl text-gray-300">Please log in to create and join games.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-8">
          <div>
            <h1 className="font-fantasy text-4xl font-bold text-white mb-2">Game Listings</h1>
            <p className="text-gray-300">Post adventures, build a roster, and turn confirmed games into the upcoming table timeline.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateGame(true)}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-midnight-900 font-bold rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>Create Game</span>
          </button>
        </div>

        {isLoading ? (
          <div className="text-center py-16">
            <Loader2 className="w-8 h-8 text-yellow-400 mx-auto mb-4 animate-spin" />
            <p className="text-gray-300">Loading games...</p>
          </div>
        ) : (
          <div className="space-y-8">
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-5 h-5 text-yellow-400" />
                <h2 className="font-fantasy text-2xl font-bold text-white">Upcoming Tickets</h2>
              </div>
              {confirmedGames.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {confirmedGames.map(game => <GameTicket key={game._id} game={game} />)}
                </div>
              ) : (
                <div className="border border-fantasy-700/30 bg-fantasy-900/25 rounded-lg p-6 text-gray-300">
                  No confirmed games are on the timeline yet.
                </div>
              )}
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-6">
              <aside className="border border-fantasy-700/30 bg-fantasy-900/25 rounded-lg p-4 h-fit">
                <div className="flex items-center gap-2 mb-4">
                  <Search className="w-5 h-5 text-yellow-400" />
                  <h2 className="text-lg font-bold text-white">Find a Table</h2>
                </div>
                <div className="space-y-4">
                  <input
                    type="search"
                    value={filters.query}
                    onChange={(event) => setFilters(prev => ({ ...prev, query: event.target.value }))}
                    placeholder="Title, GM, tag"
                    className="w-full p-3 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white placeholder-gray-400"
                  />
                  <select
                    value={filters.tag}
                    onChange={(event) => setFilters(prev => ({ ...prev, tag: event.target.value }))}
                    className="w-full p-3 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white"
                  >
                    <option value="">Any tag</option>
                    {allTags.map(tag => <option key={tag} value={tag}>{tag}</option>)}
                  </select>
                  <select
                    value={filters.tier}
                    onChange={(event) => setFilters(prev => ({ ...prev, tier: event.target.value }))}
                    className="w-full p-3 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white"
                  >
                    <option value="">Any tier</option>
                    {['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4', 'Tier 5'].map(tier => <option key={tier} value={tier}>{tier}</option>)}
                  </select>
                  <input
                    type="date"
                    value={filters.date}
                    onChange={(event) => setFilters(prev => ({ ...prev, date: event.target.value }))}
                    className="w-full p-3 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white"
                  />
                </div>
              </aside>

              <div className="space-y-4">
                {visibleGames.map(game => (
                  <GameListingCard
                    key={game._id}
                    game={game}
                    userId={user?.id || ''}
                    characters={characters}
                    selectedCharacterIds={applicationCharacters[game._id || ''] || []}
                    applicationNote={applicationNotes[game._id || ''] || ''}
                    onToggleCharacter={(characterId) => {
                      const gameId = game._id || '';
                      setApplicationCharacters(prev => ({
                        ...prev,
                        [gameId]: toggleInArray(prev[gameId] || [], characterId)
                      }));
                    }}
                    onNoteChange={(note) => setApplicationNotes(prev => ({ ...prev, [game._id || '']: note }))}
                    onApply={() => handleApply(game)}
                    onApplicationStatus={handleApplicationStatus}
                    onLockCharacter={handleLockCharacter}
                    onCloseGame={() => handleCloseGame(game)}
                  />
                ))}
                {visibleGames.length === 0 && (
                  <div className="border border-fantasy-700/30 bg-fantasy-900/25 rounded-lg p-10 text-center">
                    <CalendarDays className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <h2 className="text-xl font-bold text-white mb-2">No open games match those filters</h2>
                    <p className="text-gray-300">Clear a filter or create the next table.</p>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {showCreateGame && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <form onSubmit={handleCreateGame} className="bg-fantasy-900 border border-fantasy-700 rounded-xl p-6 max-w-5xl w-full max-h-[92vh] overflow-y-auto">
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
                <div className="space-y-4">
                  <h2 className="text-2xl font-bold text-white">Create Game Listing</h2>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(event) => setForm(prev => ({ ...prev, title: event.target.value }))}
                    required
                    placeholder="Game title"
                    className="w-full p-3 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white placeholder-gray-400"
                  />
                  <textarea
                    value={form.description}
                    onChange={(event) => setForm(prev => ({ ...prev, description: event.target.value }))}
                    rows={4}
                    required
                    placeholder="Pitch, stakes, safety notes, or table expectations"
                    className="w-full p-3 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white placeholder-gray-400 resize-none"
                  />
                  <label className="block text-sm text-gray-300">
                    GM reward character
                    <select
                      value={form.rewardCharacterId}
                      onChange={(event) => setForm(prev => ({ ...prev, rewardCharacterId: event.target.value }))}
                      required
                      className="block mt-1 w-full p-3 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white"
                    >
                      {characters.map(character => (
                        <option key={character._id} value={character._id}>
                          {character.name} - level {character.level}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="block text-sm text-gray-300">
                      Starts
                      <input
                        type="datetime-local"
                        value={form.startLocal}
                        onChange={(event) => setForm(prev => ({ ...prev, startLocal: event.target.value }))}
                        required
                        className="block mt-1 w-full p-3 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white"
                      />
                    </label>
                    <label className="block text-sm text-gray-300">
                      Duration
                      <select
                        value={form.durationMinutes}
                        onChange={(event) => setForm(prev => ({ ...prev, durationMinutes: Number(event.target.value) }))}
                        className="block mt-1 w-full p-3 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white"
                      >
                        <option value={120}>2 hours</option>
                        <option value={180}>3 hours</option>
                        <option value={240}>4 hours</option>
                        <option value={300}>5 hours</option>
                        <option value={360}>6 hours</option>
                      </select>
                    </label>
                    <label className="block text-sm text-gray-300">
                      Character level
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={form.characterLevel}
                        onChange={(event) => setForm(prev => ({ ...prev, characterLevel: Number(event.target.value) }))}
                        required
                        className="block mt-1 w-full p-3 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white"
                      />
                    </label>
                    <label className="block text-sm text-gray-300">
                      Party size
                      <input
                        type="number"
                        min={1}
                        max={12}
                        value={form.partySize}
                        onChange={(event) => setForm(prev => ({ ...prev, partySize: Number(event.target.value) }))}
                        required
                        className="block mt-1 w-full p-3 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white"
                      />
                    </label>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-2 text-sm text-gray-300">
                      <Sparkles className="w-4 h-4 text-yellow-400" />
                      <span>{selectedTier} will be added automatically</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {defaultTags.map(tag => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setForm(prev => ({ ...prev, tags: toggleInArray(prev.tags, tag) }))}
                          className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                            form.tags.includes(tag)
                              ? 'bg-yellow-500 text-midnight-900'
                              : 'bg-fantasy-800/60 text-gray-200 hover:bg-fantasy-700'
                          }`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <aside className="space-y-4">
                  <div className="bg-fantasy-800/40 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <CalendarDays className="w-5 h-5 text-yellow-400" />
                      <h3 className="font-bold text-white">Poll Prefill</h3>
                    </div>
                    <select
                      value={form.schedulePollId}
                      onChange={(event) => handlePollSelect(event.target.value)}
                      className="w-full p-3 bg-fantasy-900/60 border border-fantasy-700/30 rounded-lg text-white"
                    >
                      <option value="">No poll</option>
                      {polls.map(poll => (
                        <option key={poll._id} value={poll._id}>
                          {poll.title}
                        </option>
                      ))}
                    </select>
                    {selectedPoll && (
                      <p className="text-xs text-gray-400 mt-3">
                        {selectedPoll.selectedSlotStart ? 'Using the organizer-selected poll time.' : 'Using the poll window start as a draft time.'}
                      </p>
                    )}
                  </div>

                  <div className="bg-fantasy-800/40 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Users className="w-5 h-5 text-yellow-400" />
                      <h3 className="font-bold text-white">Party Invites</h3>
                    </div>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {selectedPollParticipants.map(participant => (
                        <label key={participant.userId} className="flex items-center gap-2 text-sm text-gray-200">
                          <input
                            type="checkbox"
                            checked={form.invitedUserIds.includes(participant.userId)}
                            onChange={() => setForm(prev => ({ ...prev, invitedUserIds: toggleInArray(prev.invitedUserIds, participant.userId) }))}
                            className="h-4 w-4"
                          />
                          <span>{participant.displayName}</span>
                        </label>
                      ))}
                      {selectedPollParticipants.length === 0 && (
                        <p className="text-sm text-gray-400">Select a poll to invite its participants.</p>
                      )}
                    </div>
                    <div className="mt-4 space-y-2">
                      <input
                        type="text"
                        value={form.manualInviteName}
                        onChange={(event) => setForm(prev => ({ ...prev, manualInviteName: event.target.value }))}
                        placeholder="Invite name"
                        className="w-full p-2 bg-fantasy-900/60 border border-fantasy-700/30 rounded-lg text-white placeholder-gray-400"
                      />
                      <input
                        type="text"
                        value={form.manualInviteUserId}
                        onChange={(event) => setForm(prev => ({ ...prev, manualInviteUserId: event.target.value }))}
                        placeholder="Player auth user ID"
                        className="w-full p-2 bg-fantasy-900/60 border border-fantasy-700/30 rounded-lg text-white placeholder-gray-400"
                      />
                    </div>
                  </div>
                </aside>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-6">
                <button
                  type="button"
                  onClick={() => setShowCreateGame(false)}
                  className="flex-1 px-4 py-3 bg-fantasy-700 hover:bg-fantasy-600 text-white rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving || characters.length === 0}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-600 text-midnight-900 font-bold rounded-lg"
                >
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Create Game</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

interface GameListingCardProps {
  game: GameListing;
  userId: string;
  characters: Character[];
  selectedCharacterIds: string[];
  applicationNote: string;
  onToggleCharacter: (characterId: string) => void;
  onNoteChange: (note: string) => void;
  onApply: () => void;
  onApplicationStatus: (application: GameApplication, status: GameApplicationStatus) => void;
  onLockCharacter: (application: GameApplication, characterId: string) => void;
  onCloseGame: () => void;
}

const GameListingCard: React.FC<GameListingCardProps> = ({
  game,
  userId,
  characters,
  selectedCharacterIds,
  applicationNote,
  onToggleCharacter,
  onNoteChange,
  onApply,
  onApplicationStatus,
  onLockCharacter,
  onCloseGame
}) => {
  const isGm = game.gmId === userId;
  const ownApplication = game.applications.find(application => application.userId === userId);
  const roster = game.applications.filter(application => application.status === 'Roster');
  const onDeck = game.applications.filter(application => application.status === 'On Deck');
  const invited = game.invites.some(invite => invite.userId === userId);

  return (
    <article className="border border-fantasy-700/30 bg-fantasy-900/25 rounded-lg p-5">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h3 className="font-fantasy text-2xl font-bold text-white">{game.title}</h3>
            {invited && <span className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-200 text-xs font-bold">Invited</span>}
          </div>
          <p className="text-gray-300 mb-3">{game.description}</p>
          <div className="flex flex-wrap gap-3 text-sm text-gray-300">
            <span className="flex items-center gap-1"><CalendarDays className="w-4 h-4 text-yellow-400" />{formatDateTime(game.startTime)}</span>
            <span className="flex items-center gap-1"><Clock className="w-4 h-4 text-yellow-400" />{formatDuration(game.durationMinutes)}</span>
            <span className="flex items-center gap-1"><Users className="w-4 h-4 text-yellow-400" />{roster.length}/{game.partySize} rostered</span>
            <span>Level {game.characterLevel}</span>
            <span>{game.tier}</span>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {game.tags.map(tag => (
              <span key={tag} className="px-2 py-1 rounded bg-fantasy-800/60 text-gray-200 text-xs font-semibold">{tag}</span>
            ))}
          </div>
        </div>
        <div className="text-sm text-gray-300 lg:text-right">
          <p className="font-bold text-white">GM {game.gmName}</p>
          {game.rewardCharacter && (
            <p>{game.rewardCharacter.name} earns rewards</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-5">
        <div className="bg-midnight-900/30 rounded-lg p-4">
          <h4 className="font-bold text-white mb-3">Roster</h4>
          <ApplicantList label="Playing" applications={roster} />
          <ApplicantList label="On Deck" applications={onDeck} />
        </div>

        {isGm ? (
          <div className="bg-midnight-900/30 rounded-lg p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h4 className="font-bold text-white">Applicants</h4>
              <button
                type="button"
                onClick={onCloseGame}
                className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold"
              >
                <Ticket className="w-4 h-4" />
                <span>Confirm Closed</span>
              </button>
            </div>
            <div className="space-y-3">
              {game.applications.map(application => (
                <div key={application._id} className="border border-fantasy-700/30 rounded-lg p-3">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div>
                      <p className="font-semibold text-white">{application.displayName}</p>
                      <p className="text-sm text-gray-300">{formatCharacters(application)}</p>
                      {application.note && <p className="text-sm text-gray-400 mt-1">{application.note}</p>}
                    </div>
                    <span className="text-xs font-bold text-yellow-300">{application.status}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {(['Roster', 'On Deck', 'Declined'] as GameApplicationStatus[]).map(status => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => onApplicationStatus(application, status)}
                        className="px-3 py-2 rounded bg-fantasy-700 hover:bg-fantasy-600 text-white text-sm"
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {game.applications.length === 0 && <p className="text-sm text-gray-400">No applications yet.</p>}
            </div>
          </div>
        ) : (
          <div className="bg-midnight-900/30 rounded-lg p-4">
            <h4 className="font-bold text-white mb-3">{ownApplication ? 'Your Application' : 'Apply to Join'}</h4>
            {ownApplication ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-300">Status: <span className="font-bold text-yellow-300">{ownApplication.status}</span></p>
                <p className="text-sm text-gray-300">Offered: {formatCharacters(ownApplication)}</p>
                <label className="block text-sm text-gray-300">
                  Lock in character
                  <select
                    value={ownApplication.lockedCharacterId || ''}
                    onChange={(event) => event.target.value && onLockCharacter(ownApplication, event.target.value)}
                    className="block mt-1 w-full p-2 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white"
                  >
                    <option value="">Not locked</option>
                    {ownApplication.characters.map(character => (
                      <option key={character._id} value={character._id}>{character.name}</option>
                    ))}
                  </select>
                </label>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {characters.map(character => (
                    <label key={character._id} className="flex items-center gap-2 rounded border border-fantasy-700/30 p-2 text-sm text-gray-200">
                      <input
                        type="checkbox"
                        checked={selectedCharacterIds.includes(character._id || '')}
                        onChange={() => character._id && onToggleCharacter(character._id)}
                        className="h-4 w-4"
                      />
                      <span>{character.name} L{character.level}</span>
                    </label>
                  ))}
                </div>
                <textarea
                  value={applicationNote}
                  onChange={(event) => onNoteChange(event.target.value)}
                  rows={2}
                  placeholder="Application note"
                  className="w-full p-2 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white placeholder-gray-400 resize-none"
                />
                <button
                  type="button"
                  onClick={onApply}
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-yellow-500 hover:bg-yellow-400 text-midnight-900 font-bold rounded-lg"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Apply</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
};

const ApplicantList: React.FC<{ label: string; applications: GameApplication[] }> = ({ label, applications }) => (
  <div className="mb-3 last:mb-0">
    <p className="text-sm font-semibold text-yellow-300 mb-1">{label}</p>
    <div className="space-y-1">
      {applications.map(application => (
        <div key={application._id} className="flex items-center gap-2 text-sm text-gray-200">
          <Check className="w-4 h-4 text-emerald-300" />
          <span>{application.displayName}</span>
          <span className="text-gray-400">{application.lockedCharacterId ? formatLockedCharacter(application) : formatCharacters(application)}</span>
        </div>
      ))}
      {applications.length === 0 && <p className="text-sm text-gray-500">Empty</p>}
    </div>
  </div>
);

const GameTicket: React.FC<{ game: GameListing }> = ({ game }) => {
  const roster = game.applications.filter(application => application.status === 'Roster');

  return (
    <article className="relative overflow-hidden border border-yellow-400/40 bg-gradient-to-br from-yellow-500/15 via-fantasy-900/45 to-midnight-900/70 rounded-lg p-5">
      <div className="absolute left-0 top-0 h-full w-1 bg-yellow-400" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-yellow-300 mb-2">
            <Ticket className="w-5 h-5" />
            <span className="text-xs font-bold uppercase tracking-widest">Confirmed Table</span>
          </div>
          <h3 className="font-fantasy text-2xl font-bold text-white">{game.title}</h3>
          <p className="text-gray-300 mt-1">{formatDateTime(game.startTime)} with GM {game.gmName}</p>
        </div>
        <span className="rounded bg-midnight-900/70 px-3 py-1 text-sm font-bold text-yellow-200">{game.tier}</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {roster.map(application => (
          <span key={application._id} className="rounded bg-emerald-500/20 px-3 py-1 text-sm text-emerald-100">
            {application.displayName}: {application.lockedCharacterId ? formatLockedCharacter(application) : formatCharacters(application)}
          </span>
        ))}
        {roster.length === 0 && <span className="text-sm text-gray-400">Roster pending</span>}
      </div>
    </article>
  );
};

const createInitialForm = (rewardCharacterId = ''): GameFormState => ({
  title: '',
  description: '',
  rewardCharacterId,
  schedulePollId: '',
  startLocal: toDateTimeLocalValue(getDefaultStartTime()),
  durationMinutes: 240,
  characterLevel: 1,
  partySize: 4,
  tags: [],
  manualInviteUserId: '',
  manualInviteName: '',
  invitedUserIds: []
});

const pollStartFallback = (poll: SchedulePoll) => {
  const date = new Date(`${poll.dateStart}T00:00:00`);
  date.setMinutes(poll.startMinutes);
  return date;
};

const getDefaultStartTime = () => {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  date.setHours(18, 0, 0, 0);
  return date;
};

const toggleInArray = (values: string[], value: string) =>
  values.includes(value) ? values.filter(item => item !== value) : [...values, value];

const toDateTimeLocalValue = (date: Date) => {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
};

const toDateInputValue = (date: Date) => {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
};

const formatDateTime = (date: Date) =>
  new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);

const formatDuration = (minutes: number) => {
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours} hours` : `${minutes} minutes`;
};

const formatCharacters = (application: GameApplication) =>
  application.characters.length > 0
    ? application.characters.map(character => `${character.name} L${character.level}`).join(', ')
    : `${application.characterIds.length} character${application.characterIds.length === 1 ? '' : 's'}`;

const formatLockedCharacter = (application: GameApplication) => {
  const character = application.characters.find(item => item._id === application.lockedCharacterId);
  return character ? `${character.name} L${character.level}` : 'Locked character';
};

export default GamesPage;
