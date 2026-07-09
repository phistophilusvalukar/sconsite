import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, Clock, Loader2, LogOut, Save, Settings, Upload, User, X } from 'lucide-react';
import { DATABASE_TABLES } from '../config/database';
import { useAuth } from '../context/AuthContext';
import { useSupabaseRealtime } from '../hooks/useSupabaseRealtime';
import GameService from '../services/gameService';
import { UserService } from '../services/userService';
import { GameListing } from '../types/database';

type ProfileTab = 'schedule' | 'settings';

const ProfilePage: React.FC = () => {
  const { user, logout, isAuthenticated, refreshUserProfile } = useAuth();
  const userService = useMemo(() => UserService.getInstance(), []);
  const gameService = useMemo(() => GameService.getInstance(), []);
  const [activeTab, setActiveTab] = useState<ProfileTab>('schedule');
  const [games, setGames] = useState<GameListing[]>([]);
  const [isLoadingGames, setIsLoadingGames] = useState(true);
  const [selectedGame, setSelectedGame] = useState<GameListing | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
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

  useEffect(() => {
    if (user?.profile) {
      setSettingsState(user.profile.settings);
    }
  }, [user?.profile]);

  const loadGames = useCallback(async () => {
    if (!user?.id) {
      setIsLoadingGames(false);
      return;
    }

    setIsLoadingGames(true);
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

    loadGames();
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
    enabled: isAuthenticated
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

  const handleSaveSettings = async () => {
    if (!user.id) return;

    setIsSavingSettings(true);
    try {
      const response = await userService.updateUser(user.id, { settings: settingsState });
      if (response.success) {
        await refreshUserProfile();
        alert('Settings saved successfully!');
      } else {
        alert(response.error || 'Failed to save settings');
      }
    } catch (error) {
      console.error('Error updating settings:', error);
      alert('Failed to save settings');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleAvatarUpload = () => {
    alert('Avatar upload functionality will be implemented. For now, your Google profile image is used automatically.');
  };

  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="bg-fantasy-900/30 border border-fantasy-700/30 rounded-xl p-6 mb-8">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
            <div className="relative">
              <img src={user.avatar} alt={user.username} className="w-24 h-24 rounded-full border-4 border-yellow-400" />
              <button
                type="button"
                onClick={handleAvatarUpload}
                className="absolute bottom-0 right-0 p-2 bg-yellow-500 hover:bg-yellow-400 text-midnight-900 rounded-full transition-colors"
                title="Upload Avatar"
              >
                <Upload className="w-4 h-4" />
              </button>
              <div className={`absolute bottom-2 left-2 w-6 h-6 rounded-full border-2 border-fantasy-900 ${user.profile?.isOnline ? 'bg-emerald-400' : 'bg-gray-400'}`} />
            </div>

            <div className="flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h1 className="font-fantasy text-3xl font-bold text-white mb-2">{user.username}</h1>
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

        <div className="flex flex-wrap gap-2 mb-8 bg-fantasy-900/30 p-2 rounded-lg">
          <TabButton active={activeTab === 'schedule'} icon={Calendar} label="Schedule" onClick={() => setActiveTab('schedule')} />
          <TabButton active={activeTab === 'settings'} icon={Settings} label="Settings" onClick={() => setActiveTab('settings')} />
        </div>

        <div className="bg-fantasy-900/30 border border-fantasy-700/30 rounded-xl p-6">
          {activeTab === 'schedule' && (
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

          {activeTab === 'settings' && (
            <SettingsPanel
              settings={settingsState}
              isSaving={isSavingSettings}
              onChange={setSettingsState}
              onSave={handleSaveSettings}
            />
          )}
        </div>
      </div>

      {selectedGame && <ScheduleGameModal game={selectedGame} userId={user.id} onClose={() => setSelectedGame(null)} />}
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
  settings: {
    allowWallPosts: boolean;
    showOnlineStatus: boolean;
    profilePrivate: boolean;
    notifications: {
      guildAnnouncements: boolean;
      friendRequests: boolean;
      eventReminders: boolean;
    };
  };
  isSaving: boolean;
  onChange: React.Dispatch<React.SetStateAction<{
    allowWallPosts: boolean;
    showOnlineStatus: boolean;
    profilePrivate: boolean;
    notifications: {
      guildAnnouncements: boolean;
      friendRequests: boolean;
      eventReminders: boolean;
    };
  }>>;
  onSave: () => void;
}> = ({ settings, isSaving, onChange, onSave }) => (
  <div className="space-y-6">
    <h2 className="text-2xl font-bold text-white">Settings</h2>
    <div>
      <h3 className="text-lg font-semibold text-white mb-4">Privacy Settings</h3>
      <div className="space-y-3">
        <SettingCheckbox label="Allow profile posts" checked={settings.allowWallPosts} onChange={checked => onChange(prev => ({ ...prev, allowWallPosts: checked }))} />
        <SettingCheckbox label="Show online status" checked={settings.showOnlineStatus} onChange={checked => onChange(prev => ({ ...prev, showOnlineStatus: checked }))} />
        <SettingCheckbox label="Make profile private" checked={settings.profilePrivate} onChange={checked => onChange(prev => ({ ...prev, profilePrivate: checked }))} />
      </div>
    </div>
    <div>
      <h3 className="text-lg font-semibold text-white mb-4">Notifications</h3>
      <div className="space-y-3">
        <SettingCheckbox label="Guild announcements" checked={settings.notifications.guildAnnouncements} onChange={checked => onChange(prev => ({ ...prev, notifications: { ...prev.notifications, guildAnnouncements: checked } }))} />
        <SettingCheckbox label="Connection requests" checked={settings.notifications.friendRequests} onChange={checked => onChange(prev => ({ ...prev, notifications: { ...prev.notifications, friendRequests: checked } }))} />
        <SettingCheckbox label="Event reminders" checked={settings.notifications.eventReminders} onChange={checked => onChange(prev => ({ ...prev, notifications: { ...prev.notifications, eventReminders: checked } }))} />
      </div>
    </div>
    <div className="pt-6 border-t border-fantasy-700/30">
      <button
        type="button"
        onClick={onSave}
        disabled={isSaving}
        className="px-6 py-3 bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-600 text-midnight-900 font-bold rounded-lg transition-colors flex items-center gap-2"
      >
        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
      </button>
    </div>
  </div>
);

const SettingCheckbox: React.FC<{ label: string; checked: boolean; onChange: (checked: boolean) => void }> = ({ label, checked, onChange }) => (
  <label className="flex items-center gap-3">
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      className="form-checkbox h-4 w-4 text-yellow-500 bg-fantasy-800 border-fantasy-600 rounded focus:ring-yellow-400"
    />
    <span className="text-gray-300">{label}</span>
  </label>
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

const TabButton: React.FC<{ active: boolean; icon: React.ComponentType<{ className?: string }>; label: string; onClick: () => void }> = ({ active, icon: Icon, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all ${
      active ? 'bg-yellow-500 text-midnight-900' : 'text-gray-300 hover:text-white hover:bg-fantasy-700/50'
    }`}
  >
    <Icon className="w-4 h-4" />
    <span>{label}</span>
  </button>
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
