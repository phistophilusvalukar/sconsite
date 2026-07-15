import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Ban,
  CalendarDays,
  Check,
  Clock,
  Heart,
  Loader2,
  MessageCircle,
  Plus,
  Save,
  Search,
  Sparkles,
  Ticket,
  UserCheck,
  Users,
  X
} from 'lucide-react';
import { DATABASE_TABLES } from '../config/database';
import { useAuth } from '../context/useAuth';
import { usePageVisibility } from '../context/usePageVisibility';
import { useSupabaseRealtime } from '../hooks/useSupabaseRealtime';
import { Character, GameApplication, GameApplicationStatus, GameArchiveComment, GameListing, GameRewardsBonus, GameStatus, SchedulePoll } from '../types/database';
import GameService, { getTierForLevel } from '../services/gameService';
import ScheduleService from '../services/scheduleService';
import CharacterService from '../services/characterService';
import { roleNameTone, rolePillTone } from '../utils/characterRoles';
import CharacterRoleBadges from '../components/CharacterRoleBadges';

const defaultTags = ['Exploration', 'Combat', 'Roleplay', 'Downtime', 'Dungeon', 'Hexcrawl', 'One-shot'];
const tierTags = ['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4', 'Tier 5'];
const rewardBonusOptions: GameRewardsBonus[] = [0, 5, 10, 15, 20];
const rewardTable: Record<number, Record<GameRewardsBonus, number>> = {
  1: { 0: 22, 5: 23.1, 10: 24.2, 15: 25.3, 20: 26.4 },
  2: { 0: 38, 5: 39.9, 10: 41.8, 15: 43.7, 20: 45.6 },
  3: { 0: 63, 5: 66.15, 10: 69.3, 15: 72.45, 20: 75.6 },
  4: { 0: 71, 5: 74.55, 10: 78.1, 15: 81.65, 20: 85.2 },
  5: { 0: 115, 5: 120.75, 10: 126.5, 15: 132.25, 20: 138 },
  6: { 0: 165, 5: 173.25, 10: 181.5, 15: 189.75, 20: 198 },
  7: { 0: 240, 5: 252, 10: 264, 15: 276, 20: 288 },
  8: { 0: 335, 5: 351.75, 10: 368.5, 15: 385.25, 20: 402 },
  9: { 0: 475, 5: 498.75, 10: 522.5, 15: 546.25, 20: 570 },
  10: { 0: 500, 5: 525, 10: 550, 15: 575, 20: 600 },
  11: { 0: 720, 5: 756, 10: 792, 15: 828, 20: 864 },
  12: { 0: 1030, 5: 1081.5, 10: 1133, 15: 1184.5, 20: 1236 },
  13: { 0: 1560, 5: 1638, 10: 1716, 15: 1794, 20: 1872 },
  14: { 0: 2280, 5: 2394, 10: 2508, 15: 2622, 20: 2736 },
  15: { 0: 3410, 5: 3580.5, 10: 3751, 15: 3921.5, 20: 4092 },
  16: { 0: 4130, 5: 4336.5, 10: 4543, 15: 4749.5, 20: 4956 },
  17: { 0: 6400, 5: 6720, 10: 7040, 15: 7360, 20: 7680 },
  18: { 0: 10400, 5: 10920, 10: 11440, 15: 11960, 20: 12480 },
  19: { 0: 17750, 5: 18637.5, 10: 19525, 15: 20412.5, 20: 21300 },
  20: { 0: 24500, 5: 25725, 10: 26950, 15: 28175, 20: 29400 }
};

type GamesTab = 'open' | 'upcoming' | 'archive';

interface ManualInvite {
  userId: string;
  displayName: string;
  characterName: string;
}

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
  manualInvites: ManualInvite[];
  invitedUserIds: string[];
}

interface ApplicationModalState {
  gameId: string;
  characterId: string;
  note: string;
}

