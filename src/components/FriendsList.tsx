import React, { useState, useEffect } from 'react';
import { Users, MessageCircle, UserMinus, Check, X, UserPlus, Loader2 } from 'lucide-react';
import { FriendService } from '../services/friendService';
import { UserProfile } from '../types/database';
import { useAuth } from '../context/AuthContext';

const FriendsList: React.FC = () => {
  const [friends, setFriends] = useState<(UserProfile & { friendshipId: string })[]>([]);
  const [pendingRequests, setPendingRequests] = useState<(UserProfile & { friendshipId: string })[]>([]);
  const [activeTab, setActiveTab] = useState<'friends' | 'requests'>('friends');
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const { user } = useAuth();
  const friendService = FriendService.getInstance();

  useEffect(() => {
    if (user?.id) {
      loadFriendsData();
    }
  }, [user?.id]);

  const loadFriendsData = async () => {
    if (!user?.id) return;

    setIsLoading(true);
    try {
      const [friendsResponse, requestsResponse] = await Promise.all([
        friendService.getFriends(user.id),
        friendService.getPendingFriendRequests(user.id)
      ]);

      if (friendsResponse.success && friendsResponse.data) {
        setFriends(friendsResponse.data);
      }

      if (requestsResponse.success && requestsResponse.data) {
        setPendingRequests(requestsResponse.data);
      }
    } catch (error) {
      console.error('Error loading friends data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAcceptRequest = async (friendshipId: string) => {
    if (!user?.id) return;

    setActionLoading(prev => ({ ...prev, [friendshipId]: true }));
    try {
      const response = await friendService.respondToFriendRequest(friendshipId, user.id, true);
      if (response.success) {
        loadFriendsData(); // Refresh data
      } else {
        alert(response.error || 'Failed to accept friend request');
      }
    } catch (error) {
      console.error('Error accepting friend request:', error);
      alert('Failed to accept friend request');
    } finally {
      setActionLoading(prev => ({ ...prev, [friendshipId]: false }));
    }
  };

  const handleDeclineRequest = async (friendshipId: string) => {
    if (!user?.id) return;

    setActionLoading(prev => ({ ...prev, [friendshipId]: true }));
    try {
      const response = await friendService.respondToFriendRequest(friendshipId, user.id, false);
      if (response.success) {
        loadFriendsData(); // Refresh data
      } else {
        alert(response.error || 'Failed to decline friend request');
      }
    } catch (error) {
      console.error('Error declining friend request:', error);
      alert('Failed to decline friend request');
    } finally {
      setActionLoading(prev => ({ ...prev, [friendshipId]: false }));
    }
  };

  const handleRemoveFriend = async (friendId: string) => {
    if (!user?.id) return;

    if (confirm('Are you sure you want to remove this friend?')) {
      setActionLoading(prev => ({ ...prev, [friendId]: true }));
      try {
        const response = await friendService.removeFriend(user.id, friendId);
        if (response.success) {
          loadFriendsData(); // Refresh data
        } else {
          alert(response.error || 'Failed to remove friend');
        }
      } catch (error) {
        console.error('Error removing friend:', error);
        alert('Failed to remove friend');
      } finally {
        setActionLoading(prev => ({ ...prev, [friendId]: false }));
      }
    }
  };

  const handleStartConversation = (friend: UserProfile) => {
    // For now, just show an alert. In a real app, this would open a chat interface
    alert(`Starting conversation with ${friend.username}. This feature will be implemented in the messaging system.`);
  };

  if (isLoading) {
    return (
      <div className="bg-fantasy-900/30 border border-fantasy-700/30 rounded-xl p-6">
        <div className="text-center text-gray-400 flex items-center justify-center space-x-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading friends...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-fantasy-900/30 border border-fantasy-700/30 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white flex items-center space-x-2">
          <Users className="w-6 h-6" />
          <span>Friends</span>
        </h2>
        
        <div className="flex space-x-2">
          <button
            onClick={() => setActiveTab('friends')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'friends'
                ? 'bg-yellow-500 text-midnight-900'
                : 'bg-fantasy-700/50 text-gray-300 hover:bg-fantasy-600/50'
            }`}
          >
            Friends ({friends.length})
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors relative ${
              activeTab === 'requests'
                ? 'bg-yellow-500 text-midnight-900'
                : 'bg-fantasy-700/50 text-gray-300 hover:bg-fantasy-600/50'
            }`}
          >
            Requests ({pendingRequests.length})
            {pendingRequests.length > 0 && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"></span>
            )}
          </button>
        </div>
      </div>

      {activeTab === 'friends' ? (
        <div className="space-y-4">
          {friends.length === 0 ? (
            <div className="text-center py-8">
              <UserPlus className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-400">No friends yet. Start by searching for users!</p>
            </div>
          ) : (
            friends.map((friend) => (
              <div
                key={friend.friendshipId}
                className="flex items-center justify-between p-4 bg-fantasy-800/30 border border-fantasy-700/30 rounded-lg"
              >
                <div className="flex items-center space-x-3">
                  <div className="relative">
                    <img
                      src={friend.avatar}
                      alt={friend.username}
                      className="w-12 h-12 rounded-full border-2 border-yellow-400"
                    />
                    <div className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-fantasy-800 ${
                      friend.isOnline ? 'bg-emerald-400' : 'bg-gray-400'
                    }`}></div>
                  </div>
                  <div>
                    <h4 className="font-semibold text-white">{friend.username}</h4>
                    <p className="text-gray-400 text-sm">
                      {friend.isOnline ? (
                        <span className="text-emerald-400">Online</span>
                      ) : (
                        <span>Last seen {new Date(friend.lastActive).toLocaleDateString()}</span>
                      )}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleStartConversation(friend)}
                    className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                    title="Send Message"
                  >
                    <MessageCircle className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleRemoveFriend(friend.authUserId)}
                    disabled={actionLoading[friend.authUserId]}
                    className="p-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white rounded-lg transition-colors"
                    title="Remove Friend"
                  >
                    {actionLoading[friend.authUserId] ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <UserMinus className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {pendingRequests.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-400">No pending friend requests</p>
            </div>
          ) : (
            pendingRequests.map((request) => (
              <div
                key={request.friendshipId}
                className="flex items-center justify-between p-4 bg-fantasy-800/30 border border-fantasy-700/30 rounded-lg"
              >
                <div className="flex items-center space-x-3">
                  <img
                    src={request.avatar}
                    alt={request.username}
                    className="w-12 h-12 rounded-full border-2 border-yellow-400"
                  />
                  <div>
                    <h4 className="font-semibold text-white">{request.username}</h4>
                    <p className="text-gray-400 text-sm">Wants to be your friend</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleAcceptRequest(request.friendshipId)}
                    disabled={actionLoading[request.friendshipId]}
                    className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 text-white rounded-lg transition-colors"
                  >
                    {actionLoading[request.friendshipId] ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    <span>Accept</span>
                  </button>
                  <button
                    onClick={() => handleDeclineRequest(request.friendshipId)}
                    disabled={actionLoading[request.friendshipId]}
                    className="flex items-center space-x-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4" />
                    <span>Decline</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default FriendsList;
