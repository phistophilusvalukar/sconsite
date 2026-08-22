import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Castle,
  Clock3,
  Crown,
  Eye,
  EyeOff,
  FileText,
  Grid3X3,
  Loader2,
  LogOut,
  Palette,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Send,
  Shield,
  Sparkles,
  Star,
  UserCheck,
  UserPlus,
  Users,
  X
} from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import ProfileTypographyControls from '../components/ProfileTypographyControls';
import { DATABASE_TABLES } from '../config/database';
import { useAuth } from '../context/useAuth';
import GuildRoster from '../features/guilds/GuildRoster';
import GuildRosterLineup from '../features/guilds/GuildRosterLineup';
import { createDefaultGuildLineup, isEligibleForGuildLineup } from '../features/guilds/guildRosterLineupUtils';
import DynamicCharacterPortrait from '../features/characters/DynamicCharacterPortrait';
import {
  GuildCustomizationInput,
  customizationFromGuild,
  defaultGuildPalette,
  defaultGuildSectionHeadings,
  getGuildFontStack,
  guildFontCategories,
  guildFontOptions,
  guildLayoutOptions
} from '../features/guilds/guildCustomization';
import RichTextEditor from '../features/guilds/RichTextEditor';
import SafeRichText from '../features/guilds/SafeRichText';
import { plainTextToRichHtml, richTextToPlainText, sanitizeRichHtml } from '../features/guilds/richText';
import { useSupabaseRealtime } from '../hooks/useSupabaseRealtime';
import { buildProfileBackground } from '../features/profiles/profileBackground';
import { CharacterService } from '../services/characterService';
import GuildService from '../services/guildService';
import type { Character, Guild, GuildCheckin, GuildGuestbookEntry, GuildMembership } from '../types/database';
import { DEFAULT_NPC_PLACEHOLDER, normalizeFoundryAvatar } from '../utils/foundryCharacter';
import './guilds.css';

const ROLE_ORDER: GuildMembership['roleCategory'][] = ['Leader', 'Subleader', 'Officer', 'Member', 'Ally'];
const SECTION_OPTIONS: Array<{ key: keyof Guild['sectionVisibility']; label: string; description: string }> = [
  { key: 'charter', label: 'Guild charter', description: 'Story, status, founding date, and roster count.' },
  { key: 'requirements', label: 'Joining requirements', description: 'The expectations shown to prospective members.' },
  { key: 'headquarters', label: 'Headquarters', description: 'Stronghold artwork, title, and description.' },
  { key: 'leader', label: 'Guild leader', description: 'The leader character portrait and profile.' },
  { key: 'roster', label: 'Character roster', description: 'The public list of guild members.' },
  { key: 'messageBoard', label: 'Message board', description: 'A leader-authored notice or announcement.' },
  { key: 'checkIn', label: 'Daily check-in', description: 'Member check-ins and influence points.' },
  { key: 'guestbook', label: 'Guestbook', description: 'Roleplay notes from headquarters visitors.' }
];
const SECTION_HEADING_OPTIONS: Array<{
  section: string;
  labelKey: keyof Guild['sectionHeadings'];
  titleKey?: keyof Guild['sectionHeadings'];
}> = [
  { section: 'Charter', labelKey: 'charterLabel', titleKey: 'charterTitle' },
  { section: 'Requirements', labelKey: 'requirementsLabel', titleKey: 'requirementsTitle' },
  { section: 'Headquarters', labelKey: 'headquartersLabel' },
  { section: 'Roster', labelKey: 'rosterLabel', titleKey: 'rosterTitle' },
  { section: 'Message board', labelKey: 'messageBoardLabel', titleKey: 'messageBoardTitle' },
  { section: 'Check-in', labelKey: 'checkInLabel', titleKey: 'checkInTitle' },
  { section: 'Guestbook', labelKey: 'guestbookLabel', titleKey: 'guestbookTitle' },
  { section: 'Guild leader', labelKey: 'leaderLabel' },
  { section: 'Your membership', labelKey: 'membershipLabel', titleKey: 'membershipTitle' },
  { section: 'Join request', labelKey: 'petitionLabel', titleKey: 'petitionTitle' },
  { section: 'Founders', labelKey: 'foundersLabel', titleKey: 'foundersTitle' },
  { section: 'Applications', labelKey: 'applicationsLabel', titleKey: 'applicationsTitle' }
];

const formatTimestamp = (date?: Date) => date
  ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
  : 'No messages posted yet';

const characterPortrait = (character?: Character) =>
  normalizeFoundryAvatar(character?.stats?.avatar) || DEFAULT_NPC_PLACEHOLDER;

