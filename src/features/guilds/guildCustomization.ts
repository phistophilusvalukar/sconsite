import { z } from 'zod';
import { Guild } from '../../types/database';
import { defaultProfileDecorations, profileDecorationThemeValues } from '../profiles/profileDecorations';
import { defaultProfileBackground, profileBackgroundModeValues, profileGradientOrientationValues } from '../profiles/profileBackground';
import { plainTextToRichHtml } from './richText';

export const guildFontOptions = [
  { value: 'cinzel', label: 'Cinzel', stack: 'Cinzel, Georgia, serif', category: 'Classic' },
  { value: 'cormorant', label: 'Cormorant', stack: '"Cormorant Garamond", Georgia, serif', category: 'Classic' },
  { value: 'merriweather', label: 'Merriweather', stack: 'Merriweather, Georgia, serif', category: 'Classic' },
  { value: 'inter', label: 'Inter', stack: 'Inter, ui-sans-serif, system-ui, sans-serif', category: 'Classic' },
  { value: 'alegreya', label: 'Alegreya', stack: 'Alegreya, Georgia, serif', category: 'Classic' },
  { value: 'im-fell', label: 'IM Fell English', stack: '"IM Fell English", Georgia, serif', category: 'Classic' },
  { value: 'uncial', label: 'Uncial Antiqua', stack: '"Uncial Antiqua", Georgia, serif', category: 'Classic' },
  { value: 'pirata', label: 'Pirata One', stack: '"Pirata One", Georgia, serif', category: 'Classic' },
  { value: 'grenze', label: 'Grenze Gotisch', stack: '"Grenze Gotisch", Georgia, serif', category: 'Classic' },
  { value: 'caesar', label: 'Caesar Dressing', stack: '"Caesar Dressing", Georgia, serif', category: 'Savage' },
  { value: 'metal-mania', label: 'Metal Mania', stack: '"Metal Mania", Georgia, serif', category: 'Savage' },
  { value: 'new-rocker', label: 'New Rocker', stack: '"New Rocker", Georgia, serif', category: 'Savage' },
  { value: 'trade-winds', label: 'Trade Winds', stack: '"Trade Winds", Georgia, serif', category: 'Savage' },
  { value: 'great-vibes', label: 'Great Vibes', stack: '"Great Vibes", cursive', category: 'Fancy' },
  { value: 'marcellus', label: 'Marcellus SC', stack: '"Marcellus SC", Georgia, serif', category: 'Fancy' },
  { value: 'cinzel-decorative', label: 'Cinzel Decorative', stack: '"Cinzel Decorative", Georgia, serif', category: 'Fancy' },
  { value: 'tangerine', label: 'Tangerine', stack: 'Tangerine, cursive', category: 'Fancy' },
  { value: 'almendra-display', label: 'Almendra Display', stack: '"Almendra Display", Georgia, serif', category: 'Whimsical' },
  { value: 'henny-penny', label: 'Henny Penny', stack: '"Henny Penny", Georgia, serif', category: 'Whimsical' },
  { value: 'macondo', label: 'Macondo', stack: 'Macondo, Georgia, serif', category: 'Whimsical' },
  { value: 'mystery-quest', label: 'Mystery Quest', stack: '"Mystery Quest", Georgia, serif', category: 'Whimsical' },
  { value: 'press-start-2p', label: 'Press Start 2P', stack: '"Press Start 2P", monospace', category: 'Whimsical' }
] as const;

export const guildFontCategories = ['Classic', 'Savage', 'Fancy', 'Whimsical'] as const;

export const guildLayoutOptions = [
  { value: 'chronicle', label: 'Chronicle', description: 'A balanced editorial page.' },
  { value: 'stronghold', label: 'Stronghold', description: 'Headquarters takes center stage.' },
  { value: 'banner', label: 'Banner', description: 'A bold, ceremonial presentation.' },
  { value: 'saga', label: 'Saga', description: 'A monumental hero and asymmetric twelve-column hall.' },
  { value: 'cyberpunk', label: 'Cyberpunk', description: 'A neon network of angular panels and luminous guild telemetry.' },
  { value: 'nostalgia', label: 'Nostalgia', description: 'Game Boy greens, NES-era pixel borders, and hard-edged retro interface panels.' }
] as const;

