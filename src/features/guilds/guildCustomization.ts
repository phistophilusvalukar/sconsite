import { z } from 'zod';
import { Guild } from '../../types/database';

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

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Choose a valid six-digit color.');

export const guildCustomizationSchema = z.object({
  name: z.string().trim().min(2, 'Guild name must be at least 2 characters.').max(80),
  subtitle: z.string().trim().max(140),
  description: z.string().trim().max(4000),
  fontFamily: z.enum(['cinzel', 'cormorant', 'merriweather', 'inter']),
  fontColor: hexColor,
  baseColor: hexColor,
  accentColor: hexColor,
  layoutStyle: z.enum(['chronicle', 'stronghold', 'banner']),
  emblemUrl: z.string().trim().max(2000),
  headquartersName: z.string().trim().max(100),
  headquartersTitle: z.string().trim().max(140),
  headquartersDescription: z.string().trim().max(3000),
  headquartersImageUrl: z.string().trim().max(2000),
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
  subtitle: guild.subtitle,
  description: guild.description,
  fontFamily: guild.fontFamily,
  fontColor: guild.fontColor,
  baseColor: guild.baseColor,
  accentColor: guild.accentColor,
  layoutStyle: guild.layoutStyle,
  emblemUrl: guild.emblemUrl || '',
  headquartersName: guild.headquartersName,
  headquartersTitle: guild.headquartersTitle,
  headquartersDescription: guild.headquartersDescription,
  headquartersImageUrl: guild.headquartersImageUrl || '',
  roleLabels: { ...guild.roleLabels }
});
