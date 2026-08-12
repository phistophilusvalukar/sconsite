import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowUpRight, Castle, Crown, Loader2, Plus, Search, Shield, Sparkles, Users, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { DATABASE_TABLES } from '../config/database';
import { useAuth } from '../context/useAuth';
import { useSupabaseRealtime } from '../hooks/useSupabaseRealtime';
import { Character, Guild } from '../types/database';
import { CharacterService } from '../services/characterService';
import GuildService from '../services/guildService';
import './guilds.css';

type GuildFilter = 'All' | Guild['status'];

const EMPTY_GUILD = {
  name: '',
  subtitle: '',
  description: '',
  leaderCharacterId: '',
  type: 'Adventuring',
  region: '',
  requirements: ''
};

const GuildsPage: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<GuildFilter>('All');
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateGuild, setShowCreateGuild] = useState(false);
  const [createError, setCreateError] = useState('');
  const [newGuild, setNewGuild] = useState(EMPTY_GUILD);

  const guildService = useMemo(() => GuildService.getInstance(), []);
  const characterService = useMemo(() => CharacterService.getInstance(), []);
  const eligibleLeaderCharacters = characters.filter(character => character.level >= 4);

  const loadGuilds = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await guildService.getGuilds();
      if (response.success && response.data) setGuilds(response.data);
    } finally {
      setIsLoading(false);
    }
  }, [guildService]);

  const loadCharacters = useCallback(async () => {
    if (!user?.id) return;
    const response = await characterService.getUserCharacters(user.id);
    if (response.success && response.data) setCharacters(response.data);
  }, [characterService, user?.id]);

  useEffect(() => {
    void loadGuilds();
  }, [loadGuilds]);

  useEffect(() => {
    void loadCharacters();
  }, [loadCharacters]);

  useSupabaseRealtime({
    channelName: `guild-directory-${user?.id || 'anonymous'}`,
    tables: [DATABASE_TABLES.GUILDS, DATABASE_TABLES.GUILD_MEMBERSHIPS],
    onChange: () => void loadGuilds(),
    enabled: isAuthenticated
  });

  const filteredGuilds = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return guilds.filter(guild => {
      const matchesFilter = filter === 'All' || guild.status === filter;
      const matchesTerm = !term || [guild.name, guild.subtitle, guild.description, guild.type, guild.region]
        .some(value => value.toLowerCase().includes(term));
      return matchesFilter && matchesTerm;
    });
  }, [filter, guilds, searchTerm]);

  const activeGuilds = guilds.filter(guild => guild.status === 'Active').length;
  const recruitingGuilds = guilds.filter(guild => guild.status === 'Recruiting').length;

  const handleCreateGuild = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user?.id) return;
    setIsCreating(true);
    setCreateError('');

    const result = await guildService.createGuild({ ...newGuild, leaderId: user.id });
    setIsCreating(false);

    if (result.success && result.data?._id) {
      setNewGuild(EMPTY_GUILD);
      setShowCreateGuild(false);
      navigate(`/guilds/${result.data._id}`);
      return;
    }

    setCreateError(result.error || 'The charter could not be created.');
  };

  if (!isAuthenticated) {
    return (
      <main className="guild-directory guild-auth-wall">
        <Shield aria-hidden="true" />
        <p className="guild-eyebrow">The Concordance</p>
        <h1>Guild Registry</h1>
        <p>Sign in to browse the charters and strongholds of the convergence.</p>
      </main>
    );
  }

  return (
    <main className="guild-directory">
      <section className="guild-directory-hero">
        <div className="guild-directory-glow" aria-hidden="true" />
        <div className="guild-directory-hero-copy">
          <p className="guild-eyebrow"><Sparkles size={14} /> The Concordance of Guilds</p>
          <h1>Find your <span>banner.</span></h1>
          <p className="guild-directory-lede">
            Explore player-run orders, meet their people, and discover the places they call home.
          </p>
          <button type="button" className="guild-primary-action" onClick={() => setShowCreateGuild(true)}>
            <Plus size={18} /> Raise a new banner
          </button>
        </div>

        <div className="guild-directory-totals" aria-label="Guild registry totals">
          <div><strong>{guilds.length}</strong><span>Charters</span></div>
          <div><strong>{activeGuilds}</strong><span>Established</span></div>
          <div><strong>{recruitingGuilds}</strong><span>Recruiting</span></div>
        </div>
      </section>

      <section className="guild-directory-content">
        <div className="guild-directory-toolbar">
          <div className="guild-search-field">
            <Search size={18} aria-hidden="true" />
            <input
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
              placeholder="Search names, regions, or guild types"
              aria-label="Search guilds"
            />
          </div>
          <div className="guild-filter-tabs" aria-label="Filter guilds">
            {(['All', 'Active', 'Recruiting', 'Inactive'] as GuildFilter[]).map(option => (
              <button
                type="button"
                key={option}
                className={filter === option ? 'is-active' : ''}
                onClick={() => setFilter(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="guild-directory-state"><Loader2 className="guild-spin" /><span>Opening the registry…</span></div>
        ) : filteredGuilds.length === 0 ? (
          <div className="guild-directory-state">
            <Shield />
            <strong>No charters found</strong>
            <span>Try another search, or raise a banner of your own.</span>
          </div>
        ) : (
          <div className="guild-card-grid">
            {filteredGuilds.map(guild => {
              const activeRoster = (guild.memberships || []).filter(member => member.membershipStatus === 'Active');
              const cardStyle = {
                '--guild-card-base': guild.baseColor,
                '--guild-card-accent': guild.accentColor
              } as CSSProperties;

              return (
                <Link to={`/guilds/${guild._id}`} className="guild-directory-card" style={cardStyle} key={guild._id}>
                  <div className="guild-card-wash" aria-hidden="true" />
                  <div className="guild-card-topline">
                    <span className={`guild-status guild-status-${guild.status.toLowerCase()}`}>{guild.status}</span>
                    <ArrowUpRight size={20} aria-hidden="true" />
                  </div>
                  <div className="guild-card-identity">
                    <div className="guild-card-emblem">
                      {guild.emblemUrl ? <img src={guild.emblemUrl} alt="" /> : <Shield aria-hidden="true" />}
                    </div>
                    <div>
                      <p>{guild.type}{guild.region ? ` · ${guild.region}` : ''}</p>
                      <h2>{guild.name}</h2>
                      {guild.subtitle && <span>{guild.subtitle}</span>}
                    </div>
                  </div>
                  <p className="guild-card-description">{guild.description || 'This guild has not written its story yet.'}</p>
                  <div className="guild-card-facts">
                    <span><Crown size={15} /> {guild.leaderCharacterName || 'Guildmaster'}</span>
                    <span><Users size={15} /> {activeRoster.length || guild.memberCount} on roster</span>
                    {guild.headquartersName && <span><Castle size={15} /> {guild.headquartersName}</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {showCreateGuild && (
        <div className="guild-modal-backdrop" role="presentation">
          <form className="guild-create-modal" onSubmit={handleCreateGuild}>
            <div className="guild-modal-heading">
              <div>
                <p className="guild-eyebrow">New charter</p>
                <h2>Raise your banner</h2>
                <p>Your customizable guild page opens as soon as the charter is signed.</p>
              </div>
              <button type="button" onClick={() => setShowCreateGuild(false)} aria-label="Close"><X /></button>
            </div>

            {eligibleLeaderCharacters.length === 0 && (
              <div className="guild-form-notice">You need a level 4 or higher character to found a guild.</div>
            )}
            {createError && <div className="guild-form-error">{createError}</div>}

            <div className="guild-form-grid">
              <label className="guild-field guild-field-wide">
                <span>Guild name</span>
                <input required maxLength={80} value={newGuild.name} onChange={event => setNewGuild(current => ({ ...current, name: event.target.value }))} placeholder="The Argent Cartographers" />
              </label>
              <label className="guild-field guild-field-wide">
                <span>Subtitle</span>
                <input maxLength={140} value={newGuild.subtitle} onChange={event => setNewGuild(current => ({ ...current, subtitle: event.target.value }))} placeholder="Seekers of roads unwritten" />
              </label>
              <label className="guild-field guild-field-wide">
                <span>Description</span>
                <textarea required rows={4} value={newGuild.description} onChange={event => setNewGuild(current => ({ ...current, description: event.target.value }))} placeholder="Tell the convergence what your guild stands for…" />
              </label>
              <label className="guild-field guild-field-wide">
                <span>Founding character</span>
                <select required value={newGuild.leaderCharacterId} onChange={event => setNewGuild(current => ({ ...current, leaderCharacterId: event.target.value }))}>
                  <option value="">Choose a level 4+ character</option>
                  {eligibleLeaderCharacters.map(character => <option value={character._id} key={character._id}>{character.name} · Level {character.level} {character.class}</option>)}
                </select>
              </label>
              <label className="guild-field">
                <span>Guild type</span>
                <input value={newGuild.type} onChange={event => setNewGuild(current => ({ ...current, type: event.target.value }))} placeholder="Adventuring" />
              </label>
              <label className="guild-field">
                <span>Region</span>
                <input value={newGuild.region} onChange={event => setNewGuild(current => ({ ...current, region: event.target.value }))} placeholder="Optional" />
              </label>
              <label className="guild-field guild-field-wide">
                <span>Entry requirements</span>
                <textarea rows={2} value={newGuild.requirements} onChange={event => setNewGuild(current => ({ ...current, requirements: event.target.value }))} placeholder="What should prospective members know?" />
              </label>
            </div>

            <div className="guild-modal-actions">
              <button type="button" className="guild-secondary-action" onClick={() => setShowCreateGuild(false)}>Cancel</button>
              <button type="submit" className="guild-primary-action" disabled={eligibleLeaderCharacters.length === 0 || isCreating}>
                {isCreating ? <Loader2 className="guild-spin" size={18} /> : <Shield size={18} />}
                Sign the charter
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
};

export default GuildsPage;