const GuildProfilePage: React.FC = () => {
  const { guildId } = useParams<{ guildId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated, user } = useAuth();
  const [guild, setGuild] = useState<Guild | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [todayCheckins, setTodayCheckins] = useState<GuildCheckin[]>([]);
  const [guestbookEntries, setGuestbookEntries] = useState<GuildGuestbookEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<GuildCustomizationInput | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [editorMessage, setEditorMessage] = useState('');
  const [applicationRole, setApplicationRole] = useState<'Officer' | 'Member' | 'Ally'>('Member');
  const [applicationCharacterId, setApplicationCharacterId] = useState('');
  const [applicationMessage, setApplicationMessage] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [checkingInCharacterId, setCheckingInCharacterId] = useState('');
  const [guestbookCharacterId, setGuestbookCharacterId] = useState('');
  const [guestbookMessage, setGuestbookMessage] = useState('');
  const [isSigningGuestbook, setIsSigningGuestbook] = useState(false);
  const [moderatingEntryId, setModeratingEntryId] = useState('');

  const guildService = useMemo(() => GuildService.getInstance(), []);
  const characterService = useMemo(() => CharacterService.getInstance(), []);

  const loadGuild = useCallback(async (showLoading = false) => {
    if (!guildId) return;
    if (showLoading) setIsLoading(true);
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

  const loadCommunity = useCallback(async () => {
    if (!guildId) return;
    const [checkinsResponse, guestbookResponse] = await Promise.all([
      guildService.getTodayCheckins(guildId),
      guildService.getGuestbookEntries(guildId)
    ]);
    if (checkinsResponse.success && checkinsResponse.data) setTodayCheckins(checkinsResponse.data);
    if (guestbookResponse.success && guestbookResponse.data) setGuestbookEntries(guestbookResponse.data);
  }, [guildId, guildService]);

  useEffect(() => {
    void loadGuild(true);
  }, [loadGuild]);

  useEffect(() => {
    void Promise.all([loadCharacters(), loadCommunity()]);
  }, [loadCharacters, loadCommunity]);

  useSupabaseRealtime({
    channelName: `guild-profile-${guildId || 'unknown'}-${user?.id || 'anonymous'}`,
    tables: [
      DATABASE_TABLES.GUILDS,
      DATABASE_TABLES.GUILD_MEMBERSHIPS,
      DATABASE_TABLES.GUILD_APPLICATIONS,
      DATABASE_TABLES.GUILD_CHECKINS,
      DATABASE_TABLES.GUILD_GUESTBOOK_ENTRIES
    ],
    onChange: async () => {
      await Promise.all([loadGuild(), loadCommunity()]);
    },
    enabled: isAuthenticated && Boolean(guildId)
  });

  const isGuildmaster = Boolean(guild && user?.id === guild.leaderId);
  const isDisbanded = guild?.status === 'Disbanded';
  const activeRoster = useMemo(() => (guild?.memberships || [])
    .filter(member => member.membershipStatus === 'Active' && member.character?.status === 'active')
    .sort((left, right) => ROLE_ORDER.indexOf(left.roleCategory) - ROLE_ORDER.indexOf(right.roleCategory)), [guild?.memberships]);
  const currentMemberships = activeRoster.filter(member => member.userId === user?.id);
  const leaderMembership = activeRoster.find(member => member.roleCategory === 'Leader' || member.characterId === guild?.leaderCharacterId);
  const nextLeaderMembership = activeRoster.find(member => member.characterId === guild?.nextLeaderCharacterId);
  const canCustomizeGuild = !isDisbanded && (isGuildmaster || currentMemberships.some(member => member.permissions.customizeGuild));
  const canSetMessageBoard = !isDisbanded && (isGuildmaster || currentMemberships.some(member => member.permissions.setMessageBoard));
  const canManageGuild = !isDisbanded && (isGuildmaster || currentMemberships.some(member => Object.values(member.permissions).some(Boolean)));
  const checkedInCharacterIds = useMemo(() => new Set(todayCheckins.map(checkin => checkin.characterId)), [todayCheckins]);

  useEffect(() => {
    if (!guild || !canCustomizeGuild || searchParams.get('customize') !== '1') return;
    setDraft(customizationFromGuild(guild));
    setEditorMessage('');
    setIsEditing(true);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('customize');
    setSearchParams(nextParams, { replace: true });
  }, [canCustomizeGuild, guild, searchParams, setSearchParams]);

  const displayGuild = useMemo(() => {
    if (!guild || !draft || !isEditing) return guild;
    return {
      ...guild,
      ...draft,
      emblemUrl: draft.emblemUrl || undefined,
      bannerImageUrl: draft.bannerImageUrl || undefined,
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

  const selectRosterDisplay = (rosterDisplay: GuildCustomizationInput['rosterDisplay']) => {
    setDraft(current => {
      if (!current) return current;
      return {
        ...current,
        rosterDisplay,
        rosterLineup: rosterDisplay === 'lineup' && current.rosterLineup.length === 0
          ? createDefaultGuildLineup(activeRoster)
          : current.rosterLineup
      };
    });
  };

  const handleSaveCustomization = async () => {
    if (!guild?._id || !user?.id || !draft) return;
    setIsSaving(true);
    setEditorMessage('');
    const titleHtml = sanitizeRichHtml(draft.titleHtml, 'inline');
    const descriptionHtml = sanitizeRichHtml(draft.descriptionHtml);
    const headquartersTitleHtml = sanitizeRichHtml(draft.headquartersTitleHtml, 'inline');
    const headquartersDescriptionHtml = sanitizeRichHtml(draft.headquartersDescriptionHtml);
    const messageBoardHtml = sanitizeRichHtml(draft.messageBoardHtml);
    const eligibleLineupIds = new Set(activeRoster
      .filter(isEligibleForGuildLineup)
      .map(member => member.characterId || member.character?._id)
      .filter((characterId): characterId is string => Boolean(characterId)));
    const normalizedDraft: GuildCustomizationInput = {
      ...draft,
      titleHtml,
      description: richTextToPlainText(descriptionHtml).slice(0, 4000),
      descriptionHtml,
      headquartersTitle: richTextToPlainText(headquartersTitleHtml).slice(0, 140),
      headquartersTitleHtml,
      headquartersDescription: richTextToPlainText(headquartersDescriptionHtml).slice(0, 3000),
      headquartersDescriptionHtml,
      messageBoardHtml,
      rosterLineup: draft.rosterLineup.filter(placement => eligibleLineupIds.has(placement.characterId))
    };
    const response = await guildService.updateGuildCustomization(guild._id, user.id, normalizedDraft);
    setIsSaving(false);
    if (!response.success) {
      setEditorMessage(response.error || 'Could not save the guild page.');
      return;
    }
    await Promise.all([loadGuild(), loadCommunity()]);
    setIsEditing(false);
    setDraft(null);
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

  const handleLeave = async (membership: GuildMembership) => {
    if (!guild?._id || !user?.id || !membership._id) return;
    if (!window.confirm(`Remove ${membership.character?.name || 'this character'} from the guild roster?`)) return;
    const response = await guildService.leaveGuild(guild._id, user.id, membership._id);
    setActionMessage(response.message || response.error || 'Roster updated.');
    if (response.success) await Promise.all([loadGuild(), loadCharacters(), loadCommunity()]);
  };

  const handleCheckIn = async (membership: GuildMembership) => {
    if (!guild?._id || !membership.characterId) return;
    setCheckingInCharacterId(membership.characterId);
    const response = await guildService.checkInCharacter(guild._id, membership.characterId);
    setCheckingInCharacterId('');
    if (!response.success || !response.data) {
      setActionMessage(response.error || 'Could not record this check-in.');
      return;
    }
    setActionMessage(response.data.awarded
      ? `${membership.character?.name || 'Your character'} added 1 influence to the guild.`
      : `${membership.character?.name || 'That character'} has already checked in today.`);
    await Promise.all([loadGuild(), loadCommunity()]);
  };

  const handleSignGuestbook = async () => {
    if (!guild?._id || !guestbookMessage.trim()) return;
    setIsSigningGuestbook(true);
    const response = await guildService.signGuestbook(guild._id, guestbookCharacterId || undefined, guestbookMessage);
    setIsSigningGuestbook(false);
    if (!response.success) {
      setActionMessage(response.error || 'Could not sign the guestbook.');
      return;
    }
    setGuestbookMessage('');
    setActionMessage('Your visit has been entered in the guestbook.');
    await loadCommunity();
  };

  const handleModerateGuestbook = async (entry: GuildGuestbookEntry) => {
    if (!guild?._id) return;
    setModeratingEntryId(entry._id);
    const response = await guildService.moderateGuestbookEntry(guild._id, entry._id, !entry.isHidden);
    setModeratingEntryId('');
    setActionMessage(response.success
      ? entry.isHidden ? 'Guestbook message restored.' : 'Guestbook message hidden.'
      : response.error || 'Could not moderate this message.');
    if (response.success) await loadCommunity();
  };

  if (!isAuthenticated) {
    return <main className="guild-profile-state"><Shield /><h1>Guild pages are available after sign in.</h1></main>;
  }

  if (isLoading) {
    return <main className="guild-profile-state"><Loader2 className="guild-spin" /><span>Unfurling the banner...</span></main>;
  }

  if (!displayGuild || loadError) {
    return <main className="guild-profile-state"><Shield /><h1>{loadError || 'Guild not found.'}</h1><Link to="/guilds">Return to the registry</Link></main>;
  }

  const guildStyle = {
    '--guild-base': displayGuild.baseColor,
    '--guild-accent': displayGuild.accentColor,
    '--guild-ink': displayGuild.fontColor,
    '--guild-page-background': buildProfileBackground(
      displayGuild.baseColor,
      displayGuild.backgroundMode,
      displayGuild.gradientColor,
      displayGuild.gradientOrientation,
      displayGuild.gradientTransitionRate
    ),
    '--guild-title-font': getGuildFontStack(displayGuild.titleFontFamily),
    '--guild-subtitle-font': getGuildFontStack(displayGuild.subtitleFontFamily),
    '--guild-text-font': getGuildFontStack(displayGuild.fontFamily),
    '--guild-accent-font': getGuildFontStack(displayGuild.accentFontFamily),
    '--guild-title-size': `${displayGuild.titleFontSize}px`,
    '--guild-saga-title-size': `${Math.round(displayGuild.titleFontSize * 1.75)}px`,
    '--guild-subtitle-size': `${displayGuild.subtitleFontSize}px`,
    '--guild-section-title-size': `${Math.round(displayGuild.subtitleFontSize * 1.62)}px`,
    '--guild-saga-section-title-size': `${Math.round(displayGuild.subtitleFontSize * 3.65)}px`,
    '--guild-text-size': `${displayGuild.textFontSize}px`,
    '--guild-accent-size': `${displayGuild.accentFontSize}px`,
    fontFamily: getGuildFontStack(displayGuild.fontFamily)
  } as CSSProperties;

  const leaderCharacter = leaderMembership?.character;
  const messageBoardTimestamp = isEditing && draft?.messageBoardHtml !== guild?.messageBoardHtml
    ? 'Unpublished changes'
    : formatTimestamp(displayGuild.messageBoardUpdatedAt);

  return (
    <main className="guild-profile" data-layout={displayGuild.layoutStyle} data-theme={displayGuild.themeMode} style={guildStyle}>
      <div className="guild-profile-atmosphere" aria-hidden="true" />
      <div className="guild-profile-shell">
        <nav className="guild-profile-nav">
          <Link to="/guilds"><ArrowLeft size={17} /> Guild registry</Link>
          <div className="guild-profile-nav-actions">
            {canManageGuild && <Link to={`/guilds/${displayGuild._id}/manage`}><Shield size={17} /> Manage guild</Link>}
            {canCustomizeGuild && <button type="button" onClick={openEditor}><Palette size={17} /> Customize page</button>}
          </div>
        </nav>

        <header
          className={`guild-profile-hero${displayGuild.bannerImageUrl ? ' has-banner-image' : ''}`}
          style={displayGuild.bannerImageUrl ? {
            backgroundImage: `linear-gradient(90deg, color-mix(in srgb, var(--guild-base) 94%, transparent), color-mix(in srgb, var(--guild-base) 55%, transparent), color-mix(in srgb, var(--guild-base) 86%, transparent)), url(${JSON.stringify(displayGuild.bannerImageUrl)})`
          } : undefined}
        >
          <div className="guild-profile-emblem">
            {displayGuild.emblemUrl ? <img src={displayGuild.emblemUrl} alt={`${displayGuild.name} emblem`} /> : <Shield aria-hidden="true" />}
          </div>
          <div className="guild-profile-title">
            <p className="guild-profile-kicker">{displayGuild.type}{displayGuild.region ? ` / ${displayGuild.region}` : ''}</p>
            <SafeRichText
              as="h1"
              inline
              className={`guild-animated-title guild-title-animation-${displayGuild.titleAnimation}`}
              html={displayGuild.titleHtml || plainTextToRichHtml(displayGuild.name)}
            />
            <p>{displayGuild.subtitle || 'A charter of the Shattered Convergence'}</p>
          </div>
          <div className="guild-profile-seal">
            <Star size={20} />
            <span>Guild influence</span>
            <strong>{displayGuild.influencePoints.toLocaleString()}</strong>
          </div>
        </header>

        {isDisbanded && <div className="guild-action-message">This guild has disbanded. Its charter and history are preserved as a read-only record.</div>}

        {!isDisbanded && displayGuild.autoLeaderEnabled && (
          <section className="guild-succession-banner" aria-label="Automatic guild leadership succession">
            <div className="guild-succession-member is-current">
              <div className="guild-succession-portrait">
                <DynamicCharacterPortrait
                  character={leaderCharacter}
                  fallbackSrc={characterPortrait(leaderCharacter)}
                  alt={`${leaderCharacter?.name || displayGuild.leaderCharacterName || 'Current guild leader'} portrait`}
                  className="guild-succession-current-portrait"
                  motion="hover"
                />
                <Crown aria-hidden="true" />
              </div>
              <span><small>Current guild leader</small><strong>{leaderCharacter?.name || displayGuild.leaderCharacterName || 'Unnamed leader'}</strong></span>
            </div>
            <div className="guild-succession-line" aria-hidden="true"><span /></div>
            <div className={`guild-succession-member is-next${displayGuild.autoLeaderAwaitingCheckin ? ' is-waiting' : ''}`}>
              {nextLeaderMembership?.character ? (
                <div className="guild-succession-portrait is-successor">
                  <DynamicCharacterPortrait
                    character={nextLeaderMembership.character}
                    fallbackSrc={characterPortrait(nextLeaderMembership.character)}
                    alt={`${nextLeaderMembership.character.name} portrait`}
                    className="guild-succession-next-portrait"
                    motion="hover"
                  />
                </div>
              ) : <div className="guild-succession-placeholder"><Users aria-hidden="true" /></div>}
              <span>
                <small>Next in line</small>
                <strong>{nextLeaderMembership?.character?.name || (displayGuild.autoLeaderAwaitingCheckin ? 'The next member to check in' : 'No eligible successor yet')}</strong>
              </span>
            </div>
          </section>
        )}

        <div className="guild-profile-rule"><span /></div>

        <div className="guild-profile-layout">
          {displayGuild.sectionVisibility.charter && (
            <section className="guild-story-panel">
              {displayGuild.sectionHeadings.charterLabel && <p className="guild-section-label">{displayGuild.sectionHeadings.charterLabel}</p>}
              {displayGuild.sectionHeadings.charterTitle && <h2>{displayGuild.sectionHeadings.charterTitle}</h2>}
              <SafeRichText
                className="guild-story-copy guild-rich-output"
                html={displayGuild.descriptionHtml || plainTextToRichHtml(displayGuild.description || 'This guild has not yet committed its story to the registry.')}
              />
              <div className="guild-charter-facts">
                <div><span>Status</span><strong>{displayGuild.status}</strong></div>
                <div><span>Established</span><strong>{displayGuild.foundedAt ? displayGuild.foundedAt.toLocaleDateString() : 'Forming'}</strong></div>
                <div><span>Roster</span><strong>{activeRoster.length} / {displayGuild.maxMembers}</strong></div>
              </div>
            </section>
          )}

          {displayGuild.sectionVisibility.requirements && displayGuild.requirements && (
            <section className="guild-requirements-panel">
              <Sparkles size={22} />
              <div>{displayGuild.sectionHeadings.requirementsLabel && <p className="guild-section-label">{displayGuild.sectionHeadings.requirementsLabel}</p>}{displayGuild.sectionHeadings.requirementsTitle && <h2>{displayGuild.sectionHeadings.requirementsTitle}</h2>}<p>{displayGuild.requirements}</p></div>
            </section>
          )}

          {displayGuild.sectionVisibility.headquarters && (
            <section className="guild-headquarters-panel">
              <div className="guild-headquarters-image">
                {displayGuild.headquartersImageUrl
                  ? <img src={displayGuild.headquartersImageUrl} alt={displayGuild.headquartersName || 'Guild headquarters'} />
                  : <div><Castle /><span>Headquarters image</span></div>}
              </div>
              <div className="guild-headquarters-copy">
                {displayGuild.sectionHeadings.headquartersLabel && <p className="guild-section-label">{displayGuild.sectionHeadings.headquartersLabel}</p>}
                <h2>{displayGuild.headquartersName || 'Stronghold undisclosed'}</h2>
                {(displayGuild.headquartersTitleHtml || displayGuild.headquartersTitle) && (
                  <SafeRichText as="h3" inline html={displayGuild.headquartersTitleHtml || plainTextToRichHtml(displayGuild.headquartersTitle)} />
                )}
                <SafeRichText
                  className="guild-headquarters-description guild-rich-output"
                  html={displayGuild.headquartersDescriptionHtml || plainTextToRichHtml(displayGuild.headquartersDescription || 'The guildmaster has not yet entered a headquarters into the registry.')}
                />
              </div>
            </section>
          )}

          {displayGuild.sectionVisibility.roster && (
            <section className="guild-roster-panel">
              <div className="guild-section-heading">
                <div>{displayGuild.sectionHeadings.rosterLabel && <p className="guild-section-label">{displayGuild.sectionHeadings.rosterLabel}</p>}{displayGuild.sectionHeadings.rosterTitle && <h2>{displayGuild.sectionHeadings.rosterTitle}</h2>}</div>
                <span><Users size={16} /> {activeRoster.length} listed</span>
              </div>
              {activeRoster.length > 0 ? (
                <GuildRoster guild={displayGuild} members={activeRoster} />
              ) : <p className="guild-empty-copy">The roster is waiting for its first names.</p>}
            </section>
          )}

          {displayGuild.sectionVisibility.messageBoard && (
            <section className="guild-message-board">
              <div className="guild-message-board-pin" aria-hidden="true" />
              <div className="guild-section-heading guild-community-heading">
                <div>{displayGuild.sectionHeadings.messageBoardLabel && <p className="guild-section-label">{displayGuild.sectionHeadings.messageBoardLabel}</p>}{displayGuild.sectionHeadings.messageBoardTitle && <h2>{displayGuild.sectionHeadings.messageBoardTitle}</h2>}</div>
                <span><Clock3 size={14} /> {messageBoardTimestamp}</span>
              </div>
              {displayGuild.messageBoardHtml
                ? <SafeRichText className="guild-rich-output guild-message-board-copy" html={displayGuild.messageBoardHtml} />
                : <p className="guild-empty-copy">No message has been pinned to the board.</p>}
            </section>
          )}

          {!isDisbanded && displayGuild.sectionVisibility.checkIn && (
            <section className="guild-checkin-panel">
              <div className="guild-checkin-intro">
                <div className="guild-checkin-icon"><UserCheck /></div>
                <div>{displayGuild.sectionHeadings.checkInLabel && <p className="guild-section-label">{displayGuild.sectionHeadings.checkInLabel}</p>}{displayGuild.sectionHeadings.checkInTitle && <h2>{displayGuild.sectionHeadings.checkInTitle}</h2>}<p>Each member character can add one influence point per day, at one guild only.</p></div>
                <div className="guild-influence-total"><span>Influence</span><strong>{displayGuild.influencePoints.toLocaleString()}</strong></div>
              </div>
              {currentMemberships.length > 0 ? (
                <div className="guild-checkin-actions">
                  {currentMemberships.filter(member => member.characterId).map(member => {
                    const checkedIn = checkedInCharacterIds.has(member.characterId!);
                    const checkingIn = checkingInCharacterId === member.characterId;
                    return (
                      <div className={checkedIn ? 'is-checked-in' : ''} key={member._id}>
                        <DynamicCharacterPortrait character={member.character} fallbackSrc={characterPortrait(member.character)} alt="" className="guild-checkin-portrait" motion="hover" />
                        <span><strong>{member.character?.name || 'Guild member'}</strong><small>{checkedIn ? 'Checked in today' : 'Ready to check in'}</small></span>
                        <button type="button" onClick={() => void handleCheckIn(member)} disabled={checkedIn || checkingIn}>
                          {checkingIn ? <Loader2 className="guild-spin" size={16} /> : checkedIn ? <UserCheck size={16} /> : <Plus size={16} />}
                          {checkedIn ? 'Present' : 'Check in'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : <p className="guild-checkin-note">Join the roster to check in beneath this banner.</p>}
              {todayCheckins.length > 0 && (
                <div className="guild-checkin-today">
                  <span>Present today</span>
                  <div>{todayCheckins.slice(0, 12).map(checkin => <DynamicCharacterPortrait key={checkin._id} character={checkin.character} fallbackSrc={characterPortrait(checkin.character)} alt={checkin.character?.name || 'Checked-in member'} title={checkin.character?.name} className="guild-checkin-today-portrait" motion="none" />)}</div>
                  <strong>{todayCheckins.length}</strong>
                </div>
              )}
            </section>
          )}

          {displayGuild.sectionVisibility.guestbook && (displayGuild.guestbookEnabled || isGuildmaster) && (
            <section className={`guild-guestbook-panel${displayGuild.guestbookEnabled ? '' : ' is-closed'}`}>
              <div className="guild-section-heading guild-community-heading">
                <div>{displayGuild.sectionHeadings.guestbookLabel && <p className="guild-section-label">{displayGuild.sectionHeadings.guestbookLabel}</p>}{displayGuild.sectionHeadings.guestbookTitle && <h2>{displayGuild.sectionHeadings.guestbookTitle}</h2>}</div>
                <span><BookOpen size={16} /> {displayGuild.guestbookEnabled ? 'Open to visitors' : 'Closed by the guildmaster'}</span>
              </div>
              {!isDisbanded && displayGuild.guestbookEnabled && (
                <div className="guild-guestbook-compose">
                  <label className="guild-field"><span>Visit as</span><select value={guestbookCharacterId} onChange={event => setGuestbookCharacterId(event.target.value)}><option value="">A passing traveler</option>{characters.map(character => <option key={character._id} value={character._id}>{character.name}</option>)}</select></label>
                  <label className="guild-field guild-guestbook-message"><span>Leave a roleplay note</span><textarea maxLength={1200} rows={3} value={guestbookMessage} onChange={event => setGuestbookMessage(event.target.value)} placeholder={`What happens as you visit ${displayGuild.headquartersName || 'the headquarters'}?`} /></label>
                  <button type="button" className="guild-profile-primary" onClick={() => void handleSignGuestbook()} disabled={isSigningGuestbook || !guestbookMessage.trim()}>{isSigningGuestbook ? <Loader2 className="guild-spin" size={17} /> : <Send size={17} />} Sign</button>
                </div>
              )}
              <div className="guild-guestbook-feed">
                {guestbookEntries.map(entry => (
                  <article className={entry.isHidden ? 'is-hidden' : ''} key={entry._id}>
                    <DynamicCharacterPortrait character={entry.character} fallbackSrc={characterPortrait(entry.character)} alt="" className="guild-guestbook-portrait" motion="hover" />
                    <div>
                      <header><strong>{entry.character?.name || 'A passing traveler'}</strong><time dateTime={entry.createdAt.toISOString()}>{formatTimestamp(entry.createdAt)}</time></header>
                      <p>{entry.isHidden ? 'This entry is hidden from public view.' : entry.message}</p>
                    </div>
                    {!isDisbanded && isGuildmaster && <button type="button" onClick={() => void handleModerateGuestbook(entry)} disabled={moderatingEntryId === entry._id}>{moderatingEntryId === entry._id ? <Loader2 className="guild-spin" size={15} /> : entry.isHidden ? <Eye size={15} /> : <EyeOff size={15} />}{entry.isHidden ? 'Restore' : 'Hide'}</button>}
                  </article>
                ))}
                {guestbookEntries.length === 0 && <p className="guild-empty-copy">The first page awaits its first visitor.</p>}
              </div>
            </section>
          )}

          <aside className="guild-action-panel">
            {actionMessage && <div className="guild-action-message">{actionMessage}</div>}

            {displayGuild.sectionVisibility.leader && (
              <div className="guild-leader-card">
                <div className="guild-leader-portrait"><DynamicCharacterPortrait character={leaderCharacter} fallbackSrc={characterPortrait(leaderCharacter)} alt={`${leaderCharacter?.name || displayGuild.leaderCharacterName || 'Guild leader'} portrait`} className="guild-leader-dynamic-portrait" motion="parallax" /><Crown size={20} /></div>
                <div className="guild-leader-copy">
                  {displayGuild.sectionHeadings.leaderLabel && <p className="guild-section-label">{displayGuild.sectionHeadings.leaderLabel}</p>}
                  <h2>{leaderCharacter?._id ? <Link to={`/characters/${leaderCharacter._id}`}>{leaderCharacter.name}</Link> : displayGuild.leaderCharacterName || 'Unnamed guild leader'}</h2>
                  <strong>{leaderMembership?.roleTitle || displayGuild.roleLabels.Leader}</strong>
                  {leaderCharacter && <p>Level {leaderCharacter.level} {leaderCharacter.class}<br />{leaderCharacter.ancestry || leaderCharacter.race}{leaderCharacter.background ? ` / ${leaderCharacter.background}` : ''}</p>}
                </div>
              </div>
            )}

            {!isDisbanded && (currentMemberships.length > 0 ? (
              <div className="guild-action-card guild-membership-card">
                {displayGuild.sectionHeadings.membershipLabel && <p className="guild-section-label">{displayGuild.sectionHeadings.membershipLabel}</p>}
                {displayGuild.sectionHeadings.membershipTitle && <h2>{displayGuild.sectionHeadings.membershipTitle}</h2>}
                <div className="guild-membership-list">
                  {currentMemberships.map(membership => (
                    <div key={membership._id}>
                      <DynamicCharacterPortrait character={membership.character} fallbackSrc={characterPortrait(membership.character)} alt="" className="guild-membership-portrait" motion="hover" />
                      <span><strong>{membership.character?.name || 'Your character'}</strong><small>{membership.roleTitle || displayGuild.roleLabels[membership.roleCategory]}</small></span>
                      {membership.roleCategory !== 'Leader' && <button type="button" onClick={() => void handleLeave(membership)} aria-label={`Remove ${membership.character?.name || 'character'} from guild`}><LogOut size={15} /></button>}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="guild-action-card">
                {displayGuild.sectionHeadings.petitionLabel && <p className="guild-section-label">{displayGuild.sectionHeadings.petitionLabel}</p>}
                {displayGuild.sectionHeadings.petitionTitle && <h2>{displayGuild.sectionHeadings.petitionTitle}</h2>}
                <label className="guild-field"><span>Character</span><select value={applicationCharacterId} onChange={event => setApplicationCharacterId(event.target.value)}><option value="">Choose a character</option>{characters.map(character => <option key={character._id} value={character._id}>{character.name} / Level {character.level}</option>)}</select></label>
                <label className="guild-field"><span>Requested place</span><select value={applicationRole} onChange={event => setApplicationRole(event.target.value as typeof applicationRole)}><option value="Member">{displayGuild.roleLabels.Member}</option><option value="Officer">{displayGuild.roleLabels.Officer}</option><option value="Ally">{displayGuild.roleLabels.Ally}</option></select></label>
                <label className="guild-field"><span>Message</span><textarea rows={3} value={applicationMessage} onChange={event => setApplicationMessage(event.target.value)} placeholder="Introduce yourself..." /></label>
                <button type="button" className="guild-profile-primary" onClick={handleApply}><UserPlus size={17} /> Submit petition</button>
              </div>
            ))}

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
              <label className="guild-field"><span>Registry name</span><input maxLength={80} value={draft.name} onChange={event => updateDraft('name', event.target.value)} /><small>Plain text used in search, links, and directory cards.</small></label>
              <RichTextEditor label="Display title" inline value={draft.titleHtml} onChange={value => updateDraft('titleHtml', value)} placeholder="Your guild title" />
              <label className="guild-field"><span>Title animation</span><select value={draft.titleAnimation} onChange={event => updateDraft('titleAnimation', event.target.value as GuildCustomizationInput['titleAnimation'])}><option value="none">None</option><option value="reveal">Soft reveal</option><option value="shimmer">Shimmer</option><option value="drift">Gentle drift</option><option value="glow">Arcane glow</option></select></label>
              <label className="guild-field"><span>Subtitle</span><input maxLength={140} value={draft.subtitle} onChange={event => updateDraft('subtitle', event.target.value)} /></label>
              <RichTextEditor label="Guild description" value={draft.descriptionHtml} onChange={value => updateDraft('descriptionHtml', value)} placeholder="Tell the story of your guild..." />
              <label className="guild-field"><span>Joining requirements</span><textarea maxLength={2000} rows={5} value={draft.requirements} onChange={event => updateDraft('requirements', event.target.value)} placeholder="Level, play style, schedule, and any in-character expectations..." /></label>
            </div>

            <div className="guild-editor-section">
              <h3>Typography</h3>
              <p>Use dramatic lettering for the banner without sacrificing readability in the guild's longer records.</p>
              <ProfileTypographyControls
                value={draft}
                fontOptions={guildFontOptions}
                categories={guildFontCategories}
                onChange={update => setDraft(current => current ? { ...current, ...update } : current)}
              />
            </div>

            <div className="guild-editor-section">
              <div className="guild-editor-section-heading"><h3>Colors</h3><button type="button" onClick={() => setDraft(current => current ? { ...current, ...defaultGuildPalette } : current)}><RotateCcw size={14} /> Website default</button></div>
              <div className="guild-background-mode" role="group" aria-label="Page background style">
                <button type="button" className={draft.backgroundMode === 'solid' ? 'is-selected' : ''} aria-pressed={draft.backgroundMode === 'solid'} onClick={() => updateDraft('backgroundMode', 'solid')}>Solid color</button>
                <button type="button" className={draft.backgroundMode === 'gradient' ? 'is-selected' : ''} aria-pressed={draft.backgroundMode === 'gradient'} onClick={() => updateDraft('backgroundMode', 'gradient')}>Dual-color gradient</button>
              </div>
              <div className="guild-background-mode" role="group" aria-label="Page contrast theme">
                <button type="button" className={draft.themeMode === 'dark' ? 'is-selected' : ''} aria-pressed={draft.themeMode === 'dark'} onClick={() => updateDraft('themeMode', 'dark')}>Dark theme</button>
                <button type="button" className={draft.themeMode === 'light' ? 'is-selected' : ''} aria-pressed={draft.themeMode === 'light'} onClick={() => updateDraft('themeMode', 'light')}>Light theme</button>
              </div>
              <div className="guild-color-grid">
                {([['baseColor', draft.backgroundMode === 'gradient' ? 'Background one' : 'Page'], ...(draft.backgroundMode === 'gradient' ? [['gradientColor', 'Background two']] as const : []), ['fontColor', 'Text'], ['accentColor', 'Buttons']] as const).map(([key, label]) => <label key={key}><span>{label}</span><div><input type="color" value={draft[key]} onChange={event => updateDraft(key, event.target.value)} /><code>{draft[key]}</code></div></label>)}
              </div>
              {draft.backgroundMode === 'gradient' && (
                <div className="guild-gradient-controls">
                  <div className="guild-gradient-preview" style={{ background: buildProfileBackground(draft.baseColor, draft.backgroundMode, draft.gradientColor, draft.gradientOrientation, draft.gradientTransitionRate) }} aria-hidden="true" />
                  <fieldset>
                    <legend>Gradient direction</legend>
                    <div>{(['horizontal', 'diagonal', 'vertical'] as const).map(orientation => <button type="button" className={draft.gradientOrientation === orientation ? 'is-selected' : ''} aria-pressed={draft.gradientOrientation === orientation} onClick={() => updateDraft('gradientOrientation', orientation)} key={orientation}>{orientation}</button>)}</div>
                  </fieldset>
                  <label className="guild-gradient-rate"><span>Transition rate <output>{draft.gradientTransitionRate}%</output></span><input type="range" min="0" max="100" step="1" value={draft.gradientTransitionRate} onChange={event => updateDraft('gradientTransitionRate', Number(event.target.value))} /><small>0% creates a hard split in the center. 100% blends across the whole page.</small></label>
                </div>
              )}
            </div>

            <div className="guild-editor-section">
              <h3>Page layout</h3>
              <div className="guild-layout-options">
                {guildLayoutOptions.map(option => <button type="button" className={draft.layoutStyle === option.value ? 'is-selected' : ''} onClick={() => updateDraft('layoutStyle', option.value)} key={option.value}><span className={`guild-layout-sketch guild-layout-sketch-${option.value}`}><i /><i /><i /></span><strong>{option.label}</strong><small>{option.description}</small></button>)}
              </div>
            </div>

            <div className="guild-editor-section">
              <h3>Roster presentation</h3>
              <p>Choose the visual language used for every character on the public roster.</p>
              <div className="guild-roster-options">
                <button type="button" className={draft.rosterDisplay === 'ledger' ? 'is-selected' : ''} onClick={() => selectRosterDisplay('ledger')}><BookOpen /><strong>Book ledger</strong><small>A formal registry list</small></button>
                <button type="button" className={draft.rosterDisplay === 'dossiers' ? 'is-selected' : ''} onClick={() => selectRosterDisplay('dossiers')}><FileText /><strong>Dossier files</strong><small>Portraits and case notes</small></button>
                <button type="button" className={draft.rosterDisplay === 'cards' ? 'is-selected' : ''} onClick={() => selectRosterDisplay('cards')}><Grid3X3 /><strong>Portrait cards</strong><small>A cinematic character grid</small></button>
                <button type="button" className={draft.rosterDisplay === 'lineup' ? 'is-selected' : ''} onClick={() => selectRosterDisplay('lineup')}><Sparkles /><strong>Class Photo</strong><small>Arrange overlapping character cutouts</small></button>
              </div>
              {draft.rosterDisplay === 'lineup' && <GuildRosterLineup members={activeRoster} placements={draft.rosterLineup} editable onChange={placements => updateDraft('rosterLineup', placements)} />}
            </div>

            <div className="guild-editor-section">
              <h3>Sections and visibility</h3>
              <p>Hidden sections disappear from the public page immediately.</p>
              <div className="guild-visibility-options">
                {SECTION_OPTIONS.map(option => {
                  const visible = draft.sectionVisibility[option.key];
                  return <button type="button" className={visible ? 'is-visible' : ''} aria-pressed={visible} onClick={() => updateDraft('sectionVisibility', { ...draft.sectionVisibility, [option.key]: !visible })} key={option.key}>{visible ? <Eye size={17} /> : <EyeOff size={17} />}<span><strong>{option.label}</strong><small>{option.description}</small></span><i>{visible ? 'Shown' : 'Hidden'}</i></button>;
                })}
              </div>
              <label className="guild-switch-field"><input type="checkbox" checked={draft.guestbookEnabled} onChange={event => updateDraft('guestbookEnabled', event.target.checked)} /><span><strong>Accept guestbook entries</strong><small>Keep the section visible while closing it to new visitor messages.</small></span></label>
            </div>

            <div className="guild-editor-section">
              <div className="guild-editor-section-heading"><h3>Section wording</h3><button type="button" onClick={() => updateDraft('sectionHeadings', { ...defaultGuildSectionHeadings })}><RotateCcw size={14} /> Restore defaults</button></div>
              <p>Rename each small label and main title. Leave a field empty to hide that line.</p>
              <div className="guild-heading-customization">
                {SECTION_HEADING_OPTIONS.map(option => {
                  const titleKey = option.titleKey;
                  return (
                    <fieldset key={option.section}>
                      <legend>{option.section}</legend>
                      <label className="guild-field"><span>Small label</span><input maxLength={80} value={draft.sectionHeadings[option.labelKey]} onChange={event => updateDraft('sectionHeadings', { ...draft.sectionHeadings, [option.labelKey]: event.target.value })} /></label>
                      {titleKey && <label className="guild-field"><span>Main title</span><input maxLength={80} value={draft.sectionHeadings[titleKey]} onChange={event => updateDraft('sectionHeadings', { ...draft.sectionHeadings, [titleKey]: event.target.value })} /></label>}
                    </fieldset>
                  );
                })}
              </div>
            </div>

            {canSetMessageBoard && (
              <div className="guild-editor-section">
                <h3>Guild message board</h3>
                <p>Use this as an announcement, event notice, tavern board, or any custom page content.</p>
                <RichTextEditor label="Pinned message" value={draft.messageBoardHtml} onChange={value => updateDraft('messageBoardHtml', value)} placeholder="Pin a message for members and visitors..." />
              </div>
            )}

            <div className="guild-editor-section">
              <h3>Externally hosted artwork</h3>
              <p>Paste a direct HTTPS image link from a host that allows embedding.</p>
              <label className="guild-field"><span>Emblem image URL</span><input type="url" value={draft.emblemUrl} onChange={event => updateDraft('emblemUrl', event.target.value)} placeholder="https://example.com/emblem.png" /></label>
              {draft.emblemUrl && <div className="guild-url-preview guild-url-preview-emblem"><img src={draft.emblemUrl} alt="Emblem URL preview" /><span>Emblem preview</span></div>}
              <label className="guild-field"><span>Title banner image URL</span><input type="url" value={draft.bannerImageUrl} onChange={event => updateDraft('bannerImageUrl', event.target.value)} placeholder="https://example.com/guild-banner.webp" /><small>A wide image displayed behind the guild title.</small></label>
              {draft.bannerImageUrl && <div className="guild-url-preview"><img src={draft.bannerImageUrl} alt="Guild title banner preview" /><span>Title banner preview</span></div>}
              <label className="guild-field"><span>Headquarters image URL</span><input type="url" value={draft.headquartersImageUrl} onChange={event => updateDraft('headquartersImageUrl', event.target.value)} placeholder="https://example.com/headquarters.webp" /></label>
              {draft.headquartersImageUrl && <div className="guild-url-preview"><img src={draft.headquartersImageUrl} alt="Headquarters URL preview" /><span>Headquarters preview</span></div>}
            </div>

            <div className="guild-editor-section">
              <h3>Headquarters</h3>
              <label className="guild-field"><span>Name</span><input value={draft.headquartersName} onChange={event => updateDraft('headquartersName', event.target.value)} placeholder="The Gilded Compass" /></label>
              <RichTextEditor label="Headquarters title" inline value={draft.headquartersTitleHtml} onChange={value => updateDraft('headquartersTitleHtml', value)} placeholder="Hall of the Far Horizon" />
              <RichTextEditor label="Headquarters description" value={draft.headquartersDescriptionHtml} onChange={value => updateDraft('headquartersDescriptionHtml', value)} />
            </div>

            <div className="guild-editor-section">
              <h3>Roster names</h3>
              <p>Rename the hierarchy to match your guild's culture.</p>
              {ROLE_ORDER.map(category => <label className="guild-field" key={category}><span>{category === 'Leader' ? 'Guildmaster' : category}</span><input value={draft.roleLabels[category]} onChange={event => updateDraft('roleLabels', { ...draft.roleLabels, [category]: event.target.value })} /></label>)}
            </div>

            <div className="guild-editor-actions">
              <button type="button" className="guild-secondary-action" onClick={() => { setIsEditing(false); setDraft(null); }}>Discard</button>
              <button type="button" className="guild-primary-action" onClick={() => void handleSaveCustomization()} disabled={isSaving}>{isSaving ? <Loader2 className="guild-spin" size={17} /> : <Save size={17} />} Save page</button>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
};

export default GuildProfilePage;
