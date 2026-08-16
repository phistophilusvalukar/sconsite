import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  ArrowLeft,
  Copy,
  Crosshair,
  Eye,
  EyeOff,
  Globe2,
  HelpCircle,
  FileJson,
  Loader2,
  Palette,
  Pencil,
  RotateCcw,
  Save,
  Shield,
  X
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import ProfileTypographyControls from '../components/ProfileTypographyControls';
import { DATABASE_TABLES } from '../config/database';
import { useAuth } from '../context/useAuth';
import {
  CharacterProfileCustomizationInput,
  characterFontCategories,
  characterFontOptions,
  characterLayoutOptions,
  customizationFromCharacter,
  defaultCharacterProfilePalette,
  defaultDynamicPortraitPlacement,
  getCharacterFontStack
} from '../features/characters/characterProfileCustomization';
import DynamicCharacterPortrait from '../features/characters/DynamicCharacterPortrait';
import { useSupabaseRealtime } from '../hooks/useSupabaseRealtime';
import { buildProfileBackground } from '../features/profiles/profileBackground';
import { CharacterService } from '../services/characterService';
import type { PublicCharacterProfileBundle } from '../services/characterService';
import type { Character } from '../types/database';
import './characterProfile.css';

const CharacterDetails = lazy(() => import('../components/CharacterDetailsModal'));
const CharacterForm = lazy(() => import('../components/CharacterForm'));

const DYNAMIC_PORTRAIT_TUTORIAL_IMAGES = {
  top: 'https://assets.forge-vtt.com/63bf21c87e2f5e785340cb33/tokenizer/pc-images/placeholderImage/placeholder.top.webp',
  bottom: 'https://assets.forge-vtt.com/63bf21c87e2f5e785340cb33/tokenizer/pc-images/placeholderImage/placeholder.background.png'
} as const;

const SECTION_OPTIONS: Array<{
  key: keyof Character['profileSectionVisibility'];
  label: string;
  description: string;
}> = [
  { key: 'portrait', label: 'Portrait', description: 'The character artwork shown beside their identity.' },
  { key: 'details', label: 'Character details', description: 'Ancestry, heritage, background, age, and other facts.' },
  { key: 'abilityMatrix', label: 'Ability matrix', description: 'The radar chart derived from the active Foundry file.' },
  { key: 'backstory', label: 'Backstory', description: 'The character biography and history.' },
  { key: 'notes', label: 'Notes', description: 'Additional public notes from the character record.' },
  { key: 'journal', label: 'Journal', description: 'Public journal entries, likes, and comments.' },
  { key: 'relationships', label: 'Relationships', description: 'The character relationship ledger and graph.' }
];

interface CharacterProfilePageProps {
  publicView?: boolean;
}

