import React, { useState, useEffect, useMemo } from 'react';
import { Search, UserPlus, MessageCircle, Shield, Loader2 } from 'lucide-react';
import { UserService } from '../services/userService';
import { FriendService } from '../services/friendService';
import { UserProfile } from '../types/database';
import { useAuth } from '../context/AuthContext';

interface UserSearchProps {
  onUserSelect?: (user: UserProfile) => void;
}

const UserSearch: React.FC<UserSearchProps> = ({ onUserSelect }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [isResultsOpen, setIsResultsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [friendshipStatuses, setFriendshipStatuses] = useState<Record<string, string>>({});
  const [sendingRequests, setSendingRequests] = useState<Record<string, boolean>>({});
  
  const { user } = useAuth();
  const userService = useMemo(() => UserService.getInstance(), []);
  const friendService = useMemo(() => FriendService.getInstance(), []);

  useEffect(() => {
    const searchUsers = async () => {
      if (searchQuery.trim().length < 2) {
        setSearchResults([]);
        return;
      }

      setIsLoading(true);
      try {
        const response = await userService.searchUsers(searchQuery, 10);
        if (response.success && response.data) {
          // Filter out current user
          const filteredResults = response.data.filter(u => u.authUserId !== user?.id);
          setSearchResults(filteredResults);
          setIsResultsOpen(true);
          
          // Get friendship statuses
          if (user?.id) {
            const statusEntries = await Promise.all(filteredResults.map(async (searchUser) => {
              const statusResponse = await friendService.getFriendshipStatus(user.id, searchUser.authUserId);
              if (statusResponse.success && statusResponse.data) {
                return [searchUser.authUserId, statusResponse.data] as const;
              }
              return [searchUser.authUserId, 'none'] as const;
            }));
            setFriendshipStatuses(Object.fromEntries(statusEntries));
          }
        }
      } catch (error) {
        console.error('Error searching users:', error);
      } finally {
        setIsLoading(false);
      }
    };

    const debounceTimer = setTimeout(searchUsers, 300);
    return () => clearTimeout(debounceTimer);
  }, [friendService, searchQuery, user?.id, userService]);

  const handleSendFriendRequest = async (targetUserId: string) => {
    if (!user?.id) return;

    setSendingRequests(prev => ({ ...prev, [targetUserId]: true }));
    try {
      const response = await friendService.sendFriendRequest(user.id, targetUserId);
      if (response.success) {
        setFriendshipStatuses(prev => ({
          ...prev,
          [targetUserId]: 'pending_sent'
        }));
      } else {
        alert(response.error || 'Failed to send friend request');
      }
    } catch (error) {
      console.error('Error sending friend request:', error);
      alert('Failed to send friend request');
    } finally {
      setSendingRequests(prev => ({ ...prev, [targetUserId]: false }));
    }
  };

  const handleStartConversation = (targetUser: UserProfile) => {
    // For now, just show an alert. In a real app, this would open a chat interface
    alert(`Starting conversation with ${targetUser.username}. This feature will be implemented in the messaging system.`);
  };

  const handleAutocompleteSelect = (targetUser: UserProfile) => {
    setSearchQuery(targetUser.username);
    setSearchResults([]);
    setIsResultsOpen(false);
    onUserSelect?.(targetUser);
  };

  const getFriendshipStatusDisplay = (status: string) => {
    switch (status) {
      case 'accepted': return { text: 'Friends', color: 'text-emerald-400', icon: MessageCircle };
      case 'pending_sent': return { text: 'Request Sent', color: 'text-yellow-400', icon: Shield };
      case 'pending_received': return { text: 'Pending', color: 'text-blue-400', icon: Shield };
      case 'blocked': return { text: 'Blocked', color: 'text-red-400', icon: Shield };
      default: return { text: 'Add Friend', color: 'text-gray-400', icon: UserPlus };
    }
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="search"
          placeholder="Search by username..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setIsResultsOpen(true);
          }}
          onFocus={() => setIsResultsOpen(searchQuery.trim().length >= 2)}
          className="w-full pl-10 pr-4 py-3 bg-fantasy-900/30 border border-fantasy-700/30 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
        />
      </div>

      {isResultsOpen && searchQuery.length >= 2 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-fantasy-900/95 border border-fantasy-700/30 rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-center text-gray-400 flex items-center justify-center space-x-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Searching...</span>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="p-4 text-center text-gray-400">No users found</div>
          ) : (
            <div className="p-2">
              {searchResults.map((searchUser) => {
                const status = friendshipStatuses[searchUser.authUserId] || 'none';
                const statusDisplay = getFriendshipStatusDisplay(status);
                const isSendingRequest = sendingRequests[searchUser.authUserId];

                return (
                  <div
                    key={searchUser.authUserId}
                    className="flex items-center justify-between p-3 hover:bg-fantasy-800/30 rounded-lg"
                  >
                    <div 
                      className="flex items-center space-x-3 flex-1 cursor-pointer"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => handleAutocompleteSelect(searchUser)}
                    >
                      <div className="relative">
                        <img
                          src={searchUser.avatar}
                          alt={searchUser.username}
                          className="w-10 h-10 rounded-full border-2 border-yellow-400"
                        />
                        <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border border-fantasy-900 ${
                          searchUser.isOnline ? 'bg-emerald-400' : 'bg-gray-400'
                        }`}></div>
                      </div>
                      <div>
                        <h4 className="font-semibold text-white">{searchUser.username}</h4>
                        <p className="text-gray-400 text-sm">
                          {searchUser.isOnline ? 'Online' : 'Offline'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <span className={`text-sm ${statusDisplay.color}`}>
                        {statusDisplay.text}
                      </span>
                      {status === 'none' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSendFriendRequest(searchUser.authUserId);
                          }}
                          disabled={isSendingRequest}
                          className="p-2 bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-600 text-midnight-900 rounded-lg transition-colors flex items-center"
                        >
                          {isSendingRequest ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <UserPlus className="w-4 h-4" />
                          )}
                        </button>
                      )}
                      {status === 'accepted' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartConversation(searchUser);
                          }}
                          className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default UserSearch;