export const defaultGuildRoleLabels = {
  Leader: 'Guildmaster',
  Subleader: 'Subleaders',
  Officer: 'Officers',
  Member: 'Members',
  Ally: 'Allies'
} as const;

export const defaultGuildManagementPermissions = {
  kickMembers: false,
  setMessageBoard: false,
  acceptApplications: false,
  customizeGuild: false
} as const;

export const defaultGuildSectionVisibility = {
  charter: true,
  requirements: true,
  headquarters: true,
  leader: true,
  roster: true,
  messageBoard: true,
  checkIn: true,
  guestbook: true
} as const;

export const defaultGuildSectionHeadings = {
  charterLabel: 'Our charter',
  charterTitle: 'About the guild',
  requirementsLabel: 'Joining the order',
  requirementsTitle: 'Requirements',
  headquartersLabel: 'Headquarters',
  rosterLabel: 'People of the banner',
  rosterTitle: 'The roster',
  messageBoardLabel: 'Pinned by the guildmaster',
  messageBoardTitle: 'Message board',
  checkInLabel: 'Daily guild check-in',
  checkInTitle: 'Make your mark',
  guestbookLabel: 'At the headquarters door',
  guestbookTitle: 'Guild guestbook',
  leaderLabel: 'Guild leadership',
  membershipLabel: 'Your membership',
  membershipTitle: 'Your characters',
  petitionLabel: 'Join the story',
  petitionTitle: 'Petition the guild',
  foundersLabel: 'Founding roster',
  foundersTitle: 'Invite founders',
  applicationsLabel: "Guildmaster's desk",
  applicationsTitle: 'Applications'
} as const;

export const defaultGuildPalette = {
  baseColor: '#111615',
  fontColor: '#f0ede7',
  accentColor: '#a09482',
  ...defaultProfileBackground
} as const;

export const defaultGuildTypography = {
  titleFontFamily: 'cinzel',
  subtitleFontFamily: 'cinzel',
  fontFamily: 'inter',
  accentFontFamily: 'inter',
  titleFontSize: 96,
  subtitleFontSize: 21,
  textFontSize: 16,
  accentFontSize: 13
} as const;

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Choose a valid six-digit color.');
export const isSafeExternalImageUrl = (value: string) => {
  if (!value) return true;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};
const externalImageUrl = z.string().trim().max(2000).refine(isSafeExternalImageUrl, 'Use a direct HTTPS image URL.');
const sectionHeadingText = z.string().trim().max(80, 'Section headings can be at most 80 characters.');
export const guildRosterLineupPlacementSchema = z.object({
  characterId: z.string().uuid(),
  x: z.number().int().min(0).max(100),
  y: z.number().int().min(-30).max(40),
  scale: z.number().int().min(50).max(180),
  rotation: z.number().int().min(-12).max(12)
}).strict();

