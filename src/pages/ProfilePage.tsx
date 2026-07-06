import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { User, Settings, Edit, MessageSquare, Users, Trophy, Calendar, Upload, LogOut, Search, Save, Loader2 } from 'lucide-react';
import { UserService } from '../services/userService';
import SocialWall from '../components/SocialWall';
import FriendsList from '../components/FriendsList';
import UserSearch from '../components/UserSearch';

const ProfilePage: React.FC = () => {
  const { user, logout, isAuthenticated, refreshUserProfile } = useAuth();
  const [activeTab, setActiveTab] = useState('profile');
  const [isEditing, setIsEditing] = useState(false);
  const [editedBio, setEditedBio] = useState('');
  const [isSavingBio, setIsSavingBio] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settings, setSettings] = useState({
    allowWallPosts: true,
    showOnlineStatus: true,
    profilePrivate: false,
    notifications: {
      guildAnnouncements: true,
      friendRequests: true,
      eventReminders: false,
    }
  });

  const userService = UserService.getInstance();

  useEffect(() => {
    if (user?.profile) {
      setEditedBio(user.profile.bio || '');
      setSettings(user.profile.settings);
    }
  }, [user?.profile]);

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <User className="w-16 h-16 text-yellow-400 mx-auto mb-6" />
          <h1 className="font-fantasy text-4xl font-bold text-white mb-6">
            Profile
          </h1>
          <p className="text-xl text-gray-300 mb-8">
            Please log in to view your profile.
          </p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'profile', name: 'Profile', icon: User },
    { id: 'wall', name: 'Social Wall', icon: MessageSquare },
    { id: 'friends', name: 'Friends', icon: Users },
    { id: 'search', name: 'Find Friends', icon: Search },
    { id: 'achievements', name: 'Achievements', icon: Trophy },
    { id: 'settings', name: 'Settings', icon: Settings },
  ];

  const handleSaveBio = async () => {
    if (!user?.id) return;

    setIsSavingBio(true);
    try {
      const response = await userService.updateUser(user.id, { bio: editedBio });
      if (response.success) {
        setIsEditing(false);
        await refreshUserProfile();
      } else {
        alert(response.error || 'Failed to update bio');
      }
    } catch (error) {
      console.error('Error updating bio:', error);
      alert('Failed to update bio');
    } finally {
      setIsSavingBio(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!user?.id) return;

    setIsSavingSettings(true);
    try {
      const response = await userService.updateUser(user.id, { settings });
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

  const mockAchievements = [
    { id: 1, name: "First Login", description: "Logged in for the first time", rarity: "Common", earned: "3 months ago" },
    { id: 2, name: "Social Butterfly", description: "Made your first friend", rarity: "Uncommon", earned: "2 months ago" },
    { id: 3, name: "Wall Writer", description: "Posted on someone's wall", rarity: "Uncommon", earned: "1 month ago" },
    { id: 4, name: "Community Member", description: "Active for 30 days", rarity: "Rare", earned: "2 weeks ago" }
  ];

  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Profile Header */}
        <div className="bg-fantasy-900/30 border border-fantasy-700/30 rounded-xl p-6 mb-8">
          <div className="flex flex-col md:flex-row items-start md:items-center space-y-4 md:space-y-0 md:space-x-6">
            <div className="relative">
              <img
                src={user.avatar}
                alt={user.username}
                className="w-24 h-24 rounded-full border-4 border-yellow-400"
              />
              <button
                onClick={handleAvatarUpload}
                className="absolute bottom-0 right-0 p-2 bg-yellow-500 hover:bg-yellow-400 text-midnight-900 rounded-full transition-colors"
                title="Upload Avatar"
              >
                <Upload className="w-4 h-4" />
              </button>
              <div className={`absolute bottom-2 left-2 w-6 h-6 rounded-full border-2 border-fantasy-900 ${
                user.profile?.isOnline ? 'bg-emerald-400' : 'bg-gray-400'
              }`}></div>
            </div>
            
            <div className="flex-1">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h1 className="font-fantasy text-3xl font-bold text-white mb-2">
                    {user.username}
                  </h1>
                  <p className="text-gray-300 mb-2">
                    Member since {user.profile?.joinDate ? new Date(user.profile.joinDate).toLocaleDateString() : 'Unknown'}
                  </p>
                  <div className="flex items-center space-x-4 text-sm">
                    <span className="flex items-center space-x-1">
                      <Users className="w-4 h-4 text-blue-400" />
                      <span className="text-blue-400">Guild Member</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <Trophy className="w-4 h-4 text-yellow-400" />
                      <span className="text-gray-300">{mockAchievements.length} Achievements</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <Calendar className="w-4 h-4 text-purple-400" />
                      <span className="text-gray-300">
                        Last active: {user.profile?.lastActive ? new Date(user.profile.lastActive).toLocaleDateString() : 'Unknown'}
                      </span>
                    </span>
                  </div>
                </div>
                
                <div className="flex space-x-3 mt-4 sm:mt-0">
                  <button
                    onClick={() => setIsEditing(!isEditing)}
                    className="px-4 py-2 bg-fantasy-700 hover:bg-fantasy-600 text-white rounded-lg transition-colors flex items-center space-x-2"
                  >
                    <Edit className="w-4 h-4" />
                    <span>Edit Profile</span>
                  </button>
                  <button
                    onClick={logout}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center space-x-2"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Logout</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Bio Section */}
          <div className="mt-6 pt-6 border-t border-fantasy-700/30">
            <h3 className="text-lg font-semibold text-white mb-3">Bio</h3>
            {isEditing ? (
              <div>
                <textarea
                  value={editedBio}
                  onChange={(e) => setEditedBio(e.target.value)}
                  placeholder="Tell other adventurers about yourself..."
                  className="w-full p-3 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400 resize-none"
                  rows={4}
                  maxLength={500}
                />
                <div className="flex justify-between items-center mt-3">
                  <span className="text-gray-400 text-sm">
                    {editedBio.length}/500 characters
                  </span>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => {
                        setIsEditing(false);
                        setEditedBio(user.profile?.bio || '');
                      }}
                      className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveBio}
                      disabled={isSavingBio || editedBio.length > 500}
                      className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-600 text-midnight-900 font-bold rounded-lg transition-colors flex items-center space-x-2"
                    >
                      {isSavingBio ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      <span>{isSavingBio ? 'Saving...' : 'Save Bio'}</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-gray-300 leading-relaxed">
                {user.profile?.bio || 'No bio yet. Click "Edit Profile" to add one!'}
              </p>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap space-x-1 mb-8 bg-fantasy-900/30 p-2 rounded-lg">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-md font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-yellow-500 text-midnight-900'
                    : 'text-gray-300 hover:text-white hover:bg-fantasy-700/50'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.name}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="bg-fantasy-900/30 border border-fantasy-700/30 rounded-xl p-6">
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-white mb-4">Profile Statistics</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-fantasy-800/30 border border-fantasy-700/30 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-yellow-400 mb-2">
                    {user.profile?.stats?.totalSessions || 0}
                  </div>
                  <div className="text-gray-300">Total Sessions</div>
                </div>
                
                <div className="bg-fantasy-800/30 border border-fantasy-700/30 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-blue-400 mb-2">
                    {user.profile?.stats?.joinedGuilds || 0}
                  </div>
                  <div className="text-gray-300">Guilds Joined</div>
                </div>
                
                <div className="bg-fantasy-800/30 border border-fantasy-700/30 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-purple-400 mb-2">
                    {user.profile?.stats?.totalAchievements || 0}
                  </div>
                  <div className="text-gray-300">Achievements</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-white font-semibold mb-3">Account Information</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">Username</label>
                      <div className="text-white">{user.username}</div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">Email</label>
                      <div className="text-white">{user.email}</div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">Account ID</label>
                      <div className="text-white font-mono text-sm">{user.id}</div>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-white font-semibold mb-3">Activity</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">Status</label>
                      <div className={`flex items-center space-x-2 ${
                        user.profile?.isOnline ? 'text-emerald-400' : 'text-gray-400'
                      }`}>
                        <div className={`w-2 h-2 rounded-full ${
                          user.profile?.isOnline ? 'bg-emerald-400' : 'bg-gray-400'
                        }`}></div>
                        <span>{user.profile?.isOnline ? 'Online' : 'Offline'}</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">Last Active</label>
                      <div className="text-white">
                        {user.profile?.lastActive ? new Date(user.profile.lastActive).toLocaleString() : 'Unknown'}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">Join Date</label>
                      <div className="text-white">
                        {user.profile?.joinDate ? new Date(user.profile.joinDate).toLocaleDateString() : 'Unknown'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'wall' && user.id && (
            <SocialWall targetUserId={user.id} canPost={false} />
          )}

          {activeTab === 'friends' && (
            <FriendsList />
          )}

          {activeTab === 'search' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-white mb-4">Find Friends</h2>
              <UserSearch />
            </div>
          )}

          {activeTab === 'achievements' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-white">Achievements</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {mockAchievements.map((achievement) => (
                  <div key={achievement.id} className="bg-fantasy-800/30 border border-fantasy-700/30 rounded-lg p-4">
                    <div className="flex items-start space-x-3">
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                        achievement.rarity === 'Epic' ? 'bg-purple-500/20' :
                        achievement.rarity === 'Rare' ? 'bg-blue-500/20' :
                        achievement.rarity === 'Uncommon' ? 'bg-green-500/20' :
                        'bg-gray-500/20'
                      }`}>
                        <Trophy className={`w-6 h-6 ${
                          achievement.rarity === 'Epic' ? 'text-purple-400' :
                          achievement.rarity === 'Rare' ? 'text-blue-400' :
                          achievement.rarity === 'Uncommon' ? 'text-green-400' :
                          'text-gray-400'
                        }`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <h4 className="font-semibold text-white">{achievement.name}</h4>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            achievement.rarity === 'Epic' ? 'bg-purple-500/20 text-purple-400' :
                            achievement.rarity === 'Rare' ? 'bg-blue-500/20 text-blue-400' :
                            achievement.rarity === 'Uncommon' ? 'bg-green-500/20 text-green-400' :
                            'bg-gray-500/20 text-gray-400'
                          }`}>
                            {achievement.rarity}
                          </span>
                        </div>
                        <p className="text-gray-300 text-sm mb-2">{achievement.description}</p>
                        <p className="text-gray-400 text-xs">Earned {achievement.earned}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-white">Settings</h2>
              
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">Privacy Settings</h3>
                  <div className="space-y-3">
                    <label className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={settings.allowWallPosts}
                        onChange={(e) => setSettings(prev => ({ ...prev, allowWallPosts: e.target.checked }))}
                        className="form-checkbox h-4 w-4 text-yellow-500 bg-fantasy-800 border-fantasy-600 rounded focus:ring-yellow-400"
                      />
                      <span className="text-gray-300">Allow others to write on my wall</span>
                    </label>
                    <label className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={settings.showOnlineStatus}
                        onChange={(e) => setSettings(prev => ({ ...prev, showOnlineStatus: e.target.checked }))}
                        className="form-checkbox h-4 w-4 text-yellow-500 bg-fantasy-800 border-fantasy-600 rounded focus:ring-yellow-400"
                      />
                      <span className="text-gray-300">Show online status to friends</span>
                    </label>
                    <label className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={settings.profilePrivate}
                        onChange={(e) => setSettings(prev => ({ ...prev, profilePrivate: e.target.checked }))}
                        className="form-checkbox h-4 w-4 text-yellow-500 bg-fantasy-800 border-fantasy-600 rounded focus:ring-yellow-400"
                      />
                      <span className="text-gray-300">Make profile private</span>
                    </label>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">Notifications</h3>
                  <div className="space-y-3">
                    <label className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={settings.notifications.guildAnnouncements}
                        onChange={(e) => setSettings(prev => ({
                          ...prev,
                          notifications: { ...prev.notifications, guildAnnouncements: e.target.checked }
                        }))}
                        className="form-checkbox h-4 w-4 text-yellow-500 bg-fantasy-800 border-fantasy-600 rounded focus:ring-yellow-400"
                      />
                      <span className="text-gray-300">Guild announcements</span>
                    </label>
                    <label className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={settings.notifications.friendRequests}
                        onChange={(e) => setSettings(prev => ({
                          ...prev,
                          notifications: { ...prev.notifications, friendRequests: e.target.checked }
                        }))}
                        className="form-checkbox h-4 w-4 text-yellow-500 bg-fantasy-800 border-fantasy-600 rounded focus:ring-yellow-400"
                      />
                      <span className="text-gray-300">Friend requests</span>
                    </label>
                    <label className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={settings.notifications.eventReminders}
                        onChange={(e) => setSettings(prev => ({
                          ...prev,
                          notifications: { ...prev.notifications, eventReminders: e.target.checked }
                        }))}
                        className="form-checkbox h-4 w-4 text-yellow-500 bg-fantasy-800 border-fantasy-600 rounded focus:ring-yellow-400"
                      />
                      <span className="text-gray-300">Event reminders</span>
                    </label>
                  </div>
                </div>

                <div className="pt-6 border-t border-fantasy-700/30">
                  <button
                    onClick={handleSaveSettings}
                    disabled={isSavingSettings}
                    className="px-6 py-3 bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-600 text-midnight-900 font-bold rounded-lg transition-all transform hover:scale-105 flex items-center space-x-2"
                  >
                    {isSavingSettings ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    <span>{isSavingSettings ? 'Saving...' : 'Save Settings'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