const CharacterProfilePage: React.FC<CharacterProfilePageProps> = ({ publicView = false }) => {
  const { characterId } = useParams<{ characterId: string }>();
  const { isAuthenticated, user } = useAuth();
  const characterService = useMemo(() => CharacterService.getInstance(), []);
  const [character, setCharacter] = useState<Character | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [publicData, setPublicData] = useState<PublicCharacterProfileBundle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isEditingCharacter, setIsEditingCharacter] = useState(false);
  const [draft, setDraft] = useState<CharacterProfileCustomizationInput | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [editorMessage, setEditorMessage] = useState('');
  const [linkMessage, setLinkMessage] = useState('');
  const [showDynamicPortraitTutorial, setShowDynamicPortraitTutorial] = useState(false);

  const loadProfile = useCallback(async (showLoading = false) => {
    if (!characterId) {
      setLoadError('Character not found.');
      setIsLoading(false);
      return;
    }
    if (showLoading) setIsLoading(true);

    if (publicView) {
      const response = await characterService.getPublicCharacterProfile(characterId);
      if (response.success && response.data) {
        setCharacter(response.data.character);
        setPublicData(response.data);
        setCharacters([]);
        setLoadError('');
      } else {
        setCharacter(null);
        setPublicData(null);
        setLoadError(response.error || 'This character page is private or unavailable.');
      }
      setIsLoading(false);
      return;
    }

    if (!user?.id) return;
    const [characterResponse, publicResponse] = await Promise.all([
      characterService.getCharacterById(characterId),
      characterService.getPublicCharacters()
    ]);

    if (characterResponse.success && characterResponse.data) {
      setCharacter(characterResponse.data);
      setLoadError('');
      const byId = new Map<string, Character>();
      [...(publicResponse.data || []), characterResponse.data].forEach(item => {
        if (item._id) byId.set(item._id, item);
      });
      setCharacters(Array.from(byId.values()));
    } else {
      setCharacter(null);
      setPublicData(null);
      setLoadError(characterResponse.error || 'Character not found.');
    }
    setIsLoading(false);
  }, [characterId, characterService, publicView, user?.id]);

  useEffect(() => {
    void loadProfile(true);
  }, [loadProfile]);

  useSupabaseRealtime({
    channelName: `character-profile-page-${characterId || 'unknown'}-${user?.id || 'anonymous'}`,
    tables: [
      DATABASE_TABLES.CHARACTERS,
      DATABASE_TABLES.GUILD_MEMBERSHIPS
    ],
    onChange: loadProfile,
    enabled: !publicView && isAuthenticated && Boolean(characterId && user?.id),
    debounceMs: 1500
  });

  const isOwner = !publicView && Boolean(character && user?.id === character.userId);
  const displayCharacter = useMemo(() => {
    if (!character || !draft || !isEditingProfile) return character;
    return {
      ...character,
      profileIsPublic: draft.isPublic,
      profileSubtitle: draft.subtitle,
      profileTitleFontFamily: draft.titleFontFamily,
      profileSubtitleFontFamily: draft.subtitleFontFamily,
      profileFontFamily: draft.fontFamily,
      profileTitleFontSize: draft.titleFontSize,
      profileSubtitleFontSize: draft.subtitleFontSize,
      profileTextFontSize: draft.textFontSize,
      profileFontColor: draft.fontColor,
      profileBaseColor: draft.baseColor,
      profileAccentColor: draft.accentColor,
      profileButtonTextColor: draft.buttonTextColor,
      profileBackgroundMode: draft.backgroundMode,
      profileGradientColor: draft.gradientColor,
      profileGradientOrientation: draft.gradientOrientation,
      profileGradientTransitionRate: draft.gradientTransitionRate,
      profileBannerImageUrl: draft.bannerImageUrl || undefined,
      profileDynamicPortraitEnabled: draft.dynamicPortraitEnabled,
      profilePortraitBackgroundImageUrl: draft.portraitBackgroundImageUrl || undefined,
      profilePortraitCutoutImageUrl: draft.portraitCutoutImageUrl || undefined,
      profilePortraitBackgroundScale: draft.portraitBackgroundScale,
      profilePortraitBackgroundPositionX: draft.portraitBackgroundPositionX,
      profilePortraitBackgroundPositionY: draft.portraitBackgroundPositionY,
      profilePortraitCutoutScale: draft.portraitCutoutScale,
      profilePortraitCutoutPositionX: draft.portraitCutoutPositionX,
      profilePortraitCutoutPositionY: draft.portraitCutoutPositionY,
      profilePortraitFocusX: draft.portraitFocusX,
      profilePortraitFocusY: draft.portraitFocusY,
      profileLayoutStyle: draft.layoutStyle,
      profileSectionVisibility: { ...draft.sectionVisibility }
    };
  }, [character, draft, isEditingProfile]);

  const openEditor = () => {
    if (!character) return;
    setDraft(customizationFromCharacter(character));
    setEditorMessage('');
    setShowDynamicPortraitTutorial(false);
    setIsEditingProfile(true);
  };

  const closeEditor = () => {
    setDraft(null);
    setEditorMessage('');
    setShowDynamicPortraitTutorial(false);
    setIsEditingProfile(false);
  };

  const updateDraft = <Key extends keyof CharacterProfileCustomizationInput>(
    key: Key,
    value: CharacterProfileCustomizationInput[Key]
  ) => {
    setDraft(current => current ? { ...current, [key]: value } : current);
  };

  const setPortraitFocusFromPointer = (event: React.PointerEvent<HTMLButtonElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const focusX = Math.round(Math.max(0, Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100)));
    const focusY = Math.round(Math.max(0, Math.min(100, ((event.clientY - bounds.top) / bounds.height) * 100)));
    setDraft(current => current ? { ...current, portraitFocusX: focusX, portraitFocusY: focusY } : current);
  };

  const handleSaveProfile = async () => {
    if (!character?._id || !user?.id || !draft) return;
    setIsSaving(true);
    setEditorMessage('');
    const response = await characterService.updateCharacterProfile(character._id, user.id, draft);
    setIsSaving(false);
    if (!response.success) {
      setEditorMessage(response.error || 'Could not save the character page.');
      return;
    }
    await loadProfile();
    closeEditor();
  };

  const handleCharacterSaved = async (savedCharacter: Character) => {
    setCharacter(savedCharacter);
    setIsEditingCharacter(false);
    await loadProfile();
  };

  const copyPageLink = async (url = window.location.href) => {
    try {
      await navigator.clipboard.writeText(url);
      setLinkMessage('Link copied');
      window.setTimeout(() => setLinkMessage(''), 1800);
    } catch {
      setLinkMessage('Copy unavailable');
    }
  };

  if (!isAuthenticated && !publicView) {
    return <main className="character-profile-state"><Shield /><h1>Character pages are available after sign in.</h1></main>;
  }

  if (isLoading) {
    return <main className="character-profile-state"><Loader2 className="character-spin" /><span>Opening the character folio...</span></main>;
  }

  if (!displayCharacter || loadError) {
    return <main className="character-profile-state"><Shield /><h1>{loadError || (publicView ? 'This character page is private or unavailable.' : 'Character not found.')}</h1>{!publicView && <Link to="/characters">Return to characters</Link>}</main>;
  }

  const publicPageUrl = `${window.location.origin}/public/characters/${displayCharacter._id}`;

  const profileStyle = {
    '--character-base': displayCharacter.profileBaseColor,
    '--character-accent': displayCharacter.profileAccentColor,
    '--character-button-ink': displayCharacter.profileButtonTextColor,
    '--character-ink': displayCharacter.profileFontColor,
    '--character-page-background': displayCharacter.profileBackgroundMode === 'gradient'
      ? buildProfileBackground(
        displayCharacter.profileBaseColor,
        displayCharacter.profileBackgroundMode,
        displayCharacter.profileGradientColor,
        displayCharacter.profileGradientOrientation,
        displayCharacter.profileGradientTransitionRate
      )
      : `color-mix(in srgb, ${displayCharacter.profileBaseColor} 88%, #060706)`,
    '--character-title-font': getCharacterFontStack(displayCharacter.profileTitleFontFamily),
    '--character-subtitle-font': getCharacterFontStack(displayCharacter.profileSubtitleFontFamily),
    '--character-text-font': getCharacterFontStack(displayCharacter.profileFontFamily),
    '--character-title-size': `${displayCharacter.profileTitleFontSize}px`,
    '--character-dossier-title-size': `${Math.round(displayCharacter.profileTitleFontSize * .78)}px`,
    '--character-saga-title-size': `${Math.round(displayCharacter.profileTitleFontSize * 1.3)}px`,
    '--character-subtitle-size': `${displayCharacter.profileSubtitleFontSize}px`,
    '--character-section-title-size': `${Math.round(displayCharacter.profileSubtitleFontSize * 1.85)}px`,
    '--character-saga-subtitle-size': `${Math.round(displayCharacter.profileSubtitleFontSize * 1.55)}px`,
    '--character-text-size': `${displayCharacter.profileTextFontSize}px`,
    fontFamily: getCharacterFontStack(displayCharacter.profileFontFamily)
  } as CSSProperties;

  return (
    <main className="character-profile-page" style={profileStyle}>
      <div className="character-profile-atmosphere" aria-hidden="true" />
      <div className="character-profile-shell">
        <nav className="character-profile-nav" aria-label="Character profile controls">
          {publicView
            ? <span className="character-profile-public-label"><Globe2 size={17} /> Public character folio</span>
            : <Link to="/characters"><ArrowLeft size={17} /> Character registry</Link>}
          <div>
            <button type="button" onClick={() => void copyPageLink(publicView || displayCharacter.profileIsPublic ? publicPageUrl : window.location.href)}><Copy size={16} /> {linkMessage || (displayCharacter.profileIsPublic ? 'Copy public link' : 'Copy page link')}</button>
            {isOwner && <Link to={`/characters/${displayCharacter._id}/planner`}><FileJson size={17} /> Foundry planner</Link>}
            {isOwner && <button type="button" onClick={openEditor}><Palette size={17} /> Customize page</button>}
          </div>
        </nav>

        <Suspense fallback={<div className="character-profile-loading"><Loader2 className="character-spin" /> Loading profile...</div>}>
          <CharacterDetails
            character={displayCharacter}
            characters={characters}
            currentUserId={user?.id || ''}
            canEdit={isOwner}
            pageMode
            onEdit={() => setIsEditingCharacter(true)}
            onRelationshipsChanged={loadProfile}
            readOnlyData={publicView && publicData ? publicData : undefined}
          />
        </Suspense>
      </div>

      {isEditingProfile && draft && (
        <div className="character-editor-backdrop">
          <aside className="character-editor" aria-label="Customize character page">
            <div className="character-editor-heading">
              <div><p><Pencil size={14} /> Live preview</p><h2>Customize character page</h2></div>
              <button type="button" onClick={closeEditor} aria-label="Close editor"><X /></button>
            </div>
            {editorMessage && <div className="character-editor-error">{editorMessage}</div>}

            <div className="character-editor-section">
              <h3>Identity</h3>
              <label className="character-field"><span>Subtitle</span><input maxLength={140} value={draft.subtitle} onChange={event => updateDraft('subtitle', event.target.value)} placeholder="Cartographer of impossible roads" /><small>A short line beneath the character name.</small></label>
            </div>

            <div className="character-editor-section character-public-access">
              <h3>Public access</h3>
              <p>Publish a read-only version of this character page that anyone with its URL can open without signing in.</p>
              <label className="character-dynamic-toggle"><input type="checkbox" checked={draft.isPublic} onChange={event => updateDraft('isPublic', event.target.checked)} /><Globe2 size={19} /><span><strong>Allow public viewing</strong><small>Hidden sections stay hidden, and private Foundry files and equipment are never included.</small></span></label>
              {draft.isPublic && displayCharacter._id && <div className="character-public-link"><code>{publicPageUrl}</code><button type="button" onClick={() => void copyPageLink(publicPageUrl)}><Copy size={14} /> {linkMessage || 'Copy'}</button></div>}
            </div>

            <div className="character-editor-section">
              <h3>Typography</h3>
              <p>Choose a readable text face while keeping dramatic display fonts for names and headings.</p>
              <ProfileTypographyControls
                value={draft}
                fontOptions={characterFontOptions}
                categories={characterFontCategories}
                onChange={update => setDraft(current => current ? { ...current, ...update } : current)}
              />
            </div>

            <div className="character-editor-section">
              <div className="character-editor-section-heading"><h3>Colors</h3><button type="button" onClick={() => setDraft(current => current ? { ...current, ...defaultCharacterProfilePalette } : current)}><RotateCcw size={14} /> Website default</button></div>
              <div className="character-background-mode" role="group" aria-label="Page background style">
                <button type="button" className={draft.backgroundMode === 'solid' ? 'is-selected' : ''} aria-pressed={draft.backgroundMode === 'solid'} onClick={() => updateDraft('backgroundMode', 'solid')}>Solid color</button>
                <button type="button" className={draft.backgroundMode === 'gradient' ? 'is-selected' : ''} aria-pressed={draft.backgroundMode === 'gradient'} onClick={() => updateDraft('backgroundMode', 'gradient')}>Dual-color gradient</button>
              </div>
              <div className="character-color-grid">
                {([['baseColor', draft.backgroundMode === 'gradient' ? 'Background one' : 'Page'], ...(draft.backgroundMode === 'gradient' ? [['gradientColor', 'Background two']] as const : []), ['fontColor', 'Text'], ['accentColor', 'Buttons'], ['buttonTextColor', 'Button text']] as const).map(([key, label]) => <label key={key}><span>{label}</span><div><input type="color" value={draft[key]} onChange={event => updateDraft(key, event.target.value)} /><code>{draft[key]}</code></div></label>)}
              </div>
              {draft.backgroundMode === 'gradient' && (
                <div className="character-gradient-controls">
                  <div className="character-gradient-preview" style={{ background: buildProfileBackground(draft.baseColor, draft.backgroundMode, draft.gradientColor, draft.gradientOrientation, draft.gradientTransitionRate) }} aria-hidden="true" />
                  <fieldset>
                    <legend>Gradient direction</legend>
                    <div>{(['horizontal', 'diagonal', 'vertical'] as const).map(orientation => <button type="button" className={draft.gradientOrientation === orientation ? 'is-selected' : ''} aria-pressed={draft.gradientOrientation === orientation} onClick={() => updateDraft('gradientOrientation', orientation)} key={orientation}>{orientation}</button>)}</div>
                  </fieldset>
                  <label className="character-gradient-rate"><span>Transition rate <output>{draft.gradientTransitionRate}%</output></span><input type="range" min="0" max="100" step="1" value={draft.gradientTransitionRate} onChange={event => updateDraft('gradientTransitionRate', Number(event.target.value))} /><small>0% creates a hard split in the center. 100% blends across the whole page.</small></label>
                </div>
              )}
            </div>

            <div className="character-editor-section">
              <h3>Page layout</h3>
              <div className="character-layout-options">
                {characterLayoutOptions.map(option => <button type="button" className={draft.layoutStyle === option.value ? 'is-selected' : ''} onClick={() => updateDraft('layoutStyle', option.value)} key={option.value}><span className={`character-layout-sketch character-layout-sketch-${option.value}`}><i /><i /><i /></span><strong>{option.label}</strong><small>{option.description}</small></button>)}
              </div>
            </div>

            <div className="character-editor-section">
              <h3>Hero artwork</h3>
              <p>Use a direct HTTPS image link as the banner behind the character name.</p>
              <label className="character-field"><span>Banner image URL</span><input type="url" value={draft.bannerImageUrl} onChange={event => updateDraft('bannerImageUrl', event.target.value)} placeholder="https://example.com/character-banner.webp" /><small>Wide images work best. A dark veil is added automatically for readable text.</small></label>
              {draft.bannerImageUrl && <div className="character-banner-preview"><img src={draft.bannerImageUrl} alt="Character banner preview" /><span>Banner preview</span></div>}
            </div>

            <div className="character-editor-section">
              <div className="character-dynamic-heading">
                <h3>Dynamic portrait</h3>
                <button
                  type="button"
                  className={showDynamicPortraitTutorial ? 'is-open' : ''}
                  onClick={() => setShowDynamicPortraitTutorial(current => !current)}
                  aria-expanded={showDynamicPortraitTutorial}
                  aria-controls="dynamic-portrait-tutorial"
                >
                  <HelpCircle size={15} /> How it works
                </button>
              </div>
              {showDynamicPortraitTutorial && <div className="character-dynamic-tutorial" id="dynamic-portrait-tutorial">
                <div className="character-dynamic-tutorial-heading">
                  <div><span>Two images, one portrait</span><strong>Build a portrait with depth</strong></div>
                  <button type="button" onClick={() => setShowDynamicPortraitTutorial(false)} aria-label="Close Dynamic Portrait tutorial"><X size={16} /></button>
                </div>
                <div
                  className="character-dynamic-tutorial-stage"
                  role="img"
                  aria-label="The bottom background layer enters from the left and the top transparent character layer enters from the right. They join to form a tilting Dynamic Portrait."
                >
                  <div className="character-dynamic-tutorial-bottom" aria-hidden="true">
                    <span><strong>Bottom layer</strong><small>Background image</small></span>
                    <div><img src={DYNAMIC_PORTRAIT_TUTORIAL_IMAGES.bottom} alt="" /></div>
                  </div>
                  <div className="character-dynamic-tutorial-top" aria-hidden="true">
                    <span><strong>Top layer</strong><small>Transparent cutout</small></span>
                    <img src={DYNAMIC_PORTRAIT_TUTORIAL_IMAGES.top} alt="" />
                  </div>
                  <span className="character-dynamic-tutorial-result" aria-hidden="true">Dynamic portrait</span>
                </div>
                <div className="character-dynamic-tutorial-steps">
                  <span><b>1</b> Choose a scene for the bottom.</span>
                  <span><b>2</b> Add a transparent character cutout on top.</span>
                  <span><b>3</b> The two layers move separately to create depth.</span>
                </div>
              </div>}
              <p>Layer a transparent character cutout over a background. The portrait shifts with the page and tilts beneath the pointer on this character's dedicated profile.</p>
              <label className="character-dynamic-toggle"><input type="checkbox" checked={draft.dynamicPortraitEnabled} onChange={event => updateDraft('dynamicPortraitEnabled', event.target.checked)} /><span><strong>Use Dynamic Portrait on profile page</strong><small>The cutout can also be selected for a guild Class Photo. Both direct HTTPS image links are required.</small></span></label>
              <label className="character-field"><span>Background image URL</span><input type="url" value={draft.portraitBackgroundImageUrl} onChange={event => updateDraft('portraitBackgroundImageUrl', event.target.value)} placeholder="https://example.com/forest-background.webp" /><small>A wide or square scenic image works best.</small></label>
              <label className="character-field"><span>Transparent character cutout URL</span><input type="url" value={draft.portraitCutoutImageUrl} onChange={event => updateDraft('portraitCutoutImageUrl', event.target.value)} placeholder="https://example.com/character-cutout.png" /><small>Use a transparent PNG or WebP with space around the figure.</small></label>
              {draft.portraitBackgroundImageUrl && draft.portraitCutoutImageUrl && <>
                <div className="character-focus-picker">
                  <DynamicCharacterPortrait character={{ name: displayCharacter.name, profileDynamicPortraitEnabled: true, profilePortraitBackgroundImageUrl: draft.portraitBackgroundImageUrl, profilePortraitCutoutImageUrl: draft.portraitCutoutImageUrl, profilePortraitBackgroundScale: draft.portraitBackgroundScale, profilePortraitBackgroundPositionX: draft.portraitBackgroundPositionX, profilePortraitBackgroundPositionY: draft.portraitBackgroundPositionY, profilePortraitCutoutScale: draft.portraitCutoutScale, profilePortraitCutoutPositionX: draft.portraitCutoutPositionX, profilePortraitCutoutPositionY: draft.portraitCutoutPositionY, profilePortraitFocusX: draft.portraitFocusX, profilePortraitFocusY: draft.portraitFocusY }} fallbackSrc={draft.portraitBackgroundImageUrl} alt={`${displayCharacter.name} Dynamic Portrait preview`} className="character-dynamic-preview" motion="none" allowDynamic />
                  <button type="button" className="character-focus-map" onPointerDown={setPortraitFocusFromPointer} aria-label="Choose the character eye position in the portrait"><span style={{ left: `${draft.portraitFocusX}%`, top: `${draft.portraitFocusY}%` }}><Crosshair /></span></button>
                  <p>Click the character's eyes to choose the crop focus.</p>
                </div>
                <div className="character-placement-heading"><div><strong>Layer placement</strong><small>Resize and move each image independently.</small></div><button type="button" onClick={() => setDraft(current => current ? { ...current, ...defaultDynamicPortraitPlacement } : current)}><RotateCcw size={13} /> Reset placement</button></div>
                <div className="character-layer-placement">
                  <fieldset>
                    <legend>Background layer</legend>
                    <label><span>Size</span><input type="range" min="50" max="250" value={draft.portraitBackgroundScale} onChange={event => updateDraft('portraitBackgroundScale', Number(event.target.value))} /><output>{draft.portraitBackgroundScale}%</output></label>
                    <label><span>Move left / right</span><input type="range" min="-50" max="50" value={draft.portraitBackgroundPositionX} onChange={event => updateDraft('portraitBackgroundPositionX', Number(event.target.value))} /><output>{draft.portraitBackgroundPositionX}%</output></label>
                    <label><span>Move up / down</span><input type="range" min="-50" max="50" value={draft.portraitBackgroundPositionY} onChange={event => updateDraft('portraitBackgroundPositionY', Number(event.target.value))} /><output>{draft.portraitBackgroundPositionY}%</output></label>
                  </fieldset>
                  <fieldset>
                    <legend>Character cutout</legend>
                    <label><span>Size</span><input type="range" min="50" max="250" value={draft.portraitCutoutScale} onChange={event => updateDraft('portraitCutoutScale', Number(event.target.value))} /><output>{draft.portraitCutoutScale}%</output></label>
                    <label><span>Move left / right</span><input type="range" min="-50" max="50" value={draft.portraitCutoutPositionX} onChange={event => updateDraft('portraitCutoutPositionX', Number(event.target.value))} /><output>{draft.portraitCutoutPositionX}%</output></label>
                    <label><span>Move up / down</span><input type="range" min="-50" max="50" value={draft.portraitCutoutPositionY} onChange={event => updateDraft('portraitCutoutPositionY', Number(event.target.value))} /><output>{draft.portraitCutoutPositionY}%</output></label>
                  </fieldset>
                </div>
                <div className="character-crop-heading"><strong>Portrait crop focus</strong><small>This keeps the character's face visible when the profile layout crops the artwork.</small></div>
                <div className="character-focus-controls">
                  <label><span>Horizontal focus</span><input type="range" min="0" max="100" value={draft.portraitFocusX} onChange={event => updateDraft('portraitFocusX', Number(event.target.value))} /><output>{draft.portraitFocusX}%</output></label>
                  <label><span>Vertical focus</span><input type="range" min="0" max="100" value={draft.portraitFocusY} onChange={event => updateDraft('portraitFocusY', Number(event.target.value))} /><output>{draft.portraitFocusY}%</output></label>
                </div>
              </>}
            </div>

            <div className="character-editor-section">
              <h3>Sections and visibility</h3>
              <p>Hidden sections disappear from the public character page. Foundry file controls always remain private to you.</p>
              <div className="character-visibility-options">
                {SECTION_OPTIONS.map(option => {
                  const visible = draft.sectionVisibility[option.key];
                  return <button type="button" className={visible ? 'is-visible' : ''} aria-pressed={visible} onClick={() => updateDraft('sectionVisibility', { ...draft.sectionVisibility, [option.key]: !visible })} key={option.key}>{visible ? <Eye size={17} /> : <EyeOff size={17} />}<span><strong>{option.label}</strong><small>{option.description}</small></span><i>{visible ? 'Shown' : 'Hidden'}</i></button>;
                })}
              </div>
            </div>

            <div className="character-editor-actions">
              <button type="button" onClick={closeEditor}>Discard</button>
              <button type="button" className="is-primary" onClick={() => void handleSaveProfile()} disabled={isSaving}>{isSaving ? <Loader2 className="character-spin" size={17} /> : <Save size={17} />} Save page</button>
            </div>
          </aside>
        </div>
      )}

      {isEditingCharacter && character && user?.id && (
        <Suspense fallback={<div className="character-profile-loading"><Loader2 className="character-spin" /> Loading character editor...</div>}>
          <CharacterForm character={character} userId={user.id} onSave={handleCharacterSaved} onCancel={() => setIsEditingCharacter(false)} />
        </Suspense>
      )}
    </main>
  );
};

export default CharacterProfilePage;