const GamesPage: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const { isPageEnabled } = usePageVisibility();
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
    date: '',
    myGames: false
  });
  const [form, setForm] = useState<GameFormState>(() => createInitialForm());
  const [tagSearch, setTagSearch] = useState('');
  const [isTagSearchFocused, setIsTagSearchFocused] = useState(false);
  const [inviteSearch, setInviteSearch] = useState('');
  const [inviteResults, setInviteResults] = useState<Character[]>([]);
  const [isInviteSearching, setIsInviteSearching] = useState(false);
  const [activeTab, setActiveTab] = useState<GamesTab>('open');
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [applicationModal, setApplicationModal] = useState<ApplicationModalState | null>(null);
  const [ticketBonus, setTicketBonus] = useState<Record<string, GameRewardsBonus>>({});
  const [archiveCommentDrafts, setArchiveCommentDrafts] = useState<Record<string, string>>({});
  const [editingArchiveComments, setEditingArchiveComments] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [gameResponse, pollResponse, characterResponse] = await Promise.all([
        gameService.getGames(user?.id),
        scheduleService.getPolls(),
        user?.id ? characterService.getUserCharacters(user.id) : Promise.resolve({ success: true, data: [] as Character[] })
      ]);

      if (gameResponse.success && gameResponse.data) {
        setGames(gameResponse.data);
        const nextApplicationCharacters: Record<string, string[]> = {};
        const nextApplicationNotes: Record<string, string> = {};
        const nextTicketBonus: Record<string, GameRewardsBonus> = {};
        gameResponse.data.forEach(game => {
          if (game._id) nextTicketBonus[game._id] = game.rewardsBonus;
          const ownApplication = game.applications.find(application => application.userId === user?.id);
          if (game._id && ownApplication) {
            nextApplicationCharacters[game._id] = ownApplication.characterIds;
            nextApplicationNotes[game._id] = ownApplication.note;
          }
        });
        setApplicationCharacters(nextApplicationCharacters);
        setApplicationNotes(nextApplicationNotes);
        setTicketBonus(nextTicketBonus);
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

  useSupabaseRealtime({
    channelName: `games-page-${user?.id || 'anonymous'}`,
    tables: [
      DATABASE_TABLES.GAMES,
      DATABASE_TABLES.GAME_INVITES,
      DATABASE_TABLES.GAME_APPLICATIONS,
      DATABASE_TABLES.GAME_ARCHIVE_COMMENTS,
      DATABASE_TABLES.GAME_ARCHIVE_LIKES,
      DATABASE_TABLES.SCHEDULE_POLLS,
      DATABASE_TABLES.SCHEDULE_PARTICIPANTS,
      DATABASE_TABLES.CHARACTERS
    ],
    onChange: loadData,
    enabled: isAuthenticated
  });

  useEffect(() => {
    if (characters.length > 0 && !form.rewardCharacterId) {
      setForm(prev => ({ ...prev, rewardCharacterId: characters[0]._id || '' }));
    }
  }, [characters, form.rewardCharacterId]);

  useEffect(() => {
    const searchInvites = async () => {
      if (inviteSearch.trim().length < 2) {
        setInviteResults([]);
        return;
      }

      setIsInviteSearching(true);
      try {
        const response = await characterService.searchActiveCharactersByName(inviteSearch, 8);
        if (response.success && response.data) {
          const existingInviteUserIds = new Set([
            user?.id,
            ...form.manualInvites.map(invite => invite.userId),
            ...form.invitedUserIds
          ].filter(Boolean));
          setInviteResults(response.data.filter(character => !existingInviteUserIds.has(character.userId)));
        } else {
          setInviteResults([]);
        }
      } finally {
        setIsInviteSearching(false);
      }
    };

    const debounceTimer = window.setTimeout(searchInvites, 300);
    return () => window.clearTimeout(debounceTimer);
  }, [characterService, form.invitedUserIds, form.manualInvites, inviteSearch, user?.id]);

  const visibleGames = useMemo(() => {
    return games
      .filter(game => {
        if (filters.myGames) {
          return isMyGame(game, user?.id || '') && !isArchivedGame(game);
        }

        return game.status === 'Open';
      })
      .filter(game => {
        const query = filters.query.trim().toLowerCase();
        if (!query) return true;
        return [game.title, game.description, game.gmName, game.tier, ...game.tags]
          .some(value => value.toLowerCase().includes(query));
      })
      .filter(game => !filters.tag || game.tags.includes(filters.tag) || game.tier === filters.tag)
      .filter(game => !filters.tier || game.tier === filters.tier)
      .filter(game => !filters.date || toDateInputValue(game.startTime) === filters.date)
      .sort((first, second) => first.startTime.getTime() - second.startTime.getTime());
  }, [filters, games, user?.id]);

  const confirmedGames = useMemo(() => {
    const now = Date.now();
    return games
      .filter(game => (game.status === 'Closed' || game.status === 'Cancelled') && game.startTime.getTime() >= now)
      .sort((first, second) => first.startTime.getTime() - second.startTime.getTime());
  }, [games]);

  const archivedGames = useMemo(() => {
    const now = Date.now();
    return games
      .filter(game => game.status === 'Completed' || (game.status === 'Cancelled' && game.startTime.getTime() < now))
      .sort((first, second) => second.startTime.getTime() - first.startTime.getTime());
  }, [games]);

  const selectedGame = useMemo(
    () => games.find(game => game._id === selectedGameId) || null,
    [games, selectedGameId]
  );
  const applicationGame = useMemo(
    () => games.find(game => game._id === applicationModal?.gameId) || null,
    [games, applicationModal?.gameId]
  );

  const allTags = useMemo(() => {
    return Array.from(new Set([...defaultTags, ...tierTags, ...games.flatMap(game => game.tags), ...games.map(game => game.tier)])).sort();
  }, [games]);

  const tagSuggestions = useMemo(() => {
    const term = tagSearch.trim().toLowerCase();
    return allTags
      .filter(tag => !term || tag.toLowerCase().includes(term))
      .slice(0, 8);
  }, [allTags, tagSearch]);

  const selectedPoll = polls.find(poll => poll._id === form.schedulePollId);
  const selectedPollParticipants = selectedPoll?.participants || [];
  const selectedTier = getTierForLevel(form.characterLevel);
  const canSeeUnderHaulContracts = Boolean(user?.isAdmin || user?.profile?.isAdmin || isPageEnabled('underhaul-contracts'));

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
      const manualInvites = form.manualInvites.map(invite => ({
        userId: invite.userId,
        displayName: invite.displayName,
        source: 'Manual' as const
      }));

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
        invites: [...pollInvites, ...manualInvites]
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

  const handleTagSelect = (tag: string) => {
    setFilters(prev => ({
      ...prev,
      tag,
      tier: tierTags.includes(tag) ? tag : prev.tier
    }));
    setTagSearch(tag);
    setIsTagSearchFocused(false);
  };

  const handleInviteCharacterSelect = (character: Character) => {
    setForm(prev => {
      if (prev.manualInvites.some(invite => invite.userId === character.userId) || prev.invitedUserIds.includes(character.userId)) {
        return prev;
      }

      return {
        ...prev,
        manualInvites: [
          ...prev.manualInvites,
          {
            userId: character.userId,
            displayName: `${character.name} (L${character.level})`,
            characterName: character.name
          }
        ]
      };
    });
    setInviteSearch('');
    setInviteResults([]);
  };

  const handleRemoveManualInvite = (userId: string) => {
    setForm(prev => ({
      ...prev,
      manualInvites: prev.manualInvites.filter(invite => invite.userId !== userId)
    }));
  };

  const openApplicationModal = (game: GameListing) => {
    if (!game._id) return;
    const ownApplication = game.applications.find(application => application.userId === user?.id);
    setApplicationModal({
      gameId: game._id,
      characterId: ownApplication?.characterIds[0] || applicationCharacters[game._id]?.[0] || characters[0]?._id || '',
      note: ownApplication?.note || applicationNotes[game._id] || ''
    });
  };

  const closeApplicationModal = () => {
    setApplicationModal(null);
  };

  const handleApply = async (game: GameListing, characterId: string, note: string) => {
    if (!user?.id || !game._id) return;
    if (!characterId) {
      alert('Pick one character to apply.');
      return;
    }

    const result = await gameService.applyToGame({
      gameId: game._id,
      userId: user.id,
      displayName: user.username,
      characterIds: [characterId],
      note
    });

    if (result.success) {
      setApplicationCharacters(prev => ({ ...prev, [game._id]: [characterId] }));
      setApplicationNotes(prev => ({ ...prev, [game._id]: note }));
      closeApplicationModal();
      await loadData();
    } else {
      alert(result.error || 'Failed to apply');
    }
  };

  const handleUpdateApplication = async (application: GameApplication, game: GameListing, characterId: string, note: string) => {
    if (!application._id || !game._id) return;
    if (!characterId) {
      alert('Pick one character.');
      return;
    }

    const result = await gameService.updateApplication(application._id, [characterId], note);
    if (result.success) {
      setApplicationCharacters(prev => ({ ...prev, [game._id]: [characterId] }));
      setApplicationNotes(prev => ({ ...prev, [game._id]: note }));
      closeApplicationModal();
      await loadData();
    } else {
      alert(result.error || 'Failed to update application');
    }
  };

  const handleWithdrawApplication = async (application: GameApplication, options: { confirm?: boolean } = { confirm: true }) => {
    if (!application._id) return;
    if (options.confirm !== false) {
      const confirmed = window.confirm('Withdraw your application for this game?');
      if (!confirmed) return;
    }

    const result = await gameService.withdrawApplication(application._id);
    if (result.success) {
      closeApplicationModal();
      await loadData();
    } else {
      alert(result.error || 'Failed to withdraw application');
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

  const handleUpdateGame = async (game: GameListing, updates: GameEditState) => {
    if (!game._id || !user?.id) return;
    const result = await gameService.updateGame(game._id, user.id, {
      title: updates.title,
      description: updates.description,
      startTime: new Date(updates.startLocal),
      durationMinutes: updates.durationMinutes,
      characterLevel: updates.characterLevel,
      partySize: updates.partySize,
      tags: updates.tags
    });
    if (result.success) {
      await loadData();
    } else {
      alert(result.error || 'Failed to update game');
    }
  };

  const handleUpdateGameStatus = async (game: GameListing, status: GameStatus) => {
    if (!game._id || !user?.id) return;
    if (status === 'Cancelled') {
      const confirmed = window.confirm(`Cancel "${game.title}"?`);
      if (!confirmed) return;
    }

    const result = await gameService.updateGameStatus(game._id, user.id, status);
    if (result.success) {
      await loadData();
    } else {
      alert(result.error || 'Failed to update game');
    }
  };

  const handleCompleteGame = async (game: GameListing) => {
    if (!game._id || !user?.id) return;
    const result = await gameService.completeGame(game._id, user.id, ticketBonus[game._id] ?? 0);
    if (result.success) {
      await loadData();
    } else {
      alert(result.error || 'Failed to complete game');
    }
  };

  const handleAddArchiveComment = async (game: GameListing) => {
    if (!game._id || !user?.id) return;
    const body = archiveCommentDrafts[game._id]?.trim();
    if (!body) return;
    const result = await gameService.addArchiveComment(game._id, user.id, user.username, body);
    if (result.success) {
      setArchiveCommentDrafts(prev => ({ ...prev, [game._id || '']: '' }));
      await loadData();
    } else {
      alert(result.error || 'Failed to add comment');
    }
  };

  const handleUpdateArchiveComment = async (comment: GameArchiveComment) => {
    if (!comment._id) return;
    const body = editingArchiveComments[comment._id]?.trim();
    if (!body) return;
    const result = await gameService.updateArchiveComment(comment._id, body);
    if (result.success) {
      setEditingArchiveComments(prev => {
        const next = { ...prev };
        delete next[comment._id || ''];
        return next;
      });
      await loadData();
    } else {
      alert(result.error || 'Failed to update comment');
    }
  };

  const handleDeleteArchiveComment = async (comment: GameArchiveComment) => {
    if (!comment._id) return;
    const result = await gameService.deleteArchiveComment(comment._id);
    if (result.success) {
      await loadData();
    } else {
      alert(result.error || 'Failed to delete comment');
    }
  };

  const handleToggleArchiveLike = async (game: GameListing) => {
    if (!game._id || !user?.id) return;
    const result = await gameService.toggleArchiveLike(game._id, user.id, game.likedByCurrentUser);
    if (result.success) {
      await loadData();
    } else {
      alert(result.error || 'Failed to update like');
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

        {canSeeUnderHaulContracts && (
          <section className="mb-8 rounded-lg border border-yellow-400/40 bg-gradient-to-br from-yellow-500/15 via-fantasy-900/35 to-midnight-900/70 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-bold uppercase tracking-widest text-yellow-300">Playable office job</p>
                <h2 className="font-fantasy text-2xl font-bold text-white">UnderHaul Contracts Office</h2>
                <p className="mt-2 max-w-3xl text-gray-300">
                Inspect fantasy dungeon-service case folders, compare documents, flag evidence, question visitors, and submit contract rulings.
                </p>
              </div>
              <Link to="/underhaul/contracts" className="inline-flex items-center justify-center rounded-lg bg-yellow-500 px-4 py-3 font-bold text-midnight-900 hover:bg-yellow-400">
                Open Contracts Office
              </Link>
            </div>
          </section>
        )}

        {isLoading ? (
          <div className="text-center py-16">
            <Loader2 className="w-8 h-8 text-yellow-400 mx-auto mb-4 animate-spin" />
            <p className="text-gray-300">Loading games...</p>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="flex flex-wrap gap-2 border-b border-fantasy-700/30 pb-3">
              <TabPill active={activeTab === 'open'} onClick={() => setActiveTab('open')} label={`Open Games (${visibleGames.length})`} />
              <TabPill active={activeTab === 'upcoming'} onClick={() => setActiveTab('upcoming')} label={`Upcoming Tickets (${confirmedGames.length})`} />
              <TabPill active={activeTab === 'archive'} onClick={() => setActiveTab('archive')} label={`Archive (${archivedGames.length})`} />
            </div>

            {activeTab === 'upcoming' && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="w-5 h-5 text-yellow-400" />
                  <h2 className="font-fantasy text-2xl font-bold text-white">Upcoming Tickets</h2>
                </div>
                {confirmedGames.length > 0 ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {confirmedGames.map(game => (
                      <GameTicket
                        key={game._id}
                        game={game}
                        onOpen={() => setSelectedGameId(game._id || null)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="border border-fantasy-700/30 bg-fantasy-900/25 rounded-lg p-6 text-gray-300">
                    No confirmed games are on the timeline yet.
                  </div>
                )}
              </section>
            )}

            {activeTab === 'archive' && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Ticket className="w-5 h-5 text-yellow-400" />
                  <h2 className="font-fantasy text-2xl font-bold text-white">Archived Games</h2>
                </div>
                <ArchiveTable games={archivedGames} onOpen={(game) => setSelectedGameId(game._id || null)} />
              </section>
            )}

            {activeTab === 'open' && (
              <section className="grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-6">
                <aside className="border border-fantasy-700/30 bg-fantasy-900/25 rounded-lg p-4 h-fit">
                  <div className="flex items-center gap-2 mb-4">
                    <Search className="w-5 h-5 text-yellow-400" />
                    <h2 className="text-lg font-bold text-white">Find a Table</h2>
                  </div>
                  <div className="space-y-4">
                    <label className="flex items-center justify-between gap-3 rounded-lg border border-fantasy-700/30 bg-midnight-900/40 p-3 text-sm text-gray-200">
                      <span className="font-semibold">My Games</span>
                      <input
                        type="checkbox"
                        checked={filters.myGames}
                        onChange={(event) => setFilters(prev => ({ ...prev, myGames: event.target.checked }))}
                        className="h-5 w-5 accent-yellow-500"
                      />
                    </label>
                    <input
                      type="search"
                      value={filters.query}
                      onChange={(event) => setFilters(prev => ({ ...prev, query: event.target.value }))}
                      placeholder="Title, GM, tag"
                      className="w-full p-3 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white placeholder-gray-400"
                    />
                    <div className="relative">
                      <input
                        type="search"
                        value={tagSearch}
                        onChange={(event) => {
                          setTagSearch(event.target.value);
                          setFilters(prev => ({ ...prev, tag: event.target.value }));
                        }}
                        onFocus={() => setIsTagSearchFocused(true)}
                        onBlur={() => window.setTimeout(() => setIsTagSearchFocused(false), 150)}
                        placeholder="Tag or tier"
                        className="w-full p-3 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white placeholder-gray-400"
                      />
                      {filters.tag && (
                        <button
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setFilters(prev => ({ ...prev, tag: '', tier: tierTags.includes(filters.tag) ? '' : prev.tier }));
                            setTagSearch('');
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-white"
                          aria-label="Clear tag filter"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                      {isTagSearchFocused && tagSuggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-fantasy-900/95 border border-fantasy-700/30 rounded-lg shadow-xl z-40 overflow-hidden">
                          {tagSuggestions.map(tag => (
                            <button
                              key={tag}
                              type="button"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => handleTagSelect(tag)}
                              className="w-full text-left px-4 py-3 hover:bg-fantasy-800/50 transition-colors"
                            >
                              <span className="text-white font-semibold">{tag}</span>
                              {tierTags.includes(tag) && <span className="ml-2 text-xs text-yellow-300">Tier</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <select
                      value={filters.tier}
                      onChange={(event) => setFilters(prev => ({ ...prev, tier: event.target.value }))}
                      className="w-full p-3 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white"
                    >
                      <option value="">Any tier</option>
                      {tierTags.map(tier => <option key={tier} value={tier}>{tier}</option>)}
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
                      onOpen={() => setSelectedGameId(game._id || null)}
                    />
                  ))}
                  {visibleGames.length === 0 && (
                    <div className="border border-fantasy-700/30 bg-fantasy-900/25 rounded-lg p-10 text-center">
                      <CalendarDays className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                      <h2 className="text-xl font-bold text-white mb-2">
                        {filters.myGames ? 'No my games match those filters' : 'No open games match those filters'}
                      </h2>
                      <p className="text-gray-300">
                        {filters.myGames ? 'Clear a filter or turn off My Games.' : 'Clear a filter or create the next table.'}
                      </p>
                    </div>
                  )}
                </div>
              </section>
            )}

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
                    <div className="mt-4 space-y-3">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="search"
                          value={inviteSearch}
                          onChange={(event) => setInviteSearch(event.target.value)}
                          placeholder="Search character name"
                          className="w-full pl-8 pr-3 py-2 bg-fantasy-900/60 border border-fantasy-700/30 rounded-lg text-white placeholder-gray-400"
                        />
                        {inviteSearch.trim().length >= 2 && (
                          <div className="absolute top-full left-0 right-0 mt-2 bg-fantasy-900/95 border border-fantasy-700/30 rounded-lg shadow-xl z-50 overflow-hidden">
                            {isInviteSearching ? (
                              <div className="flex items-center justify-center gap-2 p-3 text-sm text-gray-400">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Searching...</span>
                              </div>
                            ) : inviteResults.length === 0 ? (
                              <div className="p-3 text-sm text-gray-400">No eligible characters found</div>
                            ) : (
                              inviteResults.map(character => (
                                <button
                                  key={character._id}
                                  type="button"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => handleInviteCharacterSelect(character)}
                                  className="w-full text-left px-4 py-3 hover:bg-fantasy-800/50 transition-colors"
                                >
                                  <span className="block text-white font-semibold">{character.name}</span>
                                  <span className="block text-xs text-gray-400">Level {character.level} {character.class}</span>
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                      {form.manualInvites.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {form.manualInvites.map(invite => (
                            <span key={invite.userId} className="inline-flex items-center gap-2 rounded-lg bg-yellow-500/15 px-3 py-2 text-sm text-yellow-100">
                              {invite.displayName}
                              <button
                                type="button"
                                onClick={() => handleRemoveManualInvite(invite.userId)}
                                className="text-yellow-200 hover:text-white"
                                aria-label={`Remove ${invite.characterName}`}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
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
        {selectedGame && (
          <GameDetailsModal
            game={selectedGame}
            userId={user?.id || ''}
            rewardsBonus={ticketBonus[selectedGame._id || ''] ?? selectedGame.rewardsBonus}
            commentDraft={archiveCommentDrafts[selectedGame._id || ''] || ''}
            editingComments={editingArchiveComments}
            onClose={() => setSelectedGameId(null)}
            onOpenApplicationModal={() => openApplicationModal(selectedGame)}
            onApplicationStatus={handleApplicationStatus}
            onUpdateGame={(updates) => handleUpdateGame(selectedGame, updates)}
            onStatusChange={(status) => handleUpdateGameStatus(selectedGame, status)}
            onRewardsBonusChange={(bonus) => setTicketBonus(prev => ({ ...prev, [selectedGame._id || '']: bonus }))}
            onComplete={() => handleCompleteGame(selectedGame)}
            onCommentDraftChange={(body) => setArchiveCommentDrafts(prev => ({ ...prev, [selectedGame._id || '']: body }))}
            onAddComment={() => handleAddArchiveComment(selectedGame)}
            onEditComment={(comment, body) => setEditingArchiveComments(prev => ({ ...prev, [comment._id || '']: body }))}
            onCancelEditComment={(comment) => setEditingArchiveComments(prev => {
              const next = { ...prev };
              delete next[comment._id || ''];
              return next;
            })}
            onUpdateComment={handleUpdateArchiveComment}
            onDeleteComment={handleDeleteArchiveComment}
            onToggleLike={() => handleToggleArchiveLike(selectedGame)}
          />
        )}
        {applicationGame && applicationModal && (
          <GameApplicationModal
            game={applicationGame}
            userId={user?.id || ''}
            characters={characters}
            characterId={applicationModal.characterId}
            note={applicationModal.note}
            onCharacterChange={(characterId) => setApplicationModal(prev => prev ? { ...prev, characterId } : prev)}
            onNoteChange={(note) => setApplicationModal(prev => prev ? { ...prev, note } : prev)}
            onCancel={closeApplicationModal}
            onSave={(application) => {
              if (application && application.status !== 'Withdrawn') {
                return handleUpdateApplication(application, applicationGame, applicationModal.characterId, applicationModal.note);
              }

              return handleApply(applicationGame, applicationModal.characterId, applicationModal.note);
            }}
            onWithdraw={(application) => handleWithdrawApplication(application, { confirm: false })}
          />
        )}
      </div>
    </div>
  );
};

interface GameListingCardProps {
  game: GameListing;
  userId: string;
  onOpen: () => void;
}

const GameListingCard: React.FC<GameListingCardProps> = ({
  game,
  userId,
  onOpen
}) => {
  const isGm = game.gmId === userId;
  const ownApplication = game.applications.find(application => application.userId === userId);
  const roster = game.applications.filter(application => application.status === 'Roster');
  const applied = game.applications.filter(application => application.status === 'Applied');
  const onDeck = game.applications.filter(application => application.status === 'On Deck');

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-lg border border-fantasy-700/30 bg-fantasy-900/25 p-5 text-left transition-colors hover:border-yellow-400/60 hover:bg-fantasy-900/40 focus:outline-none focus:ring-2 focus:ring-yellow-400/60"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="font-fantasy text-2xl font-bold text-white">{game.title}</h3>
            <span className="rounded bg-fantasy-800/60 px-2 py-1 text-xs font-bold text-yellow-200">{game.tier}</span>
            {getGameRelationshipBadges(game, userId).map(badge => (
              <span key={badge} className="rounded bg-emerald-500/20 px-2 py-1 text-xs font-bold text-emerald-200">{badge}</span>
            ))}
          </div>
          <p className="mb-3 line-clamp-3 text-gray-300">{game.description}</p>
          <div className="flex flex-wrap gap-3 text-sm text-gray-300">
            <span className="flex items-center gap-1"><CalendarDays className="w-4 h-4 text-yellow-400" />{formatDateTime(game.startTime)}</span>
            <span className="flex items-center gap-1"><Clock className="w-4 h-4 text-yellow-400" />{formatDuration(game.durationMinutes)}</span>
            <span className="flex items-center gap-1"><Users className="w-4 h-4 text-yellow-400" />{roster.length}/{game.partySize} rostered</span>
            <span>Level {game.characterLevel}</span>
            <span>{applied.length} applied</span>
            {onDeck.length > 0 && <span>{onDeck.length} on deck</span>}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {game.tags.map(tag => (
              <span key={tag} className="rounded bg-fantasy-800/60 px-2 py-1 text-xs font-semibold text-gray-200">{tag}</span>
            ))}
          </div>
        </div>
        <div className="text-sm text-gray-300 lg:text-right">
          <p className="font-bold text-white">GM {game.gmName}</p>
          {isGm && applied.length > 0 && (
            <p className="font-semibold text-yellow-200">{applied.length} application{applied.length === 1 ? '' : 's'} waiting</p>
          )}
          {!isGm && ownApplication && (
            <p className="font-semibold text-yellow-200">Your status: {ownApplication.status === 'Roster' ? 'On Roster' : ownApplication.status}</p>
          )}
          {game.rewardCharacter && (
            <p>{game.rewardCharacter.name} earns rewards</p>
          )}
          <p className="mt-3 text-xs font-bold uppercase tracking-widest text-yellow-300">View Details</p>
        </div>
      </div>
    </button>
  );
};

const GameTicket: React.FC<{ game: GameListing; onOpen: () => void }> = ({ game, onOpen }) => {
  const roster = game.applications.filter(application => application.status === 'Roster');
  const isCancelled = game.status === 'Cancelled';
  const timeWasEdited = Boolean(game.originalStartTime && game.originalStartTime.getTime() !== game.startTime.getTime());

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`relative overflow-hidden rounded-lg border p-5 text-left transition-colors ${
        isCancelled
          ? 'border-red-400/60 bg-gradient-to-br from-red-500/20 via-fantasy-900/45 to-midnight-900/70 hover:border-red-300'
          : 'border-yellow-400/40 bg-gradient-to-br from-yellow-500/15 via-fantasy-900/45 to-midnight-900/70 hover:border-yellow-300'
      }`}
    >
      <div className={`absolute left-0 top-0 h-full w-1 ${isCancelled ? 'bg-red-400' : 'bg-yellow-400'}`} />
      {isCancelled && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="-rotate-12 rounded border-2 border-red-300/70 bg-red-950/60 px-6 py-2 text-3xl font-black uppercase tracking-widest text-red-200">
            Canceled
          </span>
        </div>
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className={`flex items-center gap-2 mb-2 ${isCancelled ? 'text-red-200' : 'text-yellow-300'}`}>
            <Ticket className="w-5 h-5" />
            <span className="text-xs font-bold uppercase tracking-widest">Confirmed Table</span>
          </div>
          <h3 className="font-fantasy text-2xl font-bold text-white">{game.title}</h3>
          <p className={`mt-1 ${timeWasEdited ? 'font-bold text-yellow-200' : 'text-gray-300'}`}>
            {formatDateTime(game.startTime)} with GM {game.gmName}
          </p>
        </div>
        <span className="rounded bg-midnight-900/70 px-3 py-1 text-sm font-bold text-yellow-200">{game.tier}</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {roster.map(application => (
          <span key={application._id} className={`rounded px-3 py-1 text-sm ring-1 ${rolePillTone(getApplicationPrimaryRole(application))}`}>
            <span className="font-semibold">{application.displayName}</span>: {renderCharacters(application)}
          </span>
        ))}
        {roster.length === 0 && <span className="text-sm text-gray-400">Roster pending</span>}
      </div>
    </button>
  );
};

interface GameEditState {
  title: string;
  description: string;
  startLocal: string;
  durationMinutes: number;
  characterLevel: number;
  partySize: number;
  tags: string[];
}

interface GameDetailsModalProps {
  game: GameListing;
  userId: string;
  rewardsBonus: GameRewardsBonus;
  commentDraft: string;
  editingComments: Record<string, string>;
  onClose: () => void;
  onOpenApplicationModal: () => void;
  onApplicationStatus: (application: GameApplication, status: GameApplicationStatus) => void;
  onUpdateGame: (updates: GameEditState) => void | Promise<void>;
  onStatusChange: (status: GameStatus) => void;
  onRewardsBonusChange: (bonus: GameRewardsBonus) => void;
  onComplete: () => void;
  onCommentDraftChange: (body: string) => void;
  onAddComment: () => void;
  onEditComment: (comment: GameArchiveComment, body: string) => void;
  onCancelEditComment: (comment: GameArchiveComment) => void;
  onUpdateComment: (comment: GameArchiveComment) => void;
  onDeleteComment: (comment: GameArchiveComment) => void;
  onToggleLike: () => void;
}

const GameDetailsModal: React.FC<GameDetailsModalProps> = ({
  game,
  userId,
  rewardsBonus,
  commentDraft,
  editingComments,
  onClose,
  onOpenApplicationModal,
  onApplicationStatus,
  onUpdateGame,
  onStatusChange,
  onRewardsBonusChange,
  onComplete,
  onCommentDraftChange,
  onAddComment,
  onEditComment,
  onCancelEditComment,
  onUpdateComment,
  onDeleteComment,
  onToggleLike
}) => {
  const isGm = game.gmId === userId;
  const isArchived = isArchivedGame(game);
  const ownApplication = game.applications.find(application => application.userId === userId);
  const roster = game.applications.filter(application => application.status === 'Roster');
  const onDeck = game.applications.filter(application => application.status === 'On Deck');
  const withdrawn = game.applications.filter(application => application.status === 'Withdrawn');
  const applied = game.applications.filter(application => application.status === 'Applied');
  const [editState, setEditState] = useState<GameEditState>(() => gameToEditState(game));
  const [tagDraft, setTagDraft] = useState(game.tags.join(', '));
  const [isEditingDetails, setIsEditingDetails] = useState(false);

  useEffect(() => {
    setEditState(gameToEditState(game));
    setTagDraft(game.tags.join(', '));
    setIsEditingDetails(false);
  }, [game]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-xl border border-fantasy-700/40 bg-midnight-950 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-fantasy-700/30 p-5">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-yellow-300">{game.status} Game</p>
            <h2 className="font-fantasy text-3xl font-bold text-white">{game.title}</h2>
            <p className="text-sm text-gray-300">{formatDateTime(game.startTime)} with GM {game.gmName}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-gray-400 hover:text-white" aria-label="Close game details">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-[1.25fr_0.9fr]">
          <div className="space-y-5">
            {game.status === 'Completed' && <RewardsSection game={game} />}

            <section className="rounded-lg border border-fantasy-700/30 bg-fantasy-900/25 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Ticket className="h-5 w-5 text-yellow-300" />
                  <h3 className="text-lg font-bold text-white">Details</h3>
                </div>
                {isGm && !isArchived && (
                  <button
                    type="button"
                    onClick={() => setIsEditingDetails(prev => !prev)}
                    className="rounded-lg bg-fantasy-700 px-3 py-2 text-sm font-semibold text-white hover:bg-fantasy-600"
                  >
                    {isEditingDetails ? 'Cancel Edit' : 'Edit Details'}
                  </button>
                )}
              </div>
              {isGm && !isArchived && isEditingDetails ? (
                <div className="grid gap-3">
                  <input value={editState.title} onChange={event => setEditState(prev => ({ ...prev, title: event.target.value }))} className="rounded-lg border border-fantasy-700/30 bg-fantasy-800/50 p-3 text-white" />
                  <textarea value={editState.description} onChange={event => setEditState(prev => ({ ...prev, description: event.target.value }))} rows={4} className="rounded-lg border border-fantasy-700/30 bg-fantasy-800/50 p-3 text-white" />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input type="datetime-local" value={editState.startLocal} onChange={event => setEditState(prev => ({ ...prev, startLocal: event.target.value }))} className="rounded-lg border border-fantasy-700/30 bg-fantasy-800/50 p-3 text-white" />
                    <input type="number" min={30} step={30} value={editState.durationMinutes} onChange={event => setEditState(prev => ({ ...prev, durationMinutes: Number(event.target.value) || 30 }))} className="rounded-lg border border-fantasy-700/30 bg-fantasy-800/50 p-3 text-white" />
                    <input type="number" min={1} max={20} value={editState.characterLevel} onChange={event => setEditState(prev => ({ ...prev, characterLevel: Number(event.target.value) || 1 }))} className="rounded-lg border border-fantasy-700/30 bg-fantasy-800/50 p-3 text-white" />
                    <input type="number" min={1} value={editState.partySize} onChange={event => setEditState(prev => ({ ...prev, partySize: Number(event.target.value) || 1 }))} className="rounded-lg border border-fantasy-700/30 bg-fantasy-800/50 p-3 text-white" />
                  </div>
                  <input value={tagDraft} onChange={event => {
                    setTagDraft(event.target.value);
                    setEditState(prev => ({ ...prev, tags: parseTags(event.target.value) }));
                  }} placeholder="Tags, comma separated" className="rounded-lg border border-fantasy-700/30 bg-fantasy-800/50 p-3 text-white placeholder-gray-400" />
                  <button
                    type="button"
                    onClick={async () => {
                      await onUpdateGame(editState);
                      setIsEditingDetails(false);
                    }}
                    className="flex items-center justify-center gap-2 rounded-lg bg-yellow-500 px-4 py-2 font-bold text-midnight-900 hover:bg-yellow-400"
                  >
                    <Save className="h-4 w-4" />
                    <span>Save Ticket</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3 text-sm text-gray-300">
                  <p>{game.description}</p>
                  <p>{formatDuration(game.durationMinutes)} - Level {game.characterLevel} - {game.tier}</p>
                  <div className="flex flex-wrap gap-2">{game.tags.map(tag => <span key={tag} className="rounded bg-fantasy-800/60 px-2 py-1 text-xs font-semibold text-gray-200">{tag}</span>)}</div>
                </div>
              )}
            </section>

            <section className="rounded-lg border border-fantasy-700/30 bg-fantasy-900/25 p-4">
              <h3 className="mb-3 text-lg font-bold text-white">Roster</h3>
              <RosterManager applications={roster} isGm={isGm && !isArchived} onApplicationStatus={onApplicationStatus} />
              <h4 className="mb-2 mt-4 text-sm font-bold uppercase tracking-widest text-yellow-300">On Deck</h4>
              <RosterManager applications={onDeck} isGm={isGm && !isArchived} onApplicationStatus={onApplicationStatus} />
              <h4 className="mb-2 mt-4 text-sm font-bold uppercase tracking-widest text-yellow-300">Withdrawn</h4>
              <RosterManager applications={withdrawn} isGm={false} onApplicationStatus={onApplicationStatus} />
              <h4 className="mb-2 mt-4 text-sm font-bold uppercase tracking-widest text-yellow-300">Applied</h4>
              <RosterManager applications={applied} isGm={isGm && !isArchived} onApplicationStatus={onApplicationStatus} />
            </section>

            
          </div>
{isArchived && (
              <section className="rounded-lg border border-fantasy-700/30 bg-fantasy-900/25 p-4">
                <div className="mb-3 flex items-center gap-3">
                  <button type="button" onClick={onToggleLike} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${game.likedByCurrentUser ? 'bg-red-500/20 text-red-100' : 'bg-fantasy-800/60 text-gray-200 hover:text-white'}`}>
                    <Heart className="h-4 w-4" />
                    <span>{game.likeCount}</span>
                  </button>
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <MessageCircle className="h-4 w-4" />
                    <span>{game.comments.length}</span>
                  </div>
                </div>
                <div className="space-y-3">
                  {game.comments.map(comment => (
                    <div key={comment._id} className="rounded-lg bg-midnight-900/60 p-3">
                      <p className="text-xs text-gray-500">{comment.authorName} - {new Date(comment.createdAt).toLocaleString()}{comment.isEdited ? ' - edited' : ''}</p>
                      {editingComments[comment._id || ''] !== undefined ? (
                        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                          <input value={editingComments[comment._id || '']} onChange={event => onEditComment(comment, event.target.value)} className="rounded-lg border border-fantasy-700/30 bg-fantasy-800/50 p-2 text-white" />
                          <button type="button" onClick={() => onUpdateComment(comment)} className="rounded-lg bg-yellow-500 px-3 py-2 text-sm font-bold text-midnight-900">Save</button>
                          <button type="button" onClick={() => onCancelEditComment(comment)} className="rounded-lg bg-fantasy-700 px-3 py-2 text-sm font-semibold text-white">Cancel</button>
                        </div>
                      ) : (
                        <p className="mt-1 text-sm text-gray-200">{comment.body}</p>
                      )}
                      {comment.authorId === userId && editingComments[comment._id || ''] === undefined && (
                        <div className="mt-2 flex gap-3">
                          <button type="button" onClick={() => onEditComment(comment, comment.body)} className="text-xs text-yellow-200 hover:text-yellow-100">Edit</button>
                          <button type="button" onClick={() => onDeleteComment(comment)} className="text-xs text-red-200 hover:text-red-100">Delete</button>
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <input value={commentDraft} onChange={event => onCommentDraftChange(event.target.value)} placeholder="Add a comment" className="rounded-lg border border-fantasy-700/30 bg-fantasy-800/50 p-3 text-white placeholder-gray-400" />
                    <button type="button" onClick={onAddComment} className="rounded-lg bg-fantasy-700 px-4 py-2 text-sm font-semibold text-white hover:bg-fantasy-600">Comment</button>
                  </div>
                </div>
              </section>
            )}
          <aside className="space-y-5">
            {!isGm && !isArchived && (
              <section className="rounded-lg border border-fantasy-700/30 bg-fantasy-900/25 p-4">
                <h3 className="mb-3 text-lg font-bold text-white">Application</h3>
                {ownApplication && (
                  <p className="mb-3 text-sm text-gray-300">Status: <span className="font-bold text-yellow-300">{ownApplication.status}</span></p>
                )}
                <button type="button" onClick={onOpenApplicationModal} className="flex w-full items-center justify-center gap-2 rounded-lg bg-yellow-500 px-4 py-3 font-bold text-midnight-900 hover:bg-yellow-400">
                  <UserCheck className="h-4 w-4" />
                  <span>{getApplicationActionLabel(ownApplication)}</span>
                </button>
              </section>
            )}

            {isGm && !isArchived && (
              <section className="rounded-lg border border-fantasy-700/30 bg-fantasy-900/25 p-4">
                <h3 className="mb-3 text-lg font-bold text-white">GM Controls</h3>
                <div className="space-y-3">
                  {game.status === 'Cancelled' ? (
                    <button type="button" onClick={() => onStatusChange('Closed')} className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-bold text-white hover:bg-emerald-500">
                      <Check className="h-4 w-4" />
                      <span>Uncancel Game</span>
                    </button>
                  ) : (
                    <>
                      {game.status === 'Open' && (
                        <button type="button" onClick={() => onStatusChange('Closed')} className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-bold text-white hover:bg-emerald-500">
                          <Ticket className="h-4 w-4" />
                          <span>Confirm Closed</span>
                        </button>
                      )}
                      {game.status === 'Closed' && (
                        <button type="button" onClick={() => onStatusChange('Open')} className="flex w-full items-center justify-center gap-2 rounded-lg bg-fantasy-700 px-4 py-2 font-bold text-white hover:bg-fantasy-600">
                          <Ticket className="h-4 w-4" />
                          <span>Reopen Applications</span>
                        </button>
                      )}
                      <button type="button" onClick={() => onStatusChange('Cancelled')} className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-700 px-4 py-2 font-bold text-white hover:bg-red-600">
                        <Ban className="h-4 w-4" />
                        <span>Cancel Game</span>
                      </button>
                      <div>
                        <label className="mb-2 block text-sm font-semibold text-gray-300">Rewards Bonus</label>
                        <input
                          type="range"
                          min={0}
                          max={20}
                          step={5}
                          value={rewardsBonus}
                          onChange={event => onRewardsBonusChange(Number(event.target.value) as GameRewardsBonus)}
                          className="w-full"
                        />
                        <div className="mt-1 flex justify-between text-xs text-gray-400">
                          {rewardBonusOptions.map(value => <span key={value}>{value}%</span>)}
                        </div>
                      </div>
                      <button type="button" onClick={onComplete} className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-bold text-white hover:bg-emerald-500">
                        <Check className="h-4 w-4" />
                        <span>Completed</span>
                      </button>
                    </>
                  )}
                </div>
              </section>
            )}

          </aside>
        </div>
      </div>
    </div>
  );
};

interface GameApplicationModalProps {
  game: GameListing;
  userId: string;
  characters: Character[];
  characterId: string;
  note: string;
  onCharacterChange: (characterId: string) => void;
  onNoteChange: (note: string) => void;
  onCancel: () => void;
  onSave: (application?: GameApplication) => void | Promise<void>;
  onWithdraw: (application: GameApplication) => void | Promise<void>;
}

const GameApplicationModal: React.FC<GameApplicationModalProps> = ({
  game,
  userId,
  characters,
  characterId,
  note,
  onCharacterChange,
  onNoteChange,
  onCancel,
  onSave,
  onWithdraw
}) => {
  const ownApplication = game.applications.find(application => application.userId === userId);
  const canWithdraw = Boolean(ownApplication && ownApplication.status !== 'Withdrawn');
  const actionLabel = getApplicationActionLabel(ownApplication);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-lg rounded-xl border border-fantasy-700/40 bg-midnight-950 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-fantasy-700/30 p-5">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-yellow-300">{actionLabel}</p>
            <h2 className="font-fantasy text-2xl font-bold text-white">{game.title}</h2>
          </div>
          <button type="button" onClick={onCancel} className="p-2 text-gray-400 hover:text-white" aria-label="Close application">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {ownApplication && (
            <p className="text-sm text-gray-300">Current status: <span className="font-bold text-yellow-300">{ownApplication.status}</span></p>
          )}

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-gray-300">Character</span>
            <select
              value={characterId}
              onChange={event => onCharacterChange(event.target.value)}
              className="w-full rounded-lg border border-fantasy-700/30 bg-fantasy-800/50 p-3 text-white"
            >
              <option value="">Select a character</option>
              {characters.map(character => (
                <option key={character._id} value={character._id || ''}>
                  {character.name} L{character.level}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-gray-300">Note</span>
            <textarea
              value={note}
              onChange={event => onNoteChange(event.target.value)}
              rows={5}
              className="w-full rounded-lg border border-fantasy-700/30 bg-fantasy-800/50 p-3 text-white placeholder-gray-400"
              placeholder="Anything the GM should know"
            />
          </label>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-fantasy-700/30 p-5 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className="rounded-lg bg-fantasy-700 px-4 py-2 text-sm font-semibold text-white hover:bg-fantasy-600">
            Cancel
          </button>
          {canWithdraw && (
            <button type="button" onClick={() => ownApplication && onWithdraw(ownApplication)} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-600">
              Withdraw Application
            </button>
          )}
          <button type="button" onClick={() => onSave(ownApplication)} disabled={!characterId} className="rounded-lg bg-yellow-500 px-4 py-2 text-sm font-bold text-midnight-900 hover:bg-yellow-400 disabled:bg-gray-600 disabled:text-gray-300">
            {ownApplication?.status === 'Withdrawn' ? 'Re-apply' : ownApplication ? 'Save' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
};

const RosterManager: React.FC<{
  applications: GameApplication[];
  isGm: boolean;
  onApplicationStatus: (application: GameApplication, status: GameApplicationStatus) => void;
}> = ({ applications, isGm, onApplicationStatus }) => (
  <div className="space-y-2">
    {applications.map(application => (
      <div key={application._id} className="rounded-lg border border-fantasy-700/30 bg-midnight-900/40 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={`${application.status === 'Withdrawn' ? 'line-through opacity-60' : ''} font-semibold ${roleNameTone(getApplicationPrimaryRole(application))}`}>
            {application.displayName}
          </span>
          <span className="text-xs font-bold text-yellow-300">{application.status}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">{renderCharacterChips(application)}</div>
        {application.note && <p className="mt-2 text-sm text-gray-400">{application.note}</p>}
        {isGm && application.status !== 'Withdrawn' && (
          <div className="mt-3 flex flex-wrap gap-2">
            {(['Roster', 'On Deck', 'Declined'] as GameApplicationStatus[]).map(status => (
              <button key={status} type="button" onClick={() => onApplicationStatus(application, status)} className="rounded bg-fantasy-700 px-3 py-2 text-sm text-white hover:bg-fantasy-600">{status}</button>
            ))}
          </div>
        )}
      </div>
    ))}
    {applications.length === 0 && <p className="text-sm text-gray-500">Empty</p>}
  </div>
);

const RewardsSection: React.FC<{ game: GameListing; preview?: boolean }> = ({ game, preview = false }) => {
  const rewardRows = getRewardRows(game);
  if (rewardRows.length === 0) return null;

  return (
    <section className="rounded-lg border border-fantasy-700/30 bg-fantasy-900/25 p-4">
      <h3 className="mb-3 text-lg font-bold text-white">{preview ? 'Rewards Preview' : 'Rewards'}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-widest text-yellow-300">
            <tr>
              <th className="pb-2">Player</th>
              <th className="pb-2">Character</th>
              <th className="pb-2">Level</th>
              <th className="pb-2">Reward</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-fantasy-700/30 text-gray-200">
            {rewardRows.map(row => (
              <tr key={`${row.applicationId}-${row.characterName}`}>
                <td className="py-2">{row.playerName}</td>
                <td className="py-2">{row.characterName}</td>
                <td className="py-2">{row.level}</td>
                <td className="py-2 font-bold text-yellow-100">{formatReward(row.reward)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

const ArchiveTable: React.FC<{ games: GameListing[]; onOpen: (game: GameListing) => void }> = ({ games, onOpen }) => (
  <div className="overflow-hidden rounded-lg border border-fantasy-700/30 bg-fantasy-900/25">
    <table className="w-full text-left text-sm">
      <thead className="bg-midnight-900/70 text-xs uppercase tracking-widest text-yellow-300">
        <tr>
          <th className="p-3">Game</th>
          <th className="p-3">Date</th>
          <th className="p-3">Status</th>
          <th className="p-3">Roster</th>
          <th className="p-3">Social</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-fantasy-700/30 text-gray-200">
        {games.map(game => (
          <tr key={game._id} onClick={() => onOpen(game)} className="cursor-pointer hover:bg-fantasy-800/30">
            <td className="p-3 font-semibold text-white">{game.title}</td>
            <td className="p-3">{formatDateTime(game.startTime)}</td>
            <td className={`p-3 font-bold ${game.status === 'Cancelled' ? 'text-red-200' : 'text-emerald-200'}`}>{game.status}</td>
            <td className="p-3">{game.applications.filter(application => application.status === 'Roster').length}</td>
            <td className="p-3">{game.likeCount} likes, {game.comments.length} comments</td>
          </tr>
        ))}
        {games.length === 0 && (
          <tr>
            <td colSpan={5} className="p-6 text-center text-gray-400">No archived games yet.</td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
);

const TabPill: React.FC<{ active: boolean; label: string; onClick: () => void }> = ({ active, label, onClick }) => (
  <button type="button" onClick={onClick} className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors ${active ? 'bg-yellow-500 text-midnight-900' : 'bg-fantasy-800/60 text-gray-200 hover:text-white'}`}>
    {label}
  </button>
);

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
  manualInvites: [],
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

const parseTags = (value: string) =>
  value.split(',').map(tag => tag.trim()).filter(Boolean);

const gameToEditState = (game: GameListing): GameEditState => ({
  title: game.title,
  description: game.description,
  startLocal: toDateTimeLocalValue(game.startTime),
  durationMinutes: game.durationMinutes,
  characterLevel: game.characterLevel,
  partySize: game.partySize,
  tags: game.tags
});

const isArchivedGame = (game: GameListing) =>
  game.status === 'Completed' || (game.status === 'Cancelled' && game.startTime.getTime() < Date.now());

const isMyGame = (game: GameListing, userId: string) => {
  if (!userId) return false;
  return game.gmId === userId || game.applications.some(application =>
    application.userId === userId && application.status === 'Roster'
  );
};

const getGameRelationshipBadges = (game: GameListing, userId: string) => {
  if (!userId) return [];
  if (game.gmId === userId) return ['GM'];

  const application = game.applications.find(entry => entry.userId === userId);
  if (!application) return [];

  if (application.status === 'Roster') return ['On Roster'];
  if (application.status === 'On Deck') return ['On Deck'];
  if (application.status === 'Applied') return ['Applied'];

  return [];
};

const getRewardRows = (game: GameListing) => {
  const playerRows = game.applications
    .filter(application => application.status === 'Roster')
    .flatMap(application => {
      const character = application.characters[0];
      if (!character) return [];
      const level = Math.max(1, Math.min(20, character.level));
      return [{
        applicationId: application._id || application.userId,
        playerName: application.displayName,
        characterName: character.name,
        level,
        reward: rewardTable[level]?.[game.rewardsBonus] || rewardTable[level]?.[0] || 0
      }];
    });

  if (!game.rewardCharacter) return playerRows;

  const gmLevel = Math.max(1, Math.min(20, game.rewardCharacter.level));
  return [
    ...playerRows,
    {
      applicationId: `gm-${game.gmId}`,
      playerName: `GM ${game.gmName}`,
      characterName: game.rewardCharacter.name,
      level: gmLevel,
      reward: rewardTable[gmLevel]?.[game.rewardsBonus] || rewardTable[gmLevel]?.[0] || 0
    }
  ];
};

const formatReward = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');

const renderCharacterChips = (application: GameApplication) =>
  application.characters.length > 0
    ? application.characters.map(character => <CharacterChip key={character._id || character.name} character={character} withdrawn={application.status === 'Withdrawn'} />)
    : <span className="text-gray-400">{application.characterIds.length} character{application.characterIds.length === 1 ? '' : 's'}</span>;

const CharacterChip: React.FC<{ character: Character; withdrawn?: boolean }> = ({ character, withdrawn = false }) => (
  <span className={`inline-flex items-center gap-2 rounded px-2.5 py-1 text-xs font-bold ring-1 ${rolePillTone(character.mainRole)} ${withdrawn ? 'line-through opacity-60' : ''}`}>
    <span>{character.name} L{character.level}</span>
    <CharacterRoleBadges badges={character.roleBadges} limit={3} />
  </span>
);

const renderCharacters = (application: GameApplication) =>
  application.characters.length > 0
    ? application.characters.map((character, index) => (
        <React.Fragment key={character._id || character.name}>
          {index > 0 && ', '}
          <span className={roleNameTone(character.mainRole)}>{character.name} L{character.level}</span>
        </React.Fragment>
      ))
    : `${application.characterIds.length} character${application.characterIds.length === 1 ? '' : 's'}`;

const getApplicationPrimaryRole = (application: GameApplication) => {
  return application.characters[0]?.mainRole;
};

const getApplicationActionLabel = (application?: GameApplication) => {
  if (!application) return 'Apply';
  if (application.status === 'Withdrawn') return 'Re-apply';
  return 'Edit Application';
};

export default GamesPage;
