import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Calendar, Clock, Loader2, LogOut, Save, ShieldCheck, User, X } from 'lucide-react';
import { DATABASE_TABLES } from '../config/database';
import { useAuth } from '../context/useAuth';
import { useSupabaseRealtime } from '../hooks/useSupabaseRealtime';
import GameService from '../services/gameService';
import { UserService } from '../services/userService';
import { GameListing } from '../types/database';

// Keep the schedule implementation available while it is out of the profile UI.
const PROFILE_SCHEDULE_ENABLED = false;

const ProfilePage: React.FC = () => {
  const { user, logout, isAuthenticated, refreshUserProfile } = useAuth();
  const userService = useMemo(() => UserService.getInstance(), []);
  const gameService = useMemo(() => GameService.getInstance(), []);
  const [games, setGames] = useState<GameListing[]>([]);
  const [isLoadingGames, setIsLoadingGames] = useState(true);
  const [selectedGame, setSelectedGame] = useState<GameListing | null>(null);
  const [profileName, setProfileName] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [settingsState, setSettingsState] = useState({
    allowWallPosts: true,
    showOnlineStatus: true,
    profilePrivate: false,
    notifications: {
      guildAnnouncements: true,
      friendRequests: true,
      eventReminders: false,
    }
  });
  const [isSavingPrivacy, setIsSavingPrivacy] = useState(false);

  useEffect(() => {
    if (user?.profile) {
      setProfileName(user.profile.username);
      setSettingsState(user.profile.settings);
    }
  }, [user?.profile]);

  const loadGames = useCallback(async (showLoading = false) => {
    if (!PROFILE_SCHEDULE_ENABLED || !user?.id) {
      setIsLoadingGames(false);
      return;
    }

    if (showLoading) setIsLoadingGames(true);
    try {
      const response = await gameService.getGames(user.id);
      if (response.success && response.data) {
        setGames(response.data.filter(game => isUserGame(game, user.id)));
      } else {
        console.error('Failed to load profile games:', response.error);
      }
    } finally {
      setIsLoadingGames(false);
    }
  }, [gameService, user?.id]);

  useEffect(() => {
    if (!isAuthenticated) {
      setIsLoadingGames(false);
      return;
    }

    void loadGames(true);
  }, [isAuthenticated, loadGames]);

  useSupabaseRealtime({
    channelName: `profile-schedule-${user?.id || 'anonymous'}`,
    tables: [
      DATABASE_TABLES.GAMES,
      DATABASE_TABLES.GAME_INVITES,
      DATABASE_TABLES.GAME_APPLICATIONS,
      DATABASE_TABLES.CHARACTERS
    ],
    onChange: loadGames,
    enabled: PROFILE_SCHEDULE_ENABLED && isAuthenticated
  });

  useEffect(() => {
    if (!selectedGame?._id) return;

    const refreshedGame = games.find(game => game._id === selectedGame._id);
    if (refreshedGame) {
      setSelectedGame(refreshedGame);
    } else {
      setSelectedGame(null);
    }
  }, [games, selectedGame?._id]);

  const schedule = useMemo(() => {
    const now = Date.now();
    const past = games
      .filter(game => game.startTime.getTime() < now)
      .sort((first, second) => second.startTime.getTime() - first.startTime.getTime())
      .slice(0, 3)
      .reverse();
    const upcoming = games
      .filter(game => game.startTime.getTime() >= now)
      .sort((first, second) => first.startTime.getTime() - second.startTime.getTime())
      .slice(0, 3);

    return { past, upcoming };
  }, [games]);

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <User className="w-16 h-16 text-yellow-400 mx-auto mb-6" />
          <h1 className="font-fantasy text-4xl font-bold text-white mb-6">Profile</h1>
          <p className="text-xl text-gray-300 mb-8">Please log in to view your profile.</p>
        </div>
      </div>
    );
  }

  const handleSaveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user.id) return;

    const nextUsername = profileName.trim();
    setProfileMessage(null);
    setProfileError(null);

    if (nextUsername.length < 2 || nextUsername.length > 40) {
      setProfileError('Display name must be 2 to 40 characters.');
      return;
    }

    setIsSavingProfile(true);
    try {
      const response = await userService.updateUser(user.id, { username: nextUsername });
      if (response.success) {
        await refreshUserProfile();
        setProfileMessage('Display name saved.');
      } else {
        setProfileError(response.error || 'Failed to save display name');
      }
    } catch (error) {
      console.error('Error updating display name:', error);
      setProfileError('Failed to save display name');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSavePrivacy = async () => {
    if (!user.id) return;

    setIsSavingPrivacy(true);
    try {
      const response = await userService.updateUser(user.id, { settings: settingsState });
      if (response.success) {
        await refreshUserProfile();
      } else {
        alert(response.error || 'Failed to save privacy settings');
      }
    } catch (error) {
      console.error('Error updating privacy settings:', error);
      alert('Failed to save privacy settings');
    } finally {
      setIsSavingPrivacy(false);
    }
  };

  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="bg-fantasy-900/30 border border-fantasy-700/30 rounded-xl p-6 mb-8">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
            <div className="relative">
              <img src={user.avatar} alt={user.username} className="w-24 h-24 rounded-full border-4 border-yellow-400" />
              <div className={`absolute bottom-2 left-2 w-6 h-6 rounded-full border-2 border-fantasy-900 ${user.profile?.isOnline ? 'bg-emerald-400' : 'bg-gray-400'}`} />
            </div>

            <div className="flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h1 className="font-fantasy text-3xl font-bold text-white mb-2">{user.username}</h1>
                  {(user.profile?.isAdmin || user.profile?.isLoremaster) && (
                    <div className="mb-3 flex flex-wrap gap-2" aria-label="Account roles">
                      {user.profile.isAdmin && <RoleBadge icon={ShieldCheck} label="Admin" />}
                      {user.profile.isLoremaster && <RoleBadge icon={BookOpen} label="Loremaster" />}
                    </div>
                  )}
                  <p className="text-gray-300">
                    Member since {user.profile?.joinDate ? new Date(user.profile.joinDate).toLocaleDateString() : 'Unknown'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-fantasy-900/30 border border-fantasy-700/30 rounded-xl p-6">
          {PROFILE_SCHEDULE_ENABLED && (
            <section>
              <div className="flex items-center gap-2 mb-6">
                <Calendar className="w-5 h-5 text-yellow-400" />
                <h2 className="text-2xl font-bold text-white">Schedule</h2>
              </div>
              {isLoadingGames ? (
                <div className="py-16 text-center">
                  <Loader2 className="w-8 h-8 text-yellow-400 mx-auto mb-4 animate-spin" />
                  <p className="text-gray-300">Loading your games...</p>
                </div>
              ) : (
                <Timeline past={schedule.past} upcoming={schedule.upcoming} userId={user.id} onOpen={setSelectedGame} />
              )}
            </section>
          )}

          <SettingsPanel
            username={profileName}
            allowWallPosts={settingsState.allowWallPosts}
            profilePrivate={settingsState.profilePrivate}
            isSavingProfile={isSavingProfile}
            isSavingPrivacy={isSavingPrivacy}
            profileMessage={profileMessage}
            profileError={profileError}
            onUsernameChange={(value) => {
              setProfileName(value);
              setProfileMessage(null);
              setProfileError(null);
            }}
            onSaveProfile={handleSaveProfile}
            onAllowWallPostsChange={(allowWallPosts) => setSettingsState(previous => ({ ...previous, allowWallPosts }))}
            onProfilePrivateChange={(profilePrivate) => setSettingsState(previous => ({ ...previous, profilePrivate }))}
            onSavePrivacy={() => void handleSavePrivacy()}
          />
        </div>
      </div>

      {PROFILE_SCHEDULE_ENABLED && selectedGame && <ScheduleGameModal game={selectedGame} userId={user.id} onClose={() => setSelectedGame(null)} />}
    </div>
  );
};

