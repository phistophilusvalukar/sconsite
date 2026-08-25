import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { Link, Navigate, useParams } from 'react-router-dom';
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
  defaultCharacterProfileLayers,
  defaultDynamicPortraitPlacement,
  getCharacterFontStack,
  resolveCharacterAlternateProfile
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

const applyProfileCustomization = (character: Character, profile: CharacterProfileCustomizationInput): Character => ({
  ...character,
  profileIsPublic: profile.isPublic,
  profileSubtitle: profile.subtitle,
  profileTitleFontFamily: profile.titleFontFamily,
  profileSubtitleFontFamily: profile.subtitleFontFamily,
  profileFontFamily: profile.fontFamily,
  profileAccentFontFamily: profile.accentFontFamily,
  profileTitleFontSize: profile.titleFontSize,
  profileSubtitleFontSize: profile.subtitleFontSize,
  profileTextFontSize: profile.textFontSize,
  profileAccentFontSize: profile.accentFontSize,
  profileThemeMode: profile.themeMode,
  profileBorderTheme: profile.borderTheme,
  profileBackgroundTheme: profile.backgroundTheme,
  profileBorderColorSource: profile.borderColorSource,
  profileBackgroundColorSource: profile.backgroundColorSource,
  profileFontColor: profile.fontColor,
  profileBaseColor: profile.baseColor,
  profileAccentColor: profile.accentColor,
  profileButtonTextColor: profile.buttonTextColor,
  profileBackgroundMode: profile.backgroundMode,
  profileGradientColor: profile.gradientColor,
  profileGradientOrientation: profile.gradientOrientation,
  profileGradientTransitionRate: profile.gradientTransitionRate,
  profileBannerImageUrl: profile.bannerImageUrl || undefined,
  profilePortraitImageUrl: profile.portraitImageUrl || undefined,
  profileDynamicPortraitEnabled: profile.dynamicPortraitEnabled,
  profileSplashHidePortraitBackground: profile.splashHideDynamicPortraitBackground,
  profileAtmosphereImageUrl: profile.atmosphereImageUrl || undefined,
  profileAtmospherePositionX: profile.atmospherePositionX,
  profileAtmospherePositionY: profile.atmospherePositionY,
  profileAtmosphereSize: profile.atmosphereSize,
  profileAtmosphereOpacity: profile.atmosphereOpacity,
  profileAtmosphereParallax: profile.atmosphereParallax,
  profileForegroundImageUrl: profile.foregroundImageUrl || undefined,
  profileForegroundAnchor: profile.foregroundAnchor,
  profileForegroundPositionX: profile.foregroundPositionX,
  profileForegroundPositionY: profile.foregroundPositionY,
  profileForegroundSize: profile.foregroundSize,
  profileForegroundOpacity: profile.foregroundOpacity,
  profileForegroundParallax: profile.foregroundParallax,
  profilePortraitBackgroundImageUrl: profile.portraitBackgroundImageUrl || undefined,
  profilePortraitCutoutImageUrl: profile.portraitCutoutImageUrl || undefined,
  profilePortraitBackgroundScale: profile.portraitBackgroundScale,
  profilePortraitBackgroundPositionX: profile.portraitBackgroundPositionX,
  profilePortraitBackgroundPositionY: profile.portraitBackgroundPositionY,
  profilePortraitCutoutScale: profile.portraitCutoutScale,
  profilePortraitCutoutPositionX: profile.portraitCutoutPositionX,
  profilePortraitCutoutPositionY: profile.portraitCutoutPositionY,
  profilePortraitFocusX: profile.portraitFocusX,
  profilePortraitFocusY: profile.portraitFocusY,
  profileLayoutStyle: profile.layoutStyle,
  profileSectionVisibility: { ...profile.sectionVisibility }
});

const DYNAMIC_PORTRAIT_TUTORIAL_IMAGES = {
  top: 'https://assets.forge-vtt.com/63bf21c87e2f5e785340cb33/tokenizer/pc-images/placeholderImage/placeholder.top.webp',
  bottom: 'https://assets.forge-vtt.com/63bf21c87e2f5e785340cb33/tokenizer/pc-images/placeholderImage/placeholder.background.png'
} as const;