export const guildCustomizationSchema = z.object({
  name: z.string().trim().min(2, 'Guild name must be at least 2 characters.').max(80),
  titleHtml: z.string().trim().max(1200),
  titleAnimation: z.enum(['none', 'reveal', 'shimmer', 'drift', 'glow']),
  subtitle: z.string().trim().max(140),
  description: z.string().trim().max(4000),
  descriptionHtml: z.string().trim().max(12000),
  titleFontFamily: z.enum(['cinzel', 'cormorant', 'merriweather', 'inter', 'alegreya', 'im-fell', 'uncial', 'pirata', 'grenze', 'caesar', 'metal-mania', 'new-rocker', 'trade-winds', 'great-vibes', 'marcellus', 'cinzel-decorative', 'tangerine', 'almendra-display', 'henny-penny', 'macondo', 'mystery-quest', 'press-start-2p']),
  subtitleFontFamily: z.enum(['cinzel', 'cormorant', 'merriweather', 'inter', 'alegreya', 'im-fell', 'uncial', 'pirata', 'grenze', 'caesar', 'metal-mania', 'new-rocker', 'trade-winds', 'great-vibes', 'marcellus', 'cinzel-decorative', 'tangerine', 'almendra-display', 'henny-penny', 'macondo', 'mystery-quest', 'press-start-2p']),
  fontFamily: z.enum(['cinzel', 'cormorant', 'merriweather', 'inter', 'alegreya', 'im-fell', 'uncial', 'pirata', 'grenze', 'caesar', 'metal-mania', 'new-rocker', 'trade-winds', 'great-vibes', 'marcellus', 'cinzel-decorative', 'tangerine', 'almendra-display', 'henny-penny', 'macondo', 'mystery-quest', 'press-start-2p']),
  accentFontFamily: z.enum(['cinzel', 'cormorant', 'merriweather', 'inter', 'alegreya', 'im-fell', 'uncial', 'pirata', 'grenze', 'caesar', 'metal-mania', 'new-rocker', 'trade-winds', 'great-vibes', 'marcellus', 'cinzel-decorative', 'tangerine', 'almendra-display', 'henny-penny', 'macondo', 'mystery-quest', 'press-start-2p']),
  titleFontSize: z.number().int().min(40).max(180),
  subtitleFontSize: z.number().int().min(14).max(56),
  textFontSize: z.number().int().min(12).max(26),
  accentFontSize: z.number().int().min(10).max(28),
  borderTheme: z.enum(profileDecorationThemeValues),
  backgroundTheme: z.enum(profileDecorationThemeValues),
  borderColorSource: z.enum(['base', 'accent']),
  backgroundColorSource: z.enum(['base', 'accent']),
  fontColor: hexColor,
  baseColor: hexColor,
  accentColor: hexColor,
  backgroundMode: z.enum(profileBackgroundModeValues),
  gradientColor: hexColor,
  gradientOrientation: z.enum(profileGradientOrientationValues),
  gradientTransitionRate: z.number().int().min(0).max(100),
  layoutStyle: z.enum(['chronicle', 'stronghold', 'banner', 'saga', 'cyberpunk', 'nostalgia']),
  rosterDisplay: z.enum(['ledger', 'dossiers', 'cards', 'lineup']),
  rosterLineup: z.array(guildRosterLineupPlacementSchema).max(30).refine(
    placements => new Set(placements.map(placement => placement.characterId)).size === placements.length,
    'Each character can appear only once in the Class Photo.'
  ),
  sectionVisibility: z.object({
    charter: z.boolean(),
    requirements: z.boolean(),
    headquarters: z.boolean(),
    leader: z.boolean(),
    roster: z.boolean(),
    messageBoard: z.boolean(),
    checkIn: z.boolean(),
    guestbook: z.boolean()
  }).strict(),
  sectionHeadings: z.object({
    charterLabel: sectionHeadingText,
    charterTitle: sectionHeadingText,
    requirementsLabel: sectionHeadingText,
    requirementsTitle: sectionHeadingText,
    headquartersLabel: sectionHeadingText,
    rosterLabel: sectionHeadingText,
    rosterTitle: sectionHeadingText,
    messageBoardLabel: sectionHeadingText,
    messageBoardTitle: sectionHeadingText,
    checkInLabel: sectionHeadingText,
    checkInTitle: sectionHeadingText,
    guestbookLabel: sectionHeadingText,
    guestbookTitle: sectionHeadingText,
    leaderLabel: sectionHeadingText,
    membershipLabel: sectionHeadingText,
    membershipTitle: sectionHeadingText,
    petitionLabel: sectionHeadingText,
    petitionTitle: sectionHeadingText,
    foundersLabel: sectionHeadingText,
    foundersTitle: sectionHeadingText,
    applicationsLabel: sectionHeadingText,
    applicationsTitle: sectionHeadingText
  }).strict(),
  emblemUrl: externalImageUrl,
  bannerImageUrl: externalImageUrl,
  headquartersName: z.string().trim().max(100),
  headquartersTitle: z.string().trim().max(140),
  headquartersTitleHtml: z.string().trim().max(1200),
  headquartersDescription: z.string().trim().max(3000),
  headquartersDescriptionHtml: z.string().trim().max(10000),
  headquartersImageUrl: externalImageUrl,
  requirements: z.string().trim().max(2000),
  messageBoardHtml: z.string().trim().max(12000),
  guestbookEnabled: z.boolean(),
  roleLabels: z.object({
    Leader: z.string().trim().min(1).max(40),
    Subleader: z.string().trim().min(1).max(40),
    Officer: z.string().trim().min(1).max(40),
    Member: z.string().trim().min(1).max(40),
    Ally: z.string().trim().min(1).max(40)
  })
}).strict();

