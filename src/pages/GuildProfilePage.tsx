import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  ArrowLeft,
  Castle,
  Check,
  Crown,
  ImagePlus,
  Loader2,
  LogOut,
  Palette,
  Pencil,
  Save,
  Shield,
  Sparkles,
  UserPlus,
  Users,
  X
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { DATABASE_TABLES } from '../config/database';
import { useAuth } from '../context/useAuth';
import { useSupabaseRealtime } from '../hooks/useSupabaseRealtime';
import { Character, Guild, GuildMembership } from '../types/database';
import { CharacterService } from '../services/characterService';
import GuildService from '../services/guildService';
import {
  GuildCustomizationInput,
  customizationFromGuild,
  getGuildFontStack,
  guildFontOptions,
  guildLayoutOptions
} from '../features/guilds/guildCustomization';
import './guilds.css';

type EditableRole = Exclude<GuildMembership['roleCategory'], 'Leader'>;
type RoleEdit = { roleCategory: EditableRole; roleTitle: string };
const ROLE_ORDER: GuildMembership['roleCategory'][] = ['Leader', 'Subleader', 'Officer', 'Member', 'Ally'];

const GuildProfilePage: React.FC = () => {
  const { guildId } = useParams<{ guildId: string }>();
  const { isAuthenticated, user } = useAuth();
  const [guild, setGuild] = useState<Guild | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<GuildCustomizationInput | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [editorMessage, setEditorMessage] = useState('');
  const [uploading, setUploading] = useState<'emblem' | 'headquarters' | null>(null);
  const [applicationRole, setApplicationRole] = useState<'Officer' | 'Member' | 'Ally'>('Member');
  const [applicationCharacterId, setApplicationCharacterId] = useState('');
  const [applicationMessage, setApplicationMessage] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [roleEdits, setRoleEdits] = useState<Record<string, RoleEdit>>({});
  const [founderSearch, setFounderSearch] = useState('');
  const [founderResults, setFounderResults] = useState<Character[]>([]);
  const [isSearchingFounders, setIsSearchingFounders] = useState(false);

  const guildService = useMemo(() => GuildService.getInstance(), []);
  const characterService = useMemo(() => CharacterService.getInstance(), []);

  const loadGuild = useCallback(async () => {
    if (!guildId) return;
    setIsLoading(true);
    const response = await guildService.getGuild(guildId);
    if (response.success && response.data) {
      setGuild(response.data);
      setLoadError('');
    } else {
      setLoadError(response.error || 'Guild not found.');
    }
    setIsLoading(false);
  }, [guildId, guildService]);

  const loadCharacters = useCallback(async () => {
    if (!user?.id) return;
    const response = await characterService.getUserCharacters(user.id);
    if (response.success && response.data) setCharacters(response.data);
  }, [characterService, user?.id]);

  useEffect(() => {
    void loadGuild();
  }, [loadGuild]);

  useEffect(() => {
    void loadCharacters();
  }, [loadCharacters]);

  useEffect(() => {
    if (!guild || !user?.id || guild.leaderId !== user.id || founderSearch.trim().length < 2) {
      setFounderResults([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      setIsSearchingFounders(true);
      const response = await guildService.searchEligibleFoundingCharacters(guild._id || '', user.id, founderSearch);
      setFounderResults(response.success && response.data ? response.data : []);
      setIsSearchingFounders(false);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [founderSearch, guild, guildService, user?.id]);

  useSupabaseRealtime({
    channelName: `guild-profile-${guildId || 'unknown'}-${user?.id || 'anonymous'}`,
    tables: [DATABASE_TABLES.GUILDS, DATABASE_TABLES.GUILD_MEMBERSHIPS, DATABASE_TABLES.GUILD_APPLICATIONS],
    onChange: () => void loadGuild(),
    enabled: isAuthenticated && Boolean(guildId)
  });

  const isGuildmaster = Boolean(guild && user?.id === guild.leaderId);
  const currentMembership = guild?.memberships?.find(member => member.userId === user?.id && member.membershipStatus === 'Active');
  const pendingApplications = guild?.applications?.filter(application => application.status === 'Pending') || [];
  const activeRoster = guild?.memberships?.filter(member => member.membershipStatus === 'Active') || [];

  const displayGuild = useMemo(() => {
    if (!guild || !draft || !isEditing) return guild;
    return {
      ...guild,
      ...draft,
      emblemUrl: draft.emblemUrl || undefined,
      headquartersImageUrl: draft.headquartersImageUrl || undefined
    };
  }, [draft, guild, isEditing]);

  const openEditor = () => {
    if (!guild) return;
    setDraft(customizationFromGuild(guild));
    setEditorMessage('');
    setIsEditing(true);
  };

  const updateDraft = <Key extends keyof GuildCustomizationInput>(key: Key, value: GuildCustomizationInput[Key]) => {
    setDraft(current => current ? { ...current, [key]: value } : current);
  };

  const handleSaveCustomization = async () => {
    if (!guild?._id || !user?.id || !draft) return;
    setIsSaving(true);
    setEditorMessage('');
    const response = await guildService.updateGuildCustomization(guild._id, user.id, draft);
    setIsSaving(false);
    if (!response.success) {
      setEditorMessage(response.error || 'Could not save the guild page.');
      return;
    }
    await loadGuild();
    setIsEditing(false);
    setDraft(null);
  };

  const handleUpload = async (file: File, kind: 'emblem' | 'headquarters') => {
    if (!guild?._id || !user?.id || !draft) return;
    setUploading(kind);
    setEditorMessage('');
    const response = await guildService.uploadGuildAsset(guild._id, user.id, file, kind);
    setUploading(null);
    if (!response.success || !response.data) {
      setEditorMessage(response.error || 'Could not upload that image.');
      return;
    }
    updateDraft(kind === 'emblem' ? 'emblemUrl' : 'headquartersImageUrl', response.data);
  };

  const handleApply = async () => {
    if (!guild?._id || !user?.id || !applicationCharacterId) {
      setActionMessage('Choose a character before applying.');
      return;
    }
    const response = await guildService.applyToGuild(guild._id, user.id, applicationRole, applicationCharacterId, applicationMessage);
    setActionMessage(response.message || response.error || 'Application submitted.');
    if (response.success) {
      setApplicationMessage('');
      await loadGuild();
    }
  };

  const handleLeave = async () => {
    if (!guild?._id || !user?.id || !currentMembership?._id) return;
    if (!window.confirm('Leave this guild? Your character will be removed from its roster.')) return;
    const response = await guildService.leaveGuild(guild._id, user.id, currentMembership._id);
    setActionMessage(response.message || response.error || 'Roster updated.');
    if (response.success) await Promise.all([loadGuild(), loadCharacters()]);
  };

  const roleEditFor = (member: GuildMembership): RoleEdit => {
    if (!member._id) return { roleCategory: 'Member', roleTitle: member.roleTitle || '' };
    return roleEdits[member._id] || {
      roleCategory: member.roleCategory === 'Leader' ? 'Member' : member.roleCategory,
      roleTitle: member.roleTitle || member.roleCategory
    };
  };

  const updateRoleEdit = (member: GuildMembership, update: Partial<RoleEdit>) => {
    if (!member._id || member.roleCategory === 'Leader') return;
    setRoleEdits(current => ({ ...current, [member._id!]: { ...roleEditFor(member), ...update } }));
  };

  const handleUpdateRole = async (member: GuildMembership) => {
    if (!guild?._id || !user?.id || !member._id || member.roleCategory === 'Leader') return;
    const edit = roleEditFor(member);
    const response = await guildService.updateMemberRole(guild._id, user.id, member._id, edit.roleCategory, edit.roleTitle);
    setActionMessage(response.success ? 'Roster role updated.' : response.error || 'Could not update the role.');
    if (response.success) {
      setRoleEdits(current => {
        const next = { ...current };
        delete next[member._id!];
        return next;
      });
      await loadGuild();
    }
  };

  const handleAddFounder = async (character: Character) => {
    if (!guild?._id || !user?.id || !character._id) return;
    const response = await guildService.addFoundingMember(guild._id, user.id, character._id);
    setActionMessage(response.message || response.error || 'Founding roster updated.');
    if (response.success) {
      setFounderSearch('');
      setFounderResults([]);
      await loadGuild();
    }
  };

  const handleApplication = async (applicationId: string | undefined, decision: 'accept' | 'reject') => {
    if (!guild?._id || !user?.id || !applicationId) return;
    const response = decision === 'accept'
      ? await guildService.acceptApplication(guild._id, user.id, applicationId)
      : await guildService.rejectApplication(guild._id, user.id, applicationId);
    setActionMessage(response.message || response.error || `Application ${decision}ed.`);
    if (response.success) await loadGuild();
  };

  if (!isAuthenticated) {
    return <main className="guild-profile-state"><Shield /><h1>Guild pages are available after sign in.</h1></main>;
  }

  if (isLoading) {
    return <main className="guild-profile-state"><Loader2 className="guild-spin" /><span>Unfurling the banner…</span></main>;
  }

  if (!displayGuild || loadError) {
    return <main className="guild-profile-state"><Shield /><h1>{loadError || 'Guild not found.'}</h1><Link to="/guilds">Return to the registry</Link></main>;
  }

  const guildStyle = {
    '--guild-base': displayGuild.baseColor,
    '--guild-accent': displayGuild.accentColor,
    '--guild-ink': displayGuild.fontColor,
    fontFamily: getGuildFontStack(displayGuild.fontFamily)
  } as CSSProperties;

  return (
    <main className="guild-profile" data-layout={displayGuild.layoutStyle} style={guildStyle}>
      <div className="guild-profile-atmosphere" aria-hidden="true" />
      <div className="guild-profile-shell">
        <nav className="guild-profile-nav">
          <Link to="/guilds"><ArrowLeft size={17} /> Guild registry</Link>
          {isGuildmaster && <button type="button" onClick={openEditor}><Palette size={17} /> Customize page</button>}
        </nav>

        <header className="guild-profile-hero">
          <div className="guild-profile-emblem">
            {displayGuild.emblemUrl ? <img src={displayGuild.emblemUrl} alt={`${displayGuild.name} emblem`} /> : <Shield aria-hidden="true" />}
          </div>
          <div className="guild-profile-title">
            <p className="guild-profile-kicker">{displayGuild.type}{displayGuild.region ? ` · ${displayGuild.region}` : ''}</p>
            <h1>{displayGuild.name}</h1>
            <p>{displayGuild.subtitle || 'A charter of the Shattered Convergence'}</p>
          </div>
          <div className="guild-profile-seal">
            <Crown size={20} />
            <span>{displayGuild.roleLabels.Leader}</span>
            <strong>{displayGuild.leaderCharacterName || 'Unnamed'}</strong>
          </div>
        </header>

        <div className="guild-profile-rule"><span /></div>

        <div className="guild-profile-layout">
          <section className="guild-story-panel">
            <p className="guild-section-label">Our charter</p>
            <h2>About the guild</h2>
            <p className="guild-story-copy">{displayGuild.description || 'This guild has not yet committed its story to the registry.'}</p>
            <div className="guild-charter-facts">
              <div><span>Status</span><strong>{displayGuild.status}</strong></div>
              <div><span>Established</span><strong>{displayGuild.foundedAt ? displayGuild.foundedAt.toLocaleDateString() : 'Forming'}</strong></div>
              <div><span>Roster</span><strong>{activeRoster.length} / {displayGuild.maxMembers}</strong></div>
            </div>
            {displayGuild.requirements && <div className="guild-requirements"><Sparkles size={17} /><p><strong>Joining the order</strong>{displayGuild.requirements}</p></div>}
          </section>

          <section className="guild-headquarters-panel">
            <div className="guild-headquarters-image">
              {displayGuild.headquartersImageUrl
                ? <img src={displayGuild.headquartersImageUrl} alt={displayGuild.headquartersName || 'Guild headquarters'} />
                : <div><Castle /><span>Headquarters image</span></div>}
            </div>
            <div className="guild-headquarters-copy">
              <p className="guild-section-label">Headquarters</p>
              <h2>{displayGuild.headquartersName || 'Stronghold undisclosed'}</h2>
              {displayGuild.headquartersTitle && <h3>{displayGuild.headquartersTitle}</h3>}
              <p>{displayGuild.headquartersDescription || 'The guildmaster has not yet entered a headquarters into the registry.'}</p>
            </div>
          </section>

          <section className="guild-roster-panel">
            <div className="guild-section-heading">
              <div><p className="guild-section-label">People of the banner</p><h2>The roster</h2></div>
              <span><Users size={16} /> {activeRoster.length} listed</span>
            </div>

            <div className="guild-roster-groups">
              {ROLE_ORDER.map(category => {
                const members = activeRoster.filter(member => member.roleCategory === category);
                if (members.length === 0) return null;
                return (
                  <div className="guild-roster-group" key={category}>
                    <h3>{displayGuild.roleLabels[category]} <span>{members.length}</span></h3>
                    <div className="guild-roster-list">
                      {members.map(member => {
                        const edit = roleEditFor(member);
                        return (
                          <article className="guild-member-card" key={member._id}>
                            <div className="guild-member-avatar">{member.character?.name?.slice(0, 1).toUpperCase() || '?'}</div>
                            <div className="guild-member-copy">
                              <strong>{member.character?.name || 'Unknown character'}</strong>
                              <span>{member.roleTitle || displayGuild.roleLabels[category]}</span>
                              {member.character && <small>Level {member.character.level} · {member.character.class}</small>}
                            </div>
                            {isGuildmaster && category !== 'Leader' && (
                              <div className="guild-member-edit">
                                <select value={edit.roleCategory} onChange={event => updateRoleEdit(member, { roleCategory: event.target.value as EditableRole })}>
                                  <option value="Subleader">{displayGuild.roleLabels.Subleader}</option>
                                  <option value="Officer">{displayGuild.roleLabels.Officer}</option>
                                  <option value="Member">{displayGuild.roleLabels.Member}</option>
                                  <option value="Ally">{displayGuild.roleLabels.Ally}</option>
                                </select>
                                <input value={edit.roleTitle} onChange={event => updateRoleEdit(member, { roleTitle: event.target.value })} aria-label={`Title for ${member.character?.name || 'member'}`} />
                                <button type="button" onClick={() => void handleUpdateRole(member)} aria-label="Save role"><Check size={16} /></button>
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {activeRoster.length === 0 && <p className="guild-empty-copy">The roster is waiting for its first names.</p>}
            </div>
          </section>

          <aside className="guild-action-panel">
            {actionMessage && <div className="guild-action-message">{actionMessage}</div>}

            {currentMembership ? (
              <div className="guild-action-card">
                <p className="guild-section-label">Your place here</p>
                <h2>{currentMembership.roleTitle || displayGuild.roleLabels[currentMembership.roleCategory]}</h2>
                <p>{currentMembership.character?.name || 'Your character'} is listed beneath this banner.</p>
                {currentMembership.roleCategory !== 'Leader' && <button type="button" className="guild-danger-action" onClick={handleLeave}><LogOut size={16} /> Leave guild</button>}
              </div>
            ) : (
              <div className="guild-action-card">
                <p className="guild-section-label">Join the story</p>
                <h2>Petition the guild</h2>
                <label className="guild-field"><span>Character</span><select value={applicationCharacterId} onChange={event => setApplicationCharacterId(event.target.value)}><option value="">Choose a character</option>{characters.map(character => <option key={character._id} value={character._id}>{character.name} · Level {character.level}</option>)}</select></label>
                <label className="guild-field"><span>Requested place</span><select value={applicationRole} onChange={event => setApplicationRole(event.target.value as typeof applicationRole)}><option value="Member">{displayGuild.roleLabels.Member}</option><option value="Officer">{displayGuild.roleLabels.Officer}</option><option value="Ally">{displayGuild.roleLabels.Ally}</option></select></label>
                <label className="guild-field"><span>Message</span><textarea rows={3} value={applicationMessage} onChange={event => setApplicationMessage(event.target.value)} placeholder="Introduce yourself…" /></label>
                <button type="button" className="guild-profile-primary" onClick={handleApply}><UserPlus size={17} /> Submit petition</button>
              </div>
            )}

            {isGuildmaster && displayGuild.status === 'Recruiting' && (
              <div className="guild-action-card">
                <p className="guild-section-label">Founding roster</p>
                <h2>Invite founders</h2>
                <p>A leader and three founding characters establish an active guild.</p>
                <label className="guild-field"><span>Character search</span><div className="guild-inline-input"><input value={founderSearch} onChange={event => setFounderSearch(event.target.value)} placeholder="Type at least 2 letters" />{isSearchingFounders && <Loader2 className="guild-spin" size={16} />}</div></label>
                <div className="guild-founder-results">
                  {founderResults.map(character => <button type="button" key={character._id} onClick={() => void handleAddFounder(character)}><span><strong>{character.name}</strong><small>Level {character.level} {character.class}</small></span><Plus size={16} /></button>)}
                </div>
              </div>
            )}

            {isGuildmaster && (
              <div className="guild-action-card">
                <p className="guild-section-label">Guildmaster's desk</p>
                <h2>Applications</h2>
                {pendingApplications.length === 0 ? <p>No petitions await your decision.</p> : pendingApplications.map(application => (
                  <div className="guild-application" key={application._id}>
                    <strong>{application.character?.name || 'Unknown character'}</strong>
                    <span>{displayGuild.roleLabels[application.requestedRoleCategory]}</span>
                    {application.message && <p>{application.message}</p>}
                    <div><button type="button" onClick={() => void handleApplication(application._id, 'accept')}>Accept</button><button type="button" onClick={() => void handleApplication(application._id, 'reject')}>Decline</button></div>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      </div>

      {isEditing && draft && (
        <div className="guild-editor-backdrop">
          <aside className="guild-editor" aria-label="Customize guild page">
            <div className="guild-editor-heading">
              <div><p className="guild-eyebrow"><Pencil size={14} /> Live preview</p><h2>Customize your page</h2></div>
              <button type="button" onClick={() => { setIsEditing(false); setDraft(null); }} aria-label="Close editor"><X /></button>
            </div>
            {editorMessage && <div className="guild-form-error">{editorMessage}</div>}

            <div className="guild-editor-section">
              <h3>Identity</h3>
              <label className="guild-field"><span>Guild name</span><input maxLength={80} value={draft.name} onChange={event => updateDraft('name', event.target.value)} /></label>
              <label className="guild-field"><span>Subtitle</span><input maxLength={140} value={draft.subtitle} onChange={event => updateDraft('subtitle', event.target.value)} /></label>
              <label className="guild-field"><span>Description</span><textarea rows={5} value={draft.description} onChange={event => updateDraft('description', event.target.value)} /></label>
            </div>

            <div className="guild-editor-section">
              <h3>Typography</h3>
              <div className="guild-option-grid">
                {guildFontOptions.map(option => <button type="button" className={draft.fontFamily === option.value ? 'is-selected' : ''} style={{ fontFamily: option.stack }} onClick={() => updateDraft('fontFamily', option.value)} key={option.value}><strong>{option.label}</strong><span>Ag</span></button>)}
              </div>
            </div>

            <div className="guild-editor-section">
              <h3>Colors</h3>
              <div className="guild-color-grid">
                {([['fontColor', 'Text'], ['baseColor', 'Base'], ['accentColor', 'Accent']] as const).map(([key, label]) => <label key={key}><span>{label}</span><div><input type="color" value={draft[key]} onChange={event => updateDraft(key, event.target.value)} /><code>{draft[key]}</code></div></label>)}
              </div>
            </div>

            <div className="guild-editor-section">
              <h3>Page layout</h3>
              <div className="guild-layout-options">
                {guildLayoutOptions.map(option => <button type="button" className={draft.layoutStyle === option.value ? 'is-selected' : ''} onClick={() => updateDraft('layoutStyle', option.value)} key={option.value}><span className={`guild-layout-sketch guild-layout-sketch-${option.value}`}><i /><i /><i /></span><strong>{option.label}</strong><small>{option.description}</small></button>)}
              </div>
            </div>

            <div className="guild-editor-section">
              <h3>Artwork</h3>
              <div className="guild-upload-grid">
                <label className="guild-upload-control"><span>{draft.emblemUrl ? <img src={draft.emblemUrl} alt="Current emblem" /> : <Shield />}</span><strong>{uploading === 'emblem' ? 'Uploading…' : 'Upload emblem'}</strong><small>PNG, JPEG, or WebP · 5 MB max</small><input type="file" accept="image/png,image/jpeg,image/webp" disabled={Boolean(uploading)} onChange={event => { const file = event.target.files?.[0]; if (file) void handleUpload(file, 'emblem'); }} /></label>
                <label className="guild-upload-control"><span>{draft.headquartersImageUrl ? <img src={draft.headquartersImageUrl} alt="Current headquarters" /> : <ImagePlus />}</span><strong>{uploading === 'headquarters' ? 'Uploading…' : 'Upload headquarters'}</strong><small>Landscape images work best</small><input type="file" accept="image/png,image/jpeg,image/webp" disabled={Boolean(uploading)} onChange={event => { const file = event.target.files?.[0]; if (file) void handleUpload(file, 'headquarters'); }} /></label>
              </div>
            </div>

            <div className="guild-editor-section">
              <h3>Headquarters</h3>
              <label className="guild-field"><span>Name</span><input value={draft.headquartersName} onChange={event => updateDraft('headquartersName', event.target.value)} placeholder="The Gilded Compass" /></label>
              <label className="guild-field"><span>Title</span><input value={draft.headquartersTitle} onChange={event => updateDraft('headquartersTitle', event.target.value)} placeholder="Hall of the Far Horizon" /></label>
              <label className="guild-field"><span>Description</span><textarea rows={4} value={draft.headquartersDescription} onChange={event => updateDraft('headquartersDescription', event.target.value)} /></label>
            </div>

            <div className="guild-editor-section">
              <h3>Roster names</h3>
              <p>Rename the hierarchy to match your guild's culture.</p>
              {ROLE_ORDER.map(category => <label className="guild-field" key={category}><span>{category === 'Leader' ? 'Guildmaster' : category}</span><input value={draft.roleLabels[category]} onChange={event => updateDraft('roleLabels', { ...draft.roleLabels, [category]: event.target.value })} /></label>)}
            </div>

            <div className="guild-editor-actions">
              <button type="button" className="guild-secondary-action" onClick={() => { setIsEditing(false); setDraft(null); }}>Discard</button>
              <button type="button" className="guild-primary-action" onClick={() => void handleSaveCustomization()} disabled={isSaving || Boolean(uploading)}>{isSaving ? <Loader2 className="guild-spin" size={17} /> : <Save size={17} />} Save page</button>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
};

export default GuildProfilePage;