const profileLayerImageStyle = (
  positionX: number,
  positionY: number,
  size: number,
  opacity: number
): CSSProperties => ({
  left: `${positionX}%`,
  top: `${positionY}%`,
  width: `${size}vw`,
  opacity: opacity / 100
});

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
  const [presentationCompanions, setPresentationCompanions] = useState<PublicCharacterProfileBundle['companions'] | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isEditorCollapsed, setIsEditorCollapsed] = useState(false);
  const [isEditingCharacter, setIsEditingCharacter] = useState(false);
  const [draft, setDraft] = useState<CharacterProfileCustomizationInput | null>(null);
  const [otherShapeDraft, setOtherShapeDraft] = useState<CharacterProfileCustomizationInput | null>(null);
  const [draftVersion, setDraftVersion] = useState<1 | 2>(1);
  const [changeShapeEnabled, setChangeShapeEnabled] = useState(false);
  const [activeShape, setActiveShape] = useState<1 | 2>(1);
  const [isShapeChanging, setIsShapeChanging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editorMessage, setEditorMessage] = useState('');
  const [linkMessage, setLinkMessage] = useState('');
  const [showDynamicPortraitTutorial, setShowDynamicPortraitTutorial] = useState(false);
  const pageRef = useRef<HTMLElement>(null);

  const loadProfile = useCallback(async (showLoading = false) => {
    if (!characterId) {
      setLoadError('Character not found.');
      setIsLoading(false);
      return;
    }
    if (showLoading) setIsLoading(true);

    if (publicView) {
      const [response, presentationResponse] = await Promise.all([
        characterService.getPublicCharacterProfile(characterId),
        characterService.getCharacterProfilePresentation(characterId)
      ]);
      if (response.success && response.data) {
        const presentation = presentationResponse.success ? presentationResponse.data : undefined;
        const presentedCharacter = presentation ? {
          ...response.data.character,
          profileChangeShapeEnabled: presentation.profileChangeShapeEnabled,
          profileAlternateShape: presentation.profileAlternateShape
        } : response.data.character;
        const presentedData = {
          ...response.data,
          character: presentedCharacter,
          companions: presentation?.companions ?? response.data.companions
        };
        setCharacter(presentedCharacter);
        setPublicData(presentedData);
        setPresentationCompanions(presentedData.companions);
        setCharacters([]);
        setLoadError('');
      } else {
        setCharacter(null);
        setPublicData(null);
        setPresentationCompanions(undefined);
        setLoadError(response.error || 'This character page is private or unavailable.');
      }
      setIsLoading(false);
      return;
    }

    if (!user?.id) return;
    const [characterResponse, publicResponse, presentationResponse] = await Promise.all([
      characterService.getCharacterById(characterId),
      characterService.getPublicCharacters(),
      characterService.getCharacterProfilePresentation(characterId)
    ]);

    if (characterResponse.success && characterResponse.data) {
      const presentation = presentationResponse.success ? presentationResponse.data : undefined;
      const presentedCharacter = presentation ? {
        ...characterResponse.data,
        profileChangeShapeEnabled: presentation.profileChangeShapeEnabled,
        profileAlternateShape: presentation.profileAlternateShape
      } : characterResponse.data;
      setCharacter(presentedCharacter);
      setPresentationCompanions(presentation?.companions);
      setLoadError('');
      const byId = new Map<string, Character>();
      [...(publicResponse.data || []), presentedCharacter].forEach(item => {
        if (item._id) byId.set(item._id, item);
      });
      setCharacters(Array.from(byId.values()));
    } else {
      setCharacter(null);
      setPublicData(null);
      setPresentationCompanions(undefined);
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
    if (!character) return null;
    if (isEditingProfile && draft) return applyProfileCustomization(character, draft);
    if (activeShape === 2 && character.profileChangeShapeEnabled) {
      const alternate = resolveCharacterAlternateProfile(character);
      if (alternate) return applyProfileCustomization(character, alternate);
    }
    return character;
  }, [activeShape, character, draft, isEditingProfile]);

  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;

    let animationFrame = 0;
    const updateLayerParallax = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        const scrollY = window.scrollY;
        page.style.setProperty('--character-atmosphere-parallax-y', `${scrollY * -.08}px`);
        page.style.setProperty('--character-foreground-parallax-y', `${scrollY * -.16}px`);
      });
    };

    updateLayerParallax();
    if (displayCharacter?.profileAtmosphereParallax || displayCharacter?.profileForegroundParallax) {
      window.addEventListener('scroll', updateLayerParallax, { passive: true });
    }
    return () => {
      window.removeEventListener('scroll', updateLayerParallax);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, [displayCharacter?.profileAtmosphereParallax, displayCharacter?.profileForegroundParallax]);

  const openEditor = () => {
    if (!character) return;
    const primary = customizationFromCharacter(character);
    const alternate = resolveCharacterAlternateProfile(character);
    setDraft(primary);
    setOtherShapeDraft(alternate ? { ...alternate, isPublic: primary.isPublic } : { ...primary, sectionVisibility: { ...primary.sectionVisibility } });
    setDraftVersion(1);
    setChangeShapeEnabled(Boolean(character.profileChangeShapeEnabled));
    setEditorMessage('');
    setShowDynamicPortraitTutorial(false);
    setIsEditorCollapsed(false);
    setIsEditingProfile(true);
  };

  const closeEditor = () => {
    setDraft(null);
    setOtherShapeDraft(null);
    setEditorMessage('');
    setShowDynamicPortraitTutorial(false);
    setIsEditorCollapsed(false);
    setIsEditingProfile(false);
  };

  const switchDraftVersion = (version: 1 | 2) => {
    if (!draft || !otherShapeDraft || version === draftVersion) return;
    setOtherShapeDraft(draft);
    setDraft({ ...otherShapeDraft, isPublic: draft.isPublic });
    setDraftVersion(version);
  };

  const handleChangeShape = () => {
    if (!character?.profileChangeShapeEnabled || isShapeChanging) return;
    setIsShapeChanging(true);
    window.setTimeout(() => setActiveShape(current => current === 1 ? 2 : 1), 260);
    window.setTimeout(() => setIsShapeChanging(false), 700);
  };

  const updateDraft = <Key extends keyof CharacterProfileCustomizationInput>(
    key: Key,
    value: CharacterProfileCustomizationInput[Key]
  ) => {
    setDraft(current => current ? { ...current, [key]: value } : current);
    if (key === 'isPublic') {
      setOtherShapeDraft(current => current ? { ...current, isPublic: value as boolean } : current);
    }
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
    const primary = draftVersion === 1 ? draft : otherShapeDraft;
    const alternate = draftVersion === 2 ? draft : otherShapeDraft;
    if (!primary || !alternate) return;
    const response = await characterService.updateCharacterProfile(character._id, user.id, primary, {
      enabled: changeShapeEnabled,
      alternate: { ...alternate, isPublic: primary.isPublic }
    });
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

  if (!publicView && displayCharacter.status === 'dead') {
    return <Navigate replace to={`/public/characters/${displayCharacter._id}`} />;
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
    '--character-accent-font': getCharacterFontStack(displayCharacter.profileAccentFontFamily),
    '--character-title-size': `${displayCharacter.profileTitleFontSize}px`,
    '--character-dossier-title-size': `${Math.round(displayCharacter.profileTitleFontSize * .78)}px`,
    '--character-saga-title-size': `${Math.round(displayCharacter.profileTitleFontSize * 1.3)}px`,
    '--character-subtitle-size': `${displayCharacter.profileSubtitleFontSize}px`,
    '--character-section-title-size': `${Math.round(displayCharacter.profileSubtitleFontSize * 1.85)}px`,
    '--character-saga-subtitle-size': `${Math.round(displayCharacter.profileSubtitleFontSize * 1.55)}px`,
    '--character-text-size': `${displayCharacter.profileTextFontSize}px`,
    '--character-accent-size': `${displayCharacter.profileAccentFontSize}px`,
    fontFamily: getCharacterFontStack(displayCharacter.profileFontFamily)
  } as CSSProperties;

  return (
    <main ref={pageRef} className={`character-profile-page${isShapeChanging ? ' is-shape-changing' : ''}${displayCharacter.status === 'dead' ? ' is-dead' : ''}`} data-theme={displayCharacter.profileThemeMode} style={profileStyle}>
      <div className="character-profile-atmosphere" aria-hidden="true">
        {displayCharacter.profileAtmosphereImageUrl && <img className={`character-profile-layer-image${displayCharacter.profileAtmosphereParallax ? ' is-parallax' : ''}`} src={displayCharacter.profileAtmosphereImageUrl} alt="" draggable={false} style={profileLayerImageStyle(displayCharacter.profileAtmospherePositionX, displayCharacter.profileAtmospherePositionY, displayCharacter.profileAtmosphereSize, displayCharacter.profileAtmosphereOpacity)} />}
      </div>
      <div className={`character-profile-shell character-profile-shell-${displayCharacter.profileLayoutStyle}`}>
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
            companionData={!publicView ? presentationCompanions : undefined}
            onChangeShape={displayCharacter.profileChangeShapeEnabled ? handleChangeShape : undefined}
            shapeVersion={activeShape}
          />
        </Suspense>
      </div>

      {isEditingProfile && draft && isEditorCollapsed && (
        <button type="button" className="character-editor-reopen" onClick={() => setIsEditorCollapsed(false)} aria-label="Show customization editor">
          <Palette size={18} /> Show editor
        </button>
      )}

      {isEditingProfile && draft && !isEditorCollapsed && (
        <div className="character-editor-backdrop">
          <aside className="character-editor" aria-label="Customize character page">
            <div className="character-editor-heading">
              <div><p><Pencil size={14} /> Live preview</p><h2>Customize character page</h2></div>
              <div className="character-editor-heading-actions">
                <button type="button" onClick={() => setIsEditorCollapsed(true)} aria-label="Hide editor to preview the full page"><Eye size={17} /><span>Preview</span></button>
                <button type="button" onClick={closeEditor} aria-label="Close editor"><X size={20} /></button>
              </div>
            </div>
            {editorMessage && <div className="character-editor-error">{editorMessage}</div>}

            <div className="character-editor-section character-shape-editor">
              <h3>Change Shape</h3>
              <p>Create a second visual version of this profile. Character details, records, and permissions remain shared.</p>
              <label className="character-dynamic-toggle"><input type="checkbox" checked={changeShapeEnabled} onChange={event => setChangeShapeEnabled(event.target.checked)} /><span><strong>Enable Change Shape</strong><small>Adds a transformation button beside the profile picture.</small></span></label>
              {changeShapeEnabled && <div className="character-shape-versions" role="group" aria-label="Shape version to customize">
                <button type="button" className={draftVersion === 1 ? 'is-selected' : ''} onClick={() => switchDraftVersion(1)}>Version 1</button>
                <button type="button" className={draftVersion === 2 ? 'is-selected' : ''} onClick={() => switchDraftVersion(2)}>Version 2</button>
              </div>}
            </div>

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
              <div className="character-background-mode" role="group" aria-label="Page contrast theme">
                <button type="button" className={draft.themeMode === 'dark' ? 'is-selected' : ''} aria-pressed={draft.themeMode === 'dark'} onClick={() => updateDraft('themeMode', 'dark')}>Dark theme</button>
                <button type="button" className={draft.themeMode === 'light' ? 'is-selected' : ''} aria-pressed={draft.themeMode === 'light'} onClick={() => updateDraft('themeMode', 'light')}>Light theme</button>
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
              <div className="character-editor-section-heading"><h3>Decorative image layers</h3><button type="button" onClick={() => setDraft(current => current ? { ...current, ...defaultCharacterProfileLayers } : current)}><RotateCcw size={14} /> Reset layers</button></div>
              <p>Add transparent artwork behind the profile or attach it to the page, its edges, the portrait, or the backstory flow.</p>
              <div className="character-decoration-controls">
                <fieldset>
                  <legend>Atmosphere · behind profile</legend>
                  <label className="character-field"><span>Image URL</span><input type="url" value={draft.atmosphereImageUrl} onChange={event => updateDraft('atmosphereImageUrl', event.target.value)} placeholder="https://example.com/bat-shadows.png" /><small>Transparent PNG or WebP artwork works best.</small></label>
                  {draft.atmosphereImageUrl && <>
                    <div className="character-decoration-sliders">
                      <label><span>Horizontal position</span><output>{draft.atmospherePositionX}%</output><input type="range" min="0" max="100" value={draft.atmospherePositionX} onChange={event => updateDraft('atmospherePositionX', Number(event.target.value))} /></label>
                      <label><span>Vertical position</span><output>{draft.atmospherePositionY}%</output><input type="range" min="0" max="100" value={draft.atmospherePositionY} onChange={event => updateDraft('atmospherePositionY', Number(event.target.value))} /></label>
                      <label><span>Size</span><output>{draft.atmosphereSize}%</output><input type="range" min="5" max="200" value={draft.atmosphereSize} onChange={event => updateDraft('atmosphereSize', Number(event.target.value))} /></label>
                      <label><span>Opacity</span><output>{draft.atmosphereOpacity}%</output><input type="range" min="0" max="100" value={draft.atmosphereOpacity} onChange={event => updateDraft('atmosphereOpacity', Number(event.target.value))} /></label>
                    </div>
                    <label className="character-dynamic-toggle"><input type="checkbox" checked={draft.atmosphereParallax} onChange={event => updateDraft('atmosphereParallax', event.target.checked)} /><span><strong>Parallax scrolling</strong><small>Move this layer gently as the profile scrolls.</small></span></label>
                  </>}
                </fieldset>
                <fieldset>
                  <legend>Foreground · above profile</legend>
                  <label className="character-field"><span>Image URL</span><input type="url" value={draft.foregroundImageUrl} onChange={event => updateDraft('foregroundImageUrl', event.target.value)} placeholder="https://example.com/infernal-seal.png" /><small>This layer never blocks profile controls or links.</small></label>
                  {draft.foregroundImageUrl && <>
                    <div className="character-decoration-anchor" role="group" aria-label="Attach foreground image to">
                      <span>Attach to</span>
                      <div>
                        <button type="button" className={draft.foregroundAnchor === 'page' ? 'is-selected' : ''} aria-pressed={draft.foregroundAnchor === 'page'} onClick={() => updateDraft('foregroundAnchor', 'page')}>Page canvas</button>
                        <button type="button" className={draft.foregroundAnchor === 'left' ? 'is-selected' : ''} aria-pressed={draft.foregroundAnchor === 'left'} onClick={() => updateDraft('foregroundAnchor', 'left')}>Left edge</button>
                        <button type="button" className={draft.foregroundAnchor === 'right' ? 'is-selected' : ''} aria-pressed={draft.foregroundAnchor === 'right'} onClick={() => updateDraft('foregroundAnchor', 'right')}>Right edge</button>
                        <button type="button" className={draft.foregroundAnchor === 'portrait' ? 'is-selected' : ''} aria-pressed={draft.foregroundAnchor === 'portrait'} onClick={() => updateDraft('foregroundAnchor', 'portrait')}>Portrait</button>
                        <button type="button" className={draft.foregroundAnchor === 'backstory' ? 'is-selected' : ''} aria-pressed={draft.foregroundAnchor === 'backstory'} onClick={() => updateDraft('foregroundAnchor', 'backstory')}>Below backstory</button>
                      </div>
                      <small>Position and size are relative to the selected part of the profile.</small>
                    </div>
                    <div className="character-decoration-sliders">
                      <label><span>Horizontal position</span><output>{draft.foregroundPositionX}%</output><input type="range" min="0" max="100" value={draft.foregroundPositionX} onChange={event => updateDraft('foregroundPositionX', Number(event.target.value))} /></label>
                      <label><span>Vertical position</span><output>{draft.foregroundPositionY}%</output><input type="range" min="0" max="100" value={draft.foregroundPositionY} onChange={event => updateDraft('foregroundPositionY', Number(event.target.value))} /></label>
                      <label><span>Size</span><output>{draft.foregroundSize}%</output><input type="range" min="5" max="200" value={draft.foregroundSize} onChange={event => updateDraft('foregroundSize', Number(event.target.value))} /></label>
                      <label><span>Opacity</span><output>{draft.foregroundOpacity}%</output><input type="range" min="0" max="100" value={draft.foregroundOpacity} onChange={event => updateDraft('foregroundOpacity', Number(event.target.value))} /></label>
                    </div>
                    <label className="character-dynamic-toggle"><input type="checkbox" checked={draft.foregroundParallax} onChange={event => updateDraft('foregroundParallax', event.target.checked)} /><span><strong>Parallax scrolling</strong><small>Move this overlay faster to create depth.</small></span></label>
                  </>}
                </fieldset>
              </div>
            </div>

            <div className="character-editor-section">
              <h3>Portrait</h3>
              <p>Override the Foundry portrait for this profile version without enabling Dynamic Portrait.</p>
              <label className="character-field"><span>Portrait image URL</span><input type="url" value={draft.portraitImageUrl} onChange={event => updateDraft('portraitImageUrl', event.target.value)} placeholder="https://example.com/alternate-form.webp" /><small>Use a direct HTTPS image link. Dynamic Portrait takes precedence when enabled.</small></label>
              {draft.portraitImageUrl && <div className="character-standard-portrait-preview"><img src={draft.portraitImageUrl} alt="Portrait preview" /></div>}
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
              {draft.layoutStyle === 'cyberpunk' && draft.dynamicPortraitEnabled && <label className="character-dynamic-toggle"><input type="checkbox" checked={draft.splashHideDynamicPortraitBackground} onChange={event => updateDraft('splashHideDynamicPortraitBackground', event.target.checked)} /><span><strong>Hide background layer on Splash</strong><small>Show only the transparent character cutout in the full-bleed Splash artwork. Other templates still use both layers.</small></span></label>}
              <label className="character-field"><span>Background image URL</span><input type="url" value={draft.portraitBackgroundImageUrl} onChange={event => updateDraft('portraitBackgroundImageUrl', event.target.value)} placeholder="https://example.com/forest-background.webp" /><small>A wide or square scenic image works best.</small></label>
              <label className="character-field"><span>Transparent character cutout URL</span><input type="url" value={draft.portraitCutoutImageUrl} onChange={event => updateDraft('portraitCutoutImageUrl', event.target.value)} placeholder="https://example.com/character-cutout.png" /><small>Use a transparent PNG or WebP with space around the figure.</small></label>
              {draft.portraitBackgroundImageUrl && draft.portraitCutoutImageUrl && <>
                <div className="character-focus-picker">
                  <DynamicCharacterPortrait character={{ name: displayCharacter.name, profileDynamicPortraitEnabled: true, profilePortraitBackgroundImageUrl: draft.portraitBackgroundImageUrl, profilePortraitCutoutImageUrl: draft.portraitCutoutImageUrl, profilePortraitBackgroundScale: draft.portraitBackgroundScale, profilePortraitBackgroundPositionX: draft.portraitBackgroundPositionX, profilePortraitBackgroundPositionY: draft.portraitBackgroundPositionY, profilePortraitCutoutScale: draft.portraitCutoutScale, profilePortraitCutoutPositionX: draft.portraitCutoutPositionX, profilePortraitCutoutPositionY: draft.portraitCutoutPositionY, profilePortraitFocusX: draft.portraitFocusX, profilePortraitFocusY: draft.portraitFocusY }} fallbackSrc={draft.portraitBackgroundImageUrl} alt={`${displayCharacter.name} Dynamic Portrait preview`} className="character-dynamic-preview" motion="none" allowDynamic hideBackground={draft.layoutStyle === 'cyberpunk' && draft.splashHideDynamicPortraitBackground} />
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