const Timeline: React.FC<{
  past: GameListing[];
  upcoming: GameListing[];
  userId: string;
  onOpen: (game: GameListing) => void;
}> = ({ past, upcoming, userId, onOpen }) => (
  <div className="overflow-x-auto pb-2">
    <div className="grid min-w-[760px] grid-cols-[repeat(3,minmax(150px,1fr))_140px_repeat(3,minmax(150px,1fr))] items-stretch gap-3">
      {padTimeline(past, 'past').map((item, index) => item ? (
        <TimelineCard key={item._id} game={item} userId={userId} side="past" onOpen={() => onOpen(item)} />
      ) : (
        <div key={`past-empty-${index}`} className="rounded-lg border border-fantasy-800/30 bg-midnight-900/20" />
      ))}
      <div className="flex flex-col items-center justify-center rounded-lg border border-yellow-400/50 bg-yellow-500/10 p-4 text-center">
        <Clock className="mb-2 h-5 w-5 text-yellow-300" />
        <p className="text-xs font-bold uppercase tracking-widest text-yellow-300">Now</p>
        <p className="mt-1 text-sm text-gray-200">{formatTimeOnly(new Date())}</p>
      </div>
      {padTimeline(upcoming, 'upcoming').map((item, index) => item ? (
        <TimelineCard key={item._id} game={item} userId={userId} side="upcoming" onOpen={() => onOpen(item)} />
      ) : (
        <div key={`upcoming-empty-${index}`} className="rounded-lg border border-fantasy-800/30 bg-midnight-900/20" />
      ))}
    </div>
    {past.length === 0 && upcoming.length === 0 && (
      <div className="mt-6 rounded-lg border border-fantasy-700/30 bg-midnight-900/30 p-8 text-center text-gray-300">
        No GM or player games are on your schedule yet.
      </div>
    )}
  </div>
);

