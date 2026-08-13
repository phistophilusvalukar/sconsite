import type { CSSProperties } from 'react';

export const profileDecorationThemes = [
  { value: 'none', label: 'None', category: 'Simple', description: 'Keep the page clean and unadorned.' },
  { value: 'fire', label: 'Fire', category: 'Elements', description: 'Forged iron filigree, living flame, and ember-cracked stone.' },
  { value: 'ice', label: 'Ice', category: 'Elements', description: 'Glacial crystal clusters, frost feathers, and frozen silver.' },
  { value: 'earth', label: 'Earth', category: 'Elements', description: 'Monumental mountain carving, granite, and mineral-veined stone.' },
  { value: 'water', label: 'Water', category: 'Elements', description: 'Sculpted tides, dark ocean depth, pearls, and sea-silver trim.' },
  { value: 'wood', label: 'Wood', category: 'Elements', description: 'Ancient roots, carved heartwood, oak leaves, and amber sap.' },
  { value: 'metal', label: 'Metal', category: 'Elements', description: 'Layered masterwork plate, rivets, bright bevels, and brasswork.' },
  { value: 'air', label: 'Air', category: 'Elements', description: 'Silver cloud-scrolls, sweeping feathers, and sculpted wind.' },
  { value: 'electricity', label: 'Electricity', category: 'Elements', description: 'Captured lightning, storm crystals, and conductive dark metal.' },
  { value: 'void', label: 'Void', category: 'Elements', description: 'Obsidian eclipses, gravity wells, and impossible cosmic depth.' },
  { value: 'vitality', label: 'Vitality', category: 'Elements', description: 'Radiant seeds, living branches, sunlit crystal, and life energy.' },
  { value: 'alchemy', label: 'Alchemy', category: 'Mystic arts', description: 'Aged brass instruments, luminous reagents, and transmutation craft.' },
  { value: 'knights', label: 'Knights', category: 'Mystic arts', description: 'Chivalric plate, heraldic shields, chainmail, and royal steel.' },
  { value: 'dragons', label: 'Dragons', category: 'Mystic arts', description: 'Ancient dragon sculpture, scales, wings, claws, and molten eyes.' },
  { value: 'pirates', label: 'Pirates', category: 'Mystic arts', description: 'Storm-dark timber, rope, brass compasses, charts, and ironwork.' },
  { value: 'cats', label: 'Cats', category: 'Mystic arts', description: 'Regal felines, moon-silver, luminous eyes, velvet, and graceful tails.' },
  { value: 'skulls', label: 'Skulls', category: 'Mystic arts', description: 'Gothic ossuary bone, anatomist skulls, vertebrae, and black iron.' },
  { value: 'arcane', label: 'Arcane', category: 'Mystic arts', description: 'Spell circles, crystal foci, astrolabes, and luminous mana channels.' },
  { value: 'runes', label: 'Runes', category: 'Mystic arts', description: 'Weathered runestones, carved sigils, braided stone, and iron clamps.' },
  { value: 'axes', label: 'Axes', category: 'Arsenal', description: 'Savage double axes, wrapped hafts, fur, leather, and nicked steel.' },
  { value: 'swords', label: 'Swords', category: 'Arsenal', description: 'Masterwork longswords, ornate guards, blue steel, and royal cloth.' },
  { value: 'flintlocks', label: 'Flintlocks', category: 'Arsenal', description: 'Engraved pistols, walnut stocks, powder gear, smoke, and brass.' },
  { value: 'daggers', label: 'Daggers', category: 'Arsenal', description: 'Mirrored assassin blades, black silver, leather, and poison glass.' }
] as const;

export const profileDecorationThemeValues = profileDecorationThemes.map(theme => theme.value) as [ProfileDecorationTheme, ...ProfileDecorationTheme[]];
export const profileDecorationCategories = ['Simple', 'Elements', 'Mystic arts', 'Arsenal'] as const;

export type ProfileDecorationTheme = typeof profileDecorationThemes[number]['value'];
export type ProfileDecorationColorSource = 'base' | 'accent';

type DecorationDefinition = { background: string; border: string };

const getThemeArtwork = (theme: Exclude<ProfileDecorationTheme, 'none'>) => `url("/assets/profile-decorations/${theme}-v1.webp")`;

const decorations = profileDecorationThemes.reduce<Record<ProfileDecorationTheme, DecorationDefinition>>((result, theme) => {
  result[theme.value] = theme.value === 'none'
    ? { background: 'none', border: 'none' }
    : { background: getThemeArtwork(theme.value), border: getThemeArtwork(theme.value) };
  return result;
}, {} as Record<ProfileDecorationTheme, DecorationDefinition>);

export const defaultProfileDecorations = {
  borderTheme: 'none' as ProfileDecorationTheme,
  backgroundTheme: 'none' as ProfileDecorationTheme,
  borderColorSource: 'accent' as ProfileDecorationColorSource,
  backgroundColorSource: 'base' as ProfileDecorationColorSource
};

export const getProfileDecorationStyle = (
  borderTheme: ProfileDecorationTheme,
  backgroundTheme: ProfileDecorationTheme,
  borderColor: string,
  backgroundColor: string,
  fontColor: string
) => {
  const border = decorations[borderTheme] || decorations.none;
  const background = decorations[backgroundTheme] || decorations.none;
  return {
    '--profile-border-image': border.border,
    '--profile-background-pattern': background.background,
    '--profile-border-decoration-color': borderColor,
    '--profile-background-decoration-color': backgroundColor,
    '--profile-decoration-ink': fontColor
  } as CSSProperties;
};
