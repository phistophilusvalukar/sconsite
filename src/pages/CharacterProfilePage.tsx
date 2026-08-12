import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  ArrowLeft,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Palette,
  Pencil,
  RotateCcw,
  Save,
  Shield,
  X
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { DATABASE_TABLES } from '../config/database';
import { useAuth } from '../context/useAuth';
import {
  CharacterProfileCustomizationInput,
  characterFontCategories,
  characterFontOptions,
  characterLayoutOptions,
  customizationFromCharacter,
  defaultCharacterProfilePalette,
  getCharacterFontStack
} from '../features/characters/characterProfileCustomization';
import DynamicCharacterPortrait from '../features/characters/DynamicCharacterPortrait';
import { useSupabaseRealtime } from '../hooks/useSupabaseRealtime';
import { CharacterService } from '../services/characterService';
import type { Character } from '../types/database';
import './characterProfile.css';

const CharacterDetails = lazy(() => import('../components/CharacterDetailsModal'));
const CharacterForm = lazy(() => import('../components/CharacterForm'));

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

const CharacterProfilePage: React.FC = () => {
  const { characterId } = useParams<{ characterId: string }>();
  const { isAuthenticated, user } = useAuth();
  const characterService = useMemo(() => CharacterService.getInstance(), []);
  const [character, setCharacter] = useState<Character | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isEditingCharacter, setIsEditingCharacter] = useState(false);
  const [draft, setDraft] = useState<CharacterProfileCustomizationInput | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [editorMessage, setEditorMessage] = useState('');
  const [linkMessage, setLinkMessage] = useState('');

  const loadProfile = useCallback(async () => {
    if (!characterId || !user?.id) return;
    setIsLoading(true);
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
      setLoadError(characterResponse.error || 'Character not found.');
    }
    setIsLoading(false);
  }, [characterId, characterService, user?.id]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useSupabaseRealtime({
    channelName: `character-profile-page-${characterId || 'unknown'}-${user?.id || 'anonymous'}`,
    tables: [
      DATABASE_TABLES.CHARACTERS,
      DATABASE_TABLES.CHARACTER_FOUNDRY_FILES,
      DATABASE_TABLES.CHARACTER_JOURNAL_ENTRIES,
      DATABASE_TABLES.CHARACTER_JOURNAL_COMMENTS,
      DATABASE_TABLES.CHARACTER_JOURNAL_LIKES,
      DATABASE_TABLES.CHARACTER_RELATIONSHIPS,
      DATABASE_TABLES.GUILD_MEMBERSHIPS
    ],
    onChange: loadProfile,
    enabled: isAuthenticated && Boolean(characterId && user?.id),
    debounceMs: 1500
  });

  const isOwner = Boolean(character && user?.id === character.userId);
  const displayCharacter = useMemo(() => {
    if (!character || !draft || !isEditingProfile) return character;
    return {
      ...character,
      profileSubtitle: draft.subtitle,
      profileFontFamily: draft.fontFamily,
      profileFontColor: draft.fontColor,
      profileBaseColor: draft.baseColor,
      profileAccentColor: draft.accentColor,
      profileBannerImageUrl: draft.bannerImageUrl || undefined,
      profileDynamicPortraitEnabled: draft.dynamicPortraitEnabled,
      profilePortraitBackgroundImageUrl: draft.portraitBackgroundImageUrl || undefined,
      profilePortraitCutoutImageUrl: draft.portraitCutoutImageUrl || undefined,
      profileLayoutStyle: draft.layoutStyle,
      profileSectionVisibility: { ...draft.sectionVisibility }
    };
  }, [character, draft, isEditingProfile]);

  const openEditor = () => {
    if (!character) return;
    setDraft(customizationFromCharacter(character));
    setEditorMessage('');
    setIsEditingProfile(true);
  };

  const closeEditor = () => {
    setDraft(null);
    setEditorMessage('');
    setIsEditingProfile(false);
  };

  const updateDraft = <Key extends keyof CharacterProfileCustomizationInput>(
    key: Key,
    value: CharacterProfileCustomizationInput[Key]
  ) => {
    setDraft(current => current ? { ...current, [key]: value } : current);
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

  const copyPageLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkMessage('Link copied');
      window.setTimeout(() => setLinkMessage(''), 1800);
    } catch {
      setLinkMessage('Copy unavailable');
    }
  };

  if (!isAuthenticated) {
    return <main className="character-profile-state"><Shield /><h1>Character pages are available after sign in.</h1></main>;
  }

  if (isLoading) {
    return <main className="character-profile-state"><Loader2 className="character-spin" /><span>Opening the character folio...</span></main>;
  }

  if (!displayCharacter || loadError) {
    return <main className="character-profile-state"><Shield /><h1>{loadError || 'Character not found.'}</h1><Link to="/characters">Return to characters</Link></main>;
  }

  const profileStyle = {
    '--character-base': displayCharacter.profileBaseColor,
    '--character-accent': displayCharacter.profileAccentColor,
    '--character-ink': displayCharacter.profileFontColor,
    fontFamily: getCharacterFontStack(displayCharacter.profileFontFamily)
  } as CSSProperties;

  return (
    <main className="character-profile-page" style={profileStyle}>
      <div className="character-profile-atmosphere" aria-hidden="true" />
      <div className="character-profile-shell">
        <nav className="character-profile-nav" aria-label="Character profile controls">
          <Link to="/characters"><ArrowLeft size={17} /> Character registry</Link>
          <div>
            <button type="button" onClick={() => void copyPageLink()}><Copy size={16} /> {linkMessage || 'Copy page link'}</button>
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

            <div className="character-editor-section">
              <h3>Typography</h3>
              <div className="character-font-groups">
                {characterFontCategories.map(category => <section key={category}><h4>{category}</h4><div className="character-option-grid">
                  {characterFontOptions.filter(option => option.category === category).map(option => <button type="button" className={draft.fontFamily === option.value ? 'is-selected' : ''} style={{ fontFamily: option.stack }} onClick={() => updateDraft('fontFamily', option.value)} key={option.value}><strong>{option.label}</strong><span>Ag</span></button>)}
                </div></section>)}
              </div>
            </div>

            <div className="character-editor-section">
              <div className="character-editor-section-heading"><h3>Colors</h3><button type="button" onClick={() => setDraft(current => current ? { ...current, ...defaultCharacterProfilePalette } : current)}><RotateCcw size={14} /> Website default</button></div>
              <div className="character-color-grid">
                {([['baseColor', 'Page'], ['fontColor', 'Text'], ['accentColor', 'Buttons']] as const).map(([key, label]) => <label key={key}><span>{label}</span><div><input type="color" value={draft[key]} onChange={event => updateDraft(key, event.target.value)} /><code>{draft[key]}</code></div></label>)}
              </div>
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
              <h3>Dynamic portrait</h3>
              <p>Layer a transparent character cutout over a background. The portrait shifts with the page and tilts beneath the pointer anywhere this character appears.</p>
              <label className="character-dynamic-toggle"><input type="checkbox" checked={draft.dynamicPortraitEnabled} onChange={event => updateDraft('dynamicPortraitEnabled', event.target.checked)} /><span><strong>Use Dynamic Portrait site-wide</strong><small>Both direct HTTPS image links are required when enabled.</small></span></label>
              <label className="character-field"><span>Background image URL</span><input type="url" value={draft.portraitBackgroundImageUrl} onChange={event => updateDraft('portraitBackgroundImageUrl', event.target.value)} placeholder="https://example.com/forest-background.webp" /><small>A wide or square scenic image works best.</small></label>
              <label className="character-field"><span>Transparent character cutout URL</span><input type="url" value={draft.portraitCutoutImageUrl} onChange={event => updateDraft('portraitCutoutImageUrl', event.target.value)} placeholder="https://example.com/character-cutout.png" /><small>Use a transparent PNG or WebP with space around the figure.</small></label>
              {draft.portraitBackgroundImageUrl && draft.portraitCutoutImageUrl && <DynamicCharacterPortrait character={{ name: displayCharacter.name, profileDynamicPortraitEnabled: true, profilePortraitBackgroundImageUrl: draft.portraitBackgroundImageUrl, profilePortraitCutoutImageUrl: draft.portraitCutoutImageUrl }} fallbackSrc={draft.portraitBackgroundImageUrl} alt={`${displayCharacter.name} Dynamic Portrait preview`} className="character-dynamic-preview" motion="hover" />}
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