const TimelineCard: React.FC<{
  game: GameListing;
  userId: string;
  side: 'past' | 'upcoming';
  onOpen: () => void;
}> = ({ game, userId, side, onOpen }) => (
  <button
    type="button"
    onClick={onOpen}
    className={`min-h-44 rounded-lg border p-4 text-left transition-colors ${
      side === 'past'
        ? 'border-fantasy-700/30 bg-fantasy-800/25 hover:bg-fantasy-800/40'
        : 'border-yellow-400/35 bg-yellow-500/10 hover:border-yellow-300/70'
    }`}
  >
    <p className="mb-2 text-xs font-bold uppercase tracking-widest text-yellow-300">{getUserGameRole(game, userId)}</p>
    <h3 className="line-clamp-2 text-lg font-bold text-white">{game.title}</h3>
    <p className="mt-2 text-sm text-gray-300">{formatDateTime(game.startTime)}</p>
    <p className="mt-2 text-xs font-bold text-gray-400">{game.status} - {game.tier}</p>
  </button>
);

const SettingsPanel: React.FC<{
  username: string;
  allowWallPosts: boolean;
  profilePrivate: boolean;
  isSavingProfile: boolean;
  isSavingPrivacy: boolean;
  profileMessage: string | null;
  profileError: string | null;
  onUsernameChange: (value: string) => void;
  onSaveProfile: (event: React.FormEvent<HTMLFormElement>) => void;
  onAllowWallPostsChange: (checked: boolean) => void;
  onProfilePrivateChange: (checked: boolean) => void;
  onSavePrivacy: () => void;
}> = ({
  username,
  allowWallPosts,
  profilePrivate,
  isSavingProfile,
  isSavingPrivacy,
  profileMessage,
  profileError,
  onUsernameChange,
  onSaveProfile,
  onAllowWallPostsChange,
  onProfilePrivateChange,
  onSavePrivacy
}) => (
  <div className="space-y-6">
    <div>
      <h2 className="text-2xl font-bold text-white">Profile settings</h2>
      <p className="mt-2 text-sm text-gray-400">Manage the settings that currently affect how your profile works.</p>
    </div>
    <form onSubmit={onSaveProfile}>
      <label htmlFor="profile-display-name" className="mb-2 block text-lg font-semibold text-white">
        Display name
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id="profile-display-name"
          type="text"
          value={username}
          onChange={(event) => onUsernameChange(event.target.value)}
          minLength={2}
          maxLength={40}
          className="min-w-0 flex-1 rounded-lg border border-fantasy-700 bg-midnight-950 px-4 py-3 text-white placeholder-gray-500 focus:border-yellow-400 focus:outline-none focus:ring-1 focus:ring-yellow-400"
          placeholder="Your display name"
        />
        <button
          type="submit"
          disabled={isSavingProfile}
          className="flex items-center justify-center gap-2 rounded-lg bg-yellow-500 px-5 py-3 font-bold text-midnight-900 transition-colors hover:bg-yellow-400 disabled:bg-gray-600"
        >
          {isSavingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>{isSavingProfile ? 'Saving...' : 'Save Name'}</span>
        </button>
      </div>
      {profileError && <p className="mt-2 text-sm text-red-300">{profileError}</p>}
      {profileMessage && <p className="mt-2 text-sm text-emerald-300">{profileMessage}</p>}
    </form>
    <div className="border-t border-fantasy-700/30 pt-6">
      <h3 className="text-lg font-semibold text-white">Privacy</h3>
      <p className="mt-1 text-sm text-gray-400">These choices are enforced when other members access your profile.</p>
      <div className="mt-4 space-y-4">
        <SettingCheckbox
          label="Private profile"
          description="Only you can access your user profile."
          checked={profilePrivate}
          onChange={onProfilePrivateChange}
        />
        <SettingCheckbox
          label="Allow profile posts"
          description="Other signed-in members can post on your profile when it is visible to them."
          checked={allowWallPosts}
          onChange={onAllowWallPostsChange}
        />
      </div>
      <button
        type="button"
        onClick={onSavePrivacy}
        disabled={isSavingPrivacy}
        className="mt-5 flex items-center gap-2 rounded-lg bg-yellow-500 px-5 py-3 font-bold text-midnight-900 transition-colors hover:bg-yellow-400 disabled:bg-gray-600"
      >
        {isSavingPrivacy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        <span>{isSavingPrivacy ? 'Saving...' : 'Save Privacy'}</span>
      </button>
    </div>
  </div>
);

const SettingCheckbox: React.FC<{
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ label, description, checked, onChange }) => (
  <label className="flex items-start gap-3">
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      className="form-checkbox mt-1 h-4 w-4 rounded border-fantasy-600 bg-fantasy-800 text-yellow-500 focus:ring-yellow-400"
    />
    <span>
      <span className="block font-medium text-gray-200">{label}</span>
      <span className="mt-0.5 block text-sm text-gray-400">{description}</span>
    </span>
  </label>
);

const RoleBadge: React.FC<{ icon: React.ComponentType<{ className?: string }>; label: string }> = ({ icon: Icon, label }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full border border-yellow-400/35 bg-yellow-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-yellow-200">
    <Icon className="h-3.5 w-3.5" />
    {label}
  </span>
);

const ScheduleGameModal: React.FC<{ game: GameListing; userId: string; onClose: () => void }> = ({ game, userId, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
    <div className="w-full max-w-2xl rounded-xl border border-fantasy-700/40 bg-midnight-950 p-6 shadow-2xl">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-yellow-300">{getUserGameRole(game, userId)} - {game.status}</p>
          <h2 className="font-fantasy text-3xl font-bold text-white">{game.title}</h2>
          <p className="mt-1 text-sm text-gray-300">{formatDateTime(game.startTime)} with GM {game.gmName}</p>
        </div>
        <button type="button" onClick={onClose} className="p-2 text-gray-400 hover:text-white" aria-label="Close game details">
          <X className="h-6 w-6" />
        </button>
      </div>
      <div className="space-y-4 text-sm text-gray-300">
        <p>{game.description}</p>
        <p>{formatDuration(game.durationMinutes)} - Level {game.characterLevel} - {game.tier}</p>
        <div className="flex flex-wrap gap-2">
          {game.tags.map(tag => <span key={tag} className="rounded bg-fantasy-800/60 px-2 py-1 text-xs font-semibold text-gray-200">{tag}</span>)}
        </div>
        <div>
          <h3 className="mb-2 text-lg font-bold text-white">Roster</h3>
          <div className="space-y-2">
            {game.applications.filter(application => application.status === 'Roster').map(application => (
              <div key={application._id} className="rounded-lg bg-fantasy-900/40 p-3">
                <p className="font-semibold text-white">{application.displayName}</p>
                <p className="text-gray-400">{application.characters.map(character => `${character.name} L${character.level}`).join(', ') || 'Character pending'}</p>
              </div>
            ))}
            {game.applications.filter(application => application.status === 'Roster').length === 0 && <p className="text-gray-500">Roster pending.</p>}
          </div>
        </div>
      </div>
    </div>
  </div>
);

const isUserGame = (game: GameListing, userId: string) =>
  game.gmId === userId || game.applications.some(application => application.userId === userId && application.status !== 'Withdrawn');

const getUserGameRole = (game: GameListing, userId: string) =>
  game.gmId === userId ? 'GM' : 'Player';

const padTimeline = (games: GameListing[], side: 'past' | 'upcoming') => {
  const padding = Array.from({ length: Math.max(0, 3 - games.length) }, () => null);
  return side === 'past' ? [...padding, ...games] : [...games, ...padding];
};

const formatDateTime = (date: Date) =>
  new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);

const formatTimeOnly = (date: Date) =>
  new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);

const formatDuration = (minutes: number) => {
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours} hours` : `${minutes} minutes`;
};

export default ProfilePage;
