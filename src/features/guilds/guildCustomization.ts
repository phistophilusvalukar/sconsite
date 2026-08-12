import { z } from 'zod';
import { Guild } from '../../types/database';
import { plainTextToRichHtml } from './richText';

export const guildFontOptions = [
  { value: 'cinzel', label: 'Cinzel', stack: 'Cinzel, Georgia, serif' },
  { value: 'cormorant', label: 'Cormorant', stack: '"Cormorant Garamond", Georgia, serif' },
  { value: 'merriweather', label: 'Merriweather', stack: 'Merriweather, Georgia, serif' },
  { value: 'inter', label: 'Inter', stack: 'Inter, ui-sans-serif, system-ui, sans-serif' }
] as const;

export const guildLayoutOptions = [
  { value: 'chronicle', label: 'Chronicle', description: 'A balanced editorial page.' },
  { value: 'stronghold', label: 'Stronghold', description: 'Headquarters takes center stage.' },
  { value: 'banner', label: 'Banner', description: 'A bold, ceremonial presentation.' }
] as const;

export const defaultGuildRoleLabels = {
  Leader: 'Guildmaster',
  Subleader: 'Subleaders',
  Officer: 'Officers',
  Member: 'Members',
  Ally: 'Allies'
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

export const defaultGuildPalette = {
  baseColor: '#111615',
  fontColor: '#f0ede7',
  accentColor: '#a09482',
  surfaceColor: '#1d2321'
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

export const guildCustomizationSchema = z.object({
  name: z.string().trim().min(2, 'Guild name must be at least 2 characters.').max(80),
  titleHtml: z.string().trim().max(1200),
  titleAnimation: z.enum(['none', 'reveal', 'shimmer', 'drift', 'glow']),
  subtitle: z.string().trim().max(140),
  description: z.string().trim().max(4000),
  descriptionHtml: z.string().trim().max(12000),
  fontFamily: z.enum(['cinzel', 'cormorant', 'merriweather', 'inter']),
  fontColor: hexColor,
  baseColor: hexColor,
  accentColor: hexColor,
  surfaceColor: hexColor,
  layoutStyle: z.enum(['chronicle', 'stronghold', 'banner']),
  rosterDisplay: z.enum(['ledger', 'dossiers', 'cards']),
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
  emblemUrl: externalImageUrl,
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
  fontFamily: guild.fontFamily,
  fontColor: guild.fontColor,
  baseColor: guild.baseColor,
  accentColor: guild.accentColor,
  surfaceColor: guild.surfaceColor,
  layoutStyle: guild.layoutStyle,
  rosterDisplay: guild.rosterDisplay,
  sectionVisibility: { ...guild.sectionVisibility },
  emblemUrl: guild.emblemUrl || '',
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
