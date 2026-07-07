import React, { useEffect, useMemo, useState } from 'react';
import { Crown, Loader2, LogOut, Plus, Search, Shield, UserPlus, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Character, Guild } from '../types/database';
import { CharacterService } from '../services/characterService';
import GuildService from '../services/guildService';

const GuildsPage: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedGuildId, setSelectedGuildId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isGuildSearchFocused, setIsGuildSearchFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateGuild, setShowCreateGuild] = useState(false);
  const [newGuild, setNewGuild] = useState({
    name: '',
    description: '',
    leaderCharacterId: '',
    type: 'Adventuring',
    region: '',
    requirements: ''
  });
  const [founderSearch, setFounderSearch] = useState('');
  const [founderResults, setFounderResults] = useState<Character[]>([]);
  const [isSearchingFounders, setIsSearchingFounders] = useState(false);
  const [applicationRole, setApplicationRole] = useState<'Officer' | 'Member' | 'Ally'>('Member');
  const [applicationCharacterId, setApplicationCharacterId] = useState('');
  const [applicationMessage, setApplicationMessage] = useState('');
  const [roleEdits, setRoleEdits] = useState<Record<string, { roleCategory: 'Officer' | 'Member' | 'Ally'; roleTitle: string }>>({});

  const guildService = useMemo(() => GuildService.getInstance(), []);
  const characterService = useMemo(() => CharacterService.getInstance(), []);

  const selectedGuild = guilds.find(guild => guild._id === selectedGuildId);
  const eligibleLeaderCharacters = characters.filter(character => character.level >= 4);

  const filteredGuilds = guilds.filter(guild => {
    const term = searchTerm.toLowerCase();
    return guild.name.toLowerCase().includes(term)
      || guild.description.toLowerCase().includes(term)
      || guild.status.toLowerCase().includes(term);
  });

  const guildSuggestions = searchTerm.trim()
    ? filteredGuilds.slice(0, 6)
    : guilds.slice(0, 6);

  useEffect(() => {
    loadGuilds();
  }, []);

  useEffect(() => {
    if (user?.id) {
      loadCharacters();
    }
  }, [user?.id]);

  useEffect(() => {
    const searchFounders = async () => {
      if (founderSearch.trim().length < 2 || !selectedGuild?._id || !user?.id) {
        setFounderResults([]);
        return;
      }

      setIsSearchingFounders(true);
      try {
        const response = await guildService.searchEligibleFoundingCharacters(selectedGuild._id, user.id, founderSearch);
        if (response.success && response.data) {
          setFounderResults(response.data);
        } else {
          setFounderResults([]);
        }
      } finally {
        setIsSearchingFounders(false);
      }
    };

    const debounceTimer = window.setTimeout(searchFounders, 300);
    return () => window.clearTimeout(debounceTimer);
  }, [founderSearch, guildService, selectedGuild?._id, user?.id]);

  const loadGuilds = async () => {
    setIsLoading(true);
    try {
      const response = await guildService.getGuilds();
      if (response.success && response.data) {
        setGuilds(response.data);
      } else {
        console.error('Failed to load guilds:', response.error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loadCharacters = async () => {
    if (!user?.id) return;

    const response = await characterService.getUserCharacters(user.id);
    if (response.success && response.data) {
      setCharacters(response.data);
    }
  };

  const handleCreateGuild = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;

    const result = await guildService.createGuild({
      ...newGuild,
      leaderId: user.id
    });

    if (result.success) {
      setShowCreateGuild(false);
      setNewGuild({
        name: '',
        description: '',
        leaderCharacterId: '',
        type: 'Adventuring',
        region: '',
        requirements: ''
      });
      await loadGuilds();
    } else {
      alert(result.error || 'Failed to create guild');
    }
  };

  const handleSearchFounders = async () => {
    if (!founderSearch.trim() || !selectedGuild?._id || !user?.id) return;

    setIsSearchingFounders(true);
    const response = await guildService.searchEligibleFoundingCharacters(selectedGuild._id, user.id, founderSearch);
    setIsSearchingFounders(false);
    if (response.success && response.data) {
      setFounderResults(response.data);
    } else {
      alert(response.error || 'Failed to search characters');
    }
  };

  const handleAddFounder = async (founder: Character) => {
    if (!selectedGuild?._id || !user?.id) return;

    const result = await guildService.addFoundingMember(selectedGuild._id, user.id, founder._id || '');
    if (result.success) {
      setFounderSearch('');
      setFounderResults([]);
      await loadGuilds();
    } else {
      alert(result.error || 'Failed to add founding member');
    }
  };

  const handleApply = async () => {
    if (!selectedGuild?._id || !user?.id) return;
    if (!applicationCharacterId) {
      alert('Choose a character before applying.');
      return;
    }

    const result = await guildService.applyToGuild(
      selectedGuild._id,
      user.id,
      applicationRole,
      applicationCharacterId || undefined,
      applicationMessage
    );

    if (result.success) {
      setApplicationMessage('');
      alert(result.message || 'Application submitted');
    } else {
      alert(result.error || 'Failed to apply');
    }
  };

  const getStatusClass = (status: Guild['status']) => {
    if (status === 'Active') return 'bg-emerald-500/20 text-emerald-300';
    if (status === 'Recruiting') return 'bg-yellow-500/20 text-yellow-300';
    return 'bg-gray-500/20 text-gray-300';
  };

  const getFoundingCount = (guild: Guild) =>
    guild.memberships?.filter(member => member.membershipStatus === 'Active' && member.roleCategory !== 'Ally' && member.roleCategory !== 'Leader').length || 0;

  const isSelectedGuildLeader = Boolean(selectedGuild && user?.id === selectedGuild.leaderId);
  const currentUserMembership = selectedGuild?.memberships?.find(member => member.userId === user?.id && member.membershipStatus === 'Active');
  const currentUserHasCharacterInGuild = Boolean(currentUserMembership);
  const pendingApplications = selectedGuild?.applications?.filter(application => application.status === 'Pending') || [];

  const getMemberEdit = (memberId: string, roleCategory: 'Officer' | 'Member' | 'Ally', roleTitle = '') =>
    roleEdits[memberId] || { roleCategory, roleTitle };

  const handleRoleEditChange = (
    memberId: string,
    field: 'roleCategory' | 'roleTitle',
    value: 'Officer' | 'Member' | 'Ally' | string
  ) => {
    const member = selectedGuild?.memberships?.find(item => item._id === memberId);
    if (!member) return;

    setRoleEdits(prev => ({
      ...prev,
      [memberId]: {
        roleCategory: field === 'roleCategory' ? value as 'Officer' | 'Member' | 'Ally' : prev[memberId]?.roleCategory || member.roleCategory as 'Officer' | 'Member' | 'Ally',
        roleTitle: field === 'roleTitle' ? value : prev[memberId]?.roleTitle || member.roleTitle || ''
      }
    }));
  };

  const handleUpdateRole = async (memberId?: string) => {
    if (!memberId || !selectedGuild?._id || !user?.id) return;
    const member = selectedGuild.memberships?.find(item => item._id === memberId);
    if (!member || member.roleCategory === 'Leader') return;

    const edit = getMemberEdit(memberId, member.roleCategory as 'Officer' | 'Member' | 'Ally', member.roleTitle);
    const result = await guildService.updateMemberRole(
      selectedGuild._id,
      user.id,
      memberId,
      edit.roleCategory,
      edit.roleTitle || edit.roleCategory
    );

    if (result.success) {
      setRoleEdits(prev => {
        const next = { ...prev };
        delete next[memberId];
        return next;
      });
      await loadGuilds();
    } else {
      alert(result.error || 'Failed to update role');
    }
  };

  const handleApplicationDecision = async (applicationId: string | undefined, decision: 'accept' | 'reject') => {
    if (!applicationId || !selectedGuild?._id || !user?.id) return;

    const result = decision === 'accept'
      ? await guildService.acceptApplication(selectedGuild._id, user.id, applicationId)
      : await guildService.rejectApplication(selectedGuild._id, user.id, applicationId);

    if (result.success) {
      await loadGuilds();
    } else {
      alert(result.error || `Failed to ${decision} application`);
    }
  };

  const handleLeaveGuild = async (membershipId?: string) => {
    if (!membershipId || !selectedGuild?._id || !user?.id) return;

    const confirmed = window.confirm('Leave this guild? Your character will be removed from the roster.');
    if (!confirmed) return;

    const result = await guildService.leaveGuild(selectedGuild._id, user.id, membershipId);
    if (result.success) {
      await Promise.all([loadGuilds(), loadCharacters()]);
    } else {
      alert(result.error || 'Failed to leave guild');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <Shield className="w-16 h-16 text-yellow-400 mx-auto mb-6" />
          <h1 className="font-fantasy text-4xl font-bold text-white mb-6">Guild Directory</h1>
          <p className="text-xl text-gray-300">Please log in to view and manage guilds.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="font-fantasy text-4xl font-bold text-white mb-2">Guild Directory</h1>
            <p className="text-gray-300">Create, recruit, and apply to player-run guilds.</p>
          </div>
          <button
            onClick={() => setShowCreateGuild(true)}
            className="flex items-center justify-center space-x-2 px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-midnight-900 font-bold rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>Create Guild</span>
          </button>
        </div>

        <div className="relative mb-8">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search guilds..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => setIsGuildSearchFocused(true)}
            onBlur={() => window.setTimeout(() => setIsGuildSearchFocused(false), 150)}
            className="w-full pl-10 pr-4 py-3 bg-fantasy-900/30 border border-fantasy-700/30 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400"
          />
          {isGuildSearchFocused && guildSuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-fantasy-900/95 border border-fantasy-700/30 rounded-lg shadow-xl z-40 overflow-hidden">
              {guildSuggestions.map(guild => (
                <button
                  key={guild._id}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setSearchTerm(guild.name);
                    setSelectedGuildId(guild._id || null);
                    setIsGuildSearchFocused(false);
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-fantasy-800/50 transition-colors"
                >
                  <span className="block text-white font-semibold">{guild.name}</span>
                  <span className="block text-sm text-gray-400">{guild.type} - {guild.status}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 text-yellow-400 mx-auto mb-4 animate-spin" />
            <p className="text-gray-300">Loading guilds...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {filteredGuilds.map(guild => (
              <button
                key={guild._id}
                onClick={() => setSelectedGuildId(guild._id || null)}
                className={`text-left bg-fantasy-900/30 border border-fantasy-700/30 rounded-xl p-6 hover:bg-fantasy-800/30 transition-all ${
                  selectedGuildId === guild._id ? 'ring-2 ring-yellow-400' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-1">{guild.name}</h3>
                    <p className="text-sm text-gray-400">{guild.type}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusClass(guild.status)}`}>
                    {guild.status}
                  </span>
                </div>
                <p className="text-gray-300 mb-4">{guild.description}</p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center space-x-2 text-gray-300">
                    <Crown className="w-4 h-4 text-yellow-400" />
                    <span>{guild.leaderCharacterName || 'Leader character'}</span>
                  </div>
                  <div className="flex items-center space-x-2 text-gray-300">
                    <Users className="w-4 h-4 text-blue-400" />
                    <span>{getFoundingCount(guild)}/{guild.foundingRequired || 3} founding members</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {!isLoading && filteredGuilds.length === 0 && (
          <div className="text-center py-12 bg-fantasy-900/20 border border-fantasy-700/30 rounded-xl">
            <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">No guilds yet</h2>
            <p className="text-gray-300">Create the first guild charter.</p>
          </div>
        )}

        {selectedGuild && (
          <div className="bg-fantasy-900/30 border border-fantasy-700/30 rounded-xl p-6">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-6">
              <div>
                <h2 className="font-fantasy text-3xl font-bold text-white mb-2">{selectedGuild.name}</h2>
                <p className="text-gray-300 max-w-3xl">{selectedGuild.description}</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusClass(selectedGuild.status)}`}>
                {selectedGuild.status}
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <h3 className="text-lg font-bold text-white mb-3">Members</h3>
                <div className="space-y-2">
                  {(selectedGuild.memberships || []).map(member => {
                    const canEditRole = isSelectedGuildLeader && member.roleCategory !== 'Leader' && Boolean(member._id);
                    const canLeaveGuild = member.userId === user?.id && member.membershipStatus === 'Active';
                    const edit = member._id
                      ? getMemberEdit(member._id, member.roleCategory as 'Officer' | 'Member' | 'Ally', member.roleTitle)
                      : { roleCategory: member.roleCategory, roleTitle: member.roleTitle || '' };
                    const characterName = member.character?.name || 'Unknown character';
                    const characterMeta = [
                      member.character?.class,
                      member.character?.level ? `Level ${member.character.level}` : ''
                    ].filter(Boolean).join(' - ');

                    return (
                      <div key={member._id} className="p-3 bg-fantasy-800/30 rounded-lg">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                          <div>
                            <p className="text-white font-medium">{characterName}</p>
                            <p className="text-xs text-gray-400">
                              {member.roleTitle || member.roleCategory}{characterMeta ? ` - ${characterMeta}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {!canEditRole && (
                              <span className="text-sm text-gray-300">{member.roleCategory}</span>
                            )}
                            {canLeaveGuild && (
                              <button
                                onClick={() => handleLeaveGuild(member._id)}
                                className="flex items-center gap-1 px-3 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg"
                              >
                                <LogOut className="w-4 h-4" />
                                <span>Leave</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {canEditRole && (
                          <div className="grid grid-cols-1 md:grid-cols-[140px_1fr_auto] gap-2 mt-3">
                            <select
                              value={edit.roleCategory}
                              onChange={(e) => handleRoleEditChange(member._id!, 'roleCategory', e.target.value as 'Officer' | 'Member' | 'Ally')}
                              className="p-2 bg-fantasy-900/50 border border-fantasy-700/30 rounded-lg text-white"
                            >
                              <option value="Officer">Officer</option>
                              <option value="Member">Member</option>
                              <option value="Ally">Ally</option>
                            </select>
                            <input
                              type="text"
                              value={edit.roleTitle}
                              onChange={(e) => handleRoleEditChange(member._id!, 'roleTitle', e.target.value)}
                              placeholder="Role title"
                              className="p-2 bg-fantasy-900/50 border border-fantasy-700/30 rounded-lg text-white placeholder-gray-400"
                            />
                            <button
                              onClick={() => handleUpdateRole(member._id)}
                              className="px-4 py-2 bg-fantasy-700 hover:bg-fantasy-600 text-white rounded-lg"
                            >
                              Save
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {isSelectedGuildLeader && selectedGuild.status === 'Recruiting' && (
                  <div className="mt-6 p-4 bg-fantasy-800/30 rounded-lg">
                    <h3 className="text-lg font-bold text-white mb-3">Add Founding Members</h3>
                    <p className="text-gray-300 text-sm mb-4">
                      A guild becomes Active when it has a leader and 3 founding member characters.
                    </p>
                    <div className="flex gap-2 mb-3">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={founderSearch}
                          onChange={(e) => setFounderSearch(e.target.value)}
                          placeholder="Search characters by name"
                          className="w-full p-3 bg-fantasy-900/50 border border-fantasy-700/30 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400"
                        />
                        {founderSearch.trim().length >= 2 && founderResults.length > 0 && (
                          <div className="absolute top-full left-0 right-0 mt-2 bg-fantasy-900/95 border border-fantasy-700/30 rounded-lg shadow-xl z-40 overflow-hidden">
                            {founderResults.slice(0, 6).map(founder => (
                              <button
                                key={founder._id}
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => setFounderSearch(founder.name)}
                                className="w-full text-left px-4 py-3 hover:bg-fantasy-800/50 transition-colors"
                              >
                                <span className="block text-white font-semibold">{founder.name}</span>
                                <span className="block text-sm text-gray-400">Level {founder.level} {founder.class}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={handleSearchFounders}
                        className="px-4 py-2 bg-fantasy-700 hover:bg-fantasy-600 text-white rounded-lg"
                      >
                        {isSearchingFounders ? 'Searching...' : 'Search'}
                      </button>
                    </div>
                    <div className="space-y-2">
                      {founderResults.map(founder => (
                        <div key={founder._id} className="flex items-center justify-between p-2 bg-fantasy-900/40 rounded">
                          <div>
                            <p className="text-white">{founder.name}</p>
                            <p className="text-xs text-gray-400">Level {founder.level} {founder.class}</p>
                          </div>
                          <button
                            onClick={() => handleAddFounder(founder)}
                            className="flex items-center space-x-1 px-3 py-1 bg-yellow-500 hover:bg-yellow-400 text-midnight-900 rounded font-medium"
                          >
                            <UserPlus className="w-4 h-4" />
                            <span>Add</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {isSelectedGuildLeader && (
                  <div className="mt-6 p-4 bg-fantasy-800/30 rounded-lg">
                    <h3 className="text-lg font-bold text-white mb-3">Applications</h3>
                    {pendingApplications.length === 0 ? (
                      <p className="text-sm text-gray-300">No pending applications.</p>
                    ) : (
                      <div className="space-y-3">
                        {pendingApplications.map(application => (
                          <div key={application._id} className="p-3 bg-fantasy-900/40 rounded-lg">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                              <div>
                                <p className="text-white font-medium">{application.character?.name || 'Unknown character'}</p>
                                <p className="text-sm text-gray-400">Requested role: {application.requestedRoleCategory}</p>
                                {application.character && (
                                  <p className="text-sm text-gray-400">Level {application.character.level} {application.character.class}</p>
                                )}
                                {application.message && (
                                  <p className="text-sm text-gray-300 mt-2">{application.message}</p>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleApplicationDecision(application._id, 'accept')}
                                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg"
                                >
                                  Accept
                                </button>
                                <button
                                  onClick={() => handleApplicationDecision(application._id, 'reject')}
                                  className="px-3 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg"
                                >
                                  Reject
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {!currentUserHasCharacterInGuild && (
                <div className="p-4 bg-fantasy-800/30 rounded-lg">
                  <h3 className="text-lg font-bold text-white mb-3">Apply to Join</h3>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Role Type</label>
                  <select
                    value={applicationRole}
                    onChange={(e) => setApplicationRole(e.target.value as 'Officer' | 'Member' | 'Ally')}
                    className="w-full p-3 mb-3 bg-fantasy-900/50 border border-fantasy-700/30 rounded-lg text-white"
                  >
                    <option value="Member">Member</option>
                    <option value="Officer">Officer</option>
                    <option value="Ally">Ally</option>
                  </select>

                  <label className="block text-sm font-medium text-gray-400 mb-2">Character</label>
                  <select
                    value={applicationCharacterId}
                    onChange={(e) => setApplicationCharacterId(e.target.value)}
                    className="w-full p-3 mb-3 bg-fantasy-900/50 border border-fantasy-700/30 rounded-lg text-white"
                  >
                    <option value="">Choose a character</option>
                    {characters.map(character => (
                      <option key={character._id} value={character._id}>
                        {character.name} - Level {character.level}
                      </option>
                    ))}
                  </select>

                  <textarea
                    value={applicationMessage}
                    onChange={(e) => setApplicationMessage(e.target.value)}
                    rows={4}
                    placeholder="Application message"
                    className="w-full p-3 mb-4 bg-fantasy-900/50 border border-fantasy-700/30 rounded-lg text-white placeholder-gray-400 resize-none"
                  />

                  <button
                    onClick={handleApply}
                    className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg"
                  >
                    Submit Application
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {showCreateGuild && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <form onSubmit={handleCreateGuild} className="bg-fantasy-900 border border-fantasy-700 rounded-xl p-6 max-w-2xl w-full space-y-4">
              <h2 className="text-2xl font-bold text-white">Create Guild</h2>

              {eligibleLeaderCharacters.length === 0 && (
                <div className="p-3 bg-red-900/20 border border-red-700/30 rounded-lg text-red-300 text-sm">
                  You need at least one level 4+ character to lead a guild.
                </div>
              )}

              <input
                type="text"
                value={newGuild.name}
                onChange={(e) => setNewGuild(prev => ({ ...prev, name: e.target.value }))}
                required
                placeholder="Guild name"
                className="w-full p-3 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white placeholder-gray-400"
              />

              <textarea
                value={newGuild.description}
                onChange={(e) => setNewGuild(prev => ({ ...prev, description: e.target.value }))}
                required
                rows={4}
                placeholder="Guild description"
                className="w-full p-3 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white placeholder-gray-400 resize-none"
              />

              <select
                value={newGuild.leaderCharacterId}
                onChange={(e) => setNewGuild(prev => ({ ...prev, leaderCharacterId: e.target.value }))}
                required
                className="w-full p-3 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white"
              >
                <option value="">Choose leader character</option>
                {eligibleLeaderCharacters.map(character => (
                  <option key={character._id} value={character._id}>
                    {character.name} - Level {character.level} {character.class}
                  </option>
                ))}
              </select>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  value={newGuild.type}
                  onChange={(e) => setNewGuild(prev => ({ ...prev, type: e.target.value }))}
                  placeholder="Guild type"
                  className="w-full p-3 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white placeholder-gray-400"
                />
                <input
                  type="text"
                  value={newGuild.region}
                  onChange={(e) => setNewGuild(prev => ({ ...prev, region: e.target.value }))}
                  placeholder="Region"
                  className="w-full p-3 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white placeholder-gray-400"
                />
              </div>

              <textarea
                value={newGuild.requirements}
                onChange={(e) => setNewGuild(prev => ({ ...prev, requirements: e.target.value }))}
                rows={3}
                placeholder="Requirements"
                className="w-full p-3 bg-fantasy-800/50 border border-fantasy-700/30 rounded-lg text-white placeholder-gray-400 resize-none"
              />

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateGuild(false)}
                  className="flex-1 px-4 py-3 bg-fantasy-700 hover:bg-fantasy-600 text-white rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={eligibleLeaderCharacters.length === 0}
                  className="flex-1 px-4 py-3 bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-600 text-midnight-900 font-bold rounded-lg"
                >
                  Create Guild
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default GuildsPage;