export type GuildCustomizationInput = z.infer<typeof guildCustomizationSchema>;

export const getGuildFontStack = (fontFamily: Guild['fontFamily']) =>
  guildFontOptions.find(option => option.value === fontFamily)?.stack || guildFontOptions[0].stack;

export const customizationFromGuild = (guild: Guild): GuildCustomizationInput => ({
  name: guild.name,
  titleHtml: guild.titleHtml || plainTextToRichHtml(guild.name),
  titleAnimation: guild.titleAnimation,
  subtitle: guild.subtitle,
  description: guild.description,
  descriptionHtml: guild.descriptionHtml || plainTextToRichHtml(guild.description),
  titleFontFamily: guild.titleFontFamily || guild.fontFamily,
  subtitleFontFamily: guild.subtitleFontFamily || guild.fontFamily,
  fontFamily: guild.fontFamily,
  accentFontFamily: guild.accentFontFamily || guild.fontFamily,
  titleFontSize: guild.titleFontSize || defaultGuildTypography.titleFontSize,
  subtitleFontSize: guild.subtitleFontSize || defaultGuildTypography.subtitleFontSize,
  textFontSize: guild.textFontSize || defaultGuildTypography.textFontSize,
  accentFontSize: guild.accentFontSize || defaultGuildTypography.accentFontSize,
  borderTheme: guild.borderTheme || defaultProfileDecorations.borderTheme,
  backgroundTheme: guild.backgroundTheme || defaultProfileDecorations.backgroundTheme,
  borderColorSource: guild.borderColorSource || defaultProfileDecorations.borderColorSource,
  backgroundColorSource: guild.backgroundColorSource || defaultProfileDecorations.backgroundColorSource,
  fontColor: guild.fontColor,
  baseColor: guild.baseColor,
  accentColor: guild.accentColor,
  backgroundMode: guild.backgroundMode,
  gradientColor: guild.gradientColor,
  gradientOrientation: guild.gradientOrientation,
  gradientTransitionRate: guild.gradientTransitionRate,
  layoutStyle: guild.layoutStyle,
  rosterDisplay: guild.rosterDisplay,
  rosterLineup: guild.rosterLineup || [],
  sectionVisibility: { ...guild.sectionVisibility },
  sectionHeadings: { ...defaultGuildSectionHeadings, ...guild.sectionHeadings },
  emblemUrl: guild.emblemUrl || '',
  bannerImageUrl: guild.bannerImageUrl || '',
  headquartersName: guild.headquartersName,
  headquartersTitle: guild.headquartersTitle,
  headquartersTitleHtml: guild.headquartersTitleHtml || plainTextToRichHtml(guild.headquartersTitle),
  headquartersDescription: guild.headquartersDescription,
  headquartersDescriptionHtml: guild.headquartersDescriptionHtml || plainTextToRichHtml(guild.headquartersDescription),
  headquartersImageUrl: guild.headquartersImageUrl || '',
  requirements: guild.requirements,
  messageBoardHtml: guild.messageBoardHtml,
  guestbookEnabled: guild.guestbookEnabled,
  roleLabels: { ...guild.roleLabels }
});
