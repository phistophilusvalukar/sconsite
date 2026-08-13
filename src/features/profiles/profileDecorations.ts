import type { CSSProperties } from 'react';

export const profileDecorationThemes = [
  { value: 'none', label: 'None', category: 'Simple', description: 'Keep the page clean and unadorned.' },
  { value: 'fire', label: 'Fire', category: 'Elements', description: 'Rising flame tongues and ember-cut edges.' },
  { value: 'ice', label: 'Ice', category: 'Elements', description: 'Crystalline facets and frost-sharp lines.' },
  { value: 'earth', label: 'Earth', category: 'Elements', description: 'Layered stone, strata, and heavy geometry.' },
  { value: 'water', label: 'Water', category: 'Elements', description: 'Overlapping ripples and flowing bands.' },
  { value: 'wood', label: 'Wood', category: 'Elements', description: 'Growth rings, grain, and carved trim.' },
  { value: 'metal', label: 'Metal', category: 'Elements', description: 'Brushed plate and riveted precision.' },
  { value: 'air', label: 'Air', category: 'Elements', description: 'Soft currents and sweeping wisps.' },
  { value: 'electricity', label: 'Electricity', category: 'Elements', description: 'Jagged charge lines and pulsing breaks.' },
  { value: 'void', label: 'Void', category: 'Elements', description: 'A deep field of eclipses and fading rings.' },
  { value: 'vitality', label: 'Vitality', category: 'Elements', description: 'Radiant cells and life-giving pulses.' },
  { value: 'alchemy', label: 'Alchemy', category: 'Mystic arts', description: 'Transmutation circles and measured grids.' },
  { value: 'knights', label: 'Knights', category: 'Mystic arts', description: 'Heraldic checks and armored bands.' },
  { value: 'dragons', label: 'Dragons', category: 'Mystic arts', description: 'Overlapping scales and gilded ridges.' },
  { value: 'pirates', label: 'Pirates', category: 'Mystic arts', description: 'Rope lines, weathered marks, and compass cuts.' },
  { value: 'cats', label: 'Cats', category: 'Mystic arts', description: 'Playful paw-like constellations and soft curves.' },
  { value: 'skulls', label: 'Skulls', category: 'Mystic arts', description: 'Hollow eyes and bone-notched framing.' },
  { value: 'arcane', label: 'Arcane', category: 'Mystic arts', description: 'Concentric spellwork and orbiting marks.' },
  { value: 'runes', label: 'Runes', category: 'Mystic arts', description: 'Repeated sigils and inscribed stone lines.' },
  { value: 'axes', label: 'Axes', category: 'Arsenal', description: 'Broad mirrored wedges and chopping rhythm.' },
  { value: 'swords', label: 'Swords', category: 'Arsenal', description: 'Crossed diagonal blades and bright edges.' },
  { value: 'flintlocks', label: 'Flintlocks', category: 'Arsenal', description: 'Powder sparks, brass studs, and smoke trails.' },
  { value: 'daggers', label: 'Daggers', category: 'Arsenal', description: 'Narrow points and repeating triangular cuts.' }
] as const;

export const profileDecorationThemeValues = profileDecorationThemes.map(theme => theme.value) as [ProfileDecorationTheme, ...ProfileDecorationTheme[]];
export const profileDecorationCategories = ['Simple', 'Elements', 'Mystic arts', 'Arsenal'] as const;

export type ProfileDecorationTheme = typeof profileDecorationThemes[number]['value'];
export type ProfileDecorationColorSource = 'base' | 'accent';

type DecorationDefinition = { background: string; border: string };

const c = 'var(--profile-background-decoration-color)';
const b = 'var(--profile-border-decoration-color)';
const ink = 'var(--profile-decoration-ink)';

const decorations: Record<ProfileDecorationTheme, DecorationDefinition> = {
  none: { background: 'none', border: 'linear-gradient(90deg, transparent, transparent)' },
  fire: {
    background: `radial-gradient(ellipse at 12% 110%, color-mix(in srgb, ${c} 58%, transparent) 0 9%, transparent 28%), radial-gradient(ellipse at 42% 112%, color-mix(in srgb, ${c} 38%, transparent) 0 12%, transparent 31%), radial-gradient(ellipse at 78% 108%, color-mix(in srgb, ${c} 48%, transparent) 0 10%, transparent 30%)`,
    border: `repeating-linear-gradient(55deg, ${b} 0 9px, color-mix(in srgb, ${b} 28%, ${ink}) 9px 13px, transparent 13px 18px)`
  },
  ice: {
    background: `conic-gradient(from 30deg at 18% 22%, transparent 0 12%, color-mix(in srgb, ${c} 28%, transparent) 12% 15%, transparent 15% 25%), conic-gradient(from 210deg at 82% 70%, transparent 0 10%, color-mix(in srgb, ${c} 24%, transparent) 10% 14%, transparent 14% 25%)`,
    border: `repeating-linear-gradient(135deg, color-mix(in srgb, ${b} 68%, ${ink}) 0 6px, ${b} 6px 14px, transparent 14px 18px)`
  },
  earth: {
    background: `repeating-linear-gradient(4deg, transparent 0 28px, color-mix(in srgb, ${c} 19%, transparent) 29px 32px, transparent 33px 52px), radial-gradient(circle at 20% 40%, color-mix(in srgb, ${c} 18%, transparent) 0 3px, transparent 4px)`,
    border: `repeating-linear-gradient(90deg, ${b} 0 22px, color-mix(in srgb, ${b} 54%, ${ink}) 22px 24px, ${b} 24px 39px)`
  },
  water: {
    background: `repeating-radial-gradient(ellipse at 10% 10%, transparent 0 24px, color-mix(in srgb, ${c} 22%, transparent) 25px 28px, transparent 29px 48px)`,
    border: `repeating-linear-gradient(110deg, ${b} 0 12px, color-mix(in srgb, ${b} 35%, transparent) 12px 19px, color-mix(in srgb, ${b} 62%, ${ink}) 19px 22px)`
  },
  wood: {
    background: `repeating-radial-gradient(ellipse at 18% 48%, transparent 0 18px, color-mix(in srgb, ${c} 18%, transparent) 19px 21px, transparent 22px 36px), repeating-linear-gradient(88deg, transparent 0 70px, color-mix(in srgb, ${c} 12%, transparent) 71px 73px)`,
    border: `repeating-linear-gradient(92deg, color-mix(in srgb, ${b} 72%, black) 0 18px, ${b} 18px 23px, color-mix(in srgb, ${b} 48%, ${ink}) 23px 25px)`
  },
  metal: {
    background: `repeating-linear-gradient(92deg, transparent 0 6px, color-mix(in srgb, ${c} 12%, transparent) 7px 8px, transparent 9px 15px), linear-gradient(115deg, transparent 20%, color-mix(in srgb, ${c} 18%, transparent) 38%, transparent 58%)`,
    border: `repeating-linear-gradient(90deg, color-mix(in srgb, ${b} 42%, ${ink}) 0 4px, ${b} 4px 20px, color-mix(in srgb, ${b} 18%, black) 20px 24px)`
  },
  air: {
    background: `radial-gradient(ellipse at 10% 18%, transparent 0 24%, color-mix(in srgb, ${c} 15%, transparent) 25% 27%, transparent 28%), radial-gradient(ellipse at 82% 62%, transparent 0 22%, color-mix(in srgb, ${c} 17%, transparent) 23% 25%, transparent 26%)`,
    border: `repeating-linear-gradient(115deg, transparent 0 9px, color-mix(in srgb, ${b} 58%, ${ink}) 9px 12px, ${b} 12px 19px)`
  },
  electricity: {
    background: `repeating-linear-gradient(125deg, transparent 0 38px, color-mix(in srgb, ${c} 25%, transparent) 39px 42px, transparent 43px 77px), repeating-linear-gradient(55deg, transparent 0 74px, color-mix(in srgb, ${c} 12%, transparent) 75px 77px)`,
    border: `repeating-linear-gradient(125deg, ${b} 0 8px, transparent 8px 12px, color-mix(in srgb, ${b} 62%, ${ink}) 12px 16px, ${b} 16px 25px)`
  },
  void: {
    background: `radial-gradient(circle at 18% 26%, transparent 0 7%, color-mix(in srgb, ${c} 26%, transparent) 8% 9%, transparent 10% 20%), radial-gradient(circle at 76% 68%, transparent 0 10%, color-mix(in srgb, ${c} 20%, transparent) 11% 12%, transparent 13% 25%)`,
    border: `repeating-radial-gradient(circle, color-mix(in srgb, ${b} 32%, black) 0 5px, ${b} 6px 11px, color-mix(in srgb, ${b} 42%, ${ink}) 12px 14px)`
  },
  vitality: {
    background: `radial-gradient(circle at 14% 20%, color-mix(in srgb, ${c} 24%, transparent) 0 4px, transparent 5px 30px), radial-gradient(circle at 68% 70%, color-mix(in srgb, ${c} 21%, transparent) 0 7px, transparent 8px 38px), radial-gradient(circle at 90% 12%, color-mix(in srgb, ${c} 16%, transparent) 0 3px, transparent 4px 24px)`,
    border: `repeating-radial-gradient(circle, color-mix(in srgb, ${b} 52%, ${ink}) 0 3px, ${b} 4px 10px, transparent 11px 14px)`
  },
  alchemy: {
    background: `repeating-radial-gradient(circle at 22% 28%, transparent 0 24px, color-mix(in srgb, ${c} 19%, transparent) 25px 27px, transparent 28px 48px), linear-gradient(30deg, transparent 49%, color-mix(in srgb, ${c} 13%, transparent) 50% 51%, transparent 52%)`,
    border: `repeating-conic-gradient(from 45deg, ${b} 0 8deg, transparent 8deg 17deg, color-mix(in srgb, ${b} 56%, ${ink}) 17deg 22deg)`
  },
  knights: {
    background: `conic-gradient(from 90deg, color-mix(in srgb, ${c} 13%, transparent) 25%, transparent 0 50%, color-mix(in srgb, ${c} 13%, transparent) 0 75%, transparent 0) 0 0 / 72px 72px`,
    border: `repeating-linear-gradient(90deg, color-mix(in srgb, ${b} 68%, ${ink}) 0 5px, ${b} 5px 28px, color-mix(in srgb, ${b} 30%, black) 28px 33px)`
  },
  dragons: {
    background: `radial-gradient(ellipse at 50% 0, color-mix(in srgb, ${c} 19%, transparent) 0 27%, transparent 28%) 0 0 / 64px 42px, radial-gradient(ellipse at 0 100%, color-mix(in srgb, ${c} 12%, transparent) 0 26%, transparent 27%) 0 0 / 64px 42px`,
    border: `repeating-radial-gradient(ellipse at 50% 100%, ${b} 0 8px, color-mix(in srgb, ${b} 50%, ${ink}) 9px 11px, transparent 12px 18px)`
  },
  pirates: {
    background: `repeating-linear-gradient(42deg, transparent 0 46px, color-mix(in srgb, ${c} 17%, transparent) 47px 50px, transparent 51px 92px), radial-gradient(circle, color-mix(in srgb, ${c} 17%, transparent) 0 3px, transparent 4px) 0 0 / 58px 58px`,
    border: `repeating-linear-gradient(45deg, color-mix(in srgb, ${b} 55%, black) 0 7px, ${b} 7px 15px, color-mix(in srgb, ${b} 58%, ${ink}) 15px 18px)`
  },
  cats: {
    background: `radial-gradient(circle, color-mix(in srgb, ${c} 20%, transparent) 0 5px, transparent 6px), radial-gradient(ellipse, color-mix(in srgb, ${c} 13%, transparent) 0 7px, transparent 8px) 12px 13px / 52px 52px`,
    border: `repeating-radial-gradient(circle, ${b} 0 5px, transparent 6px 11px, color-mix(in srgb, ${b} 52%, ${ink}) 12px 14px)`
  },
  skulls: {
    background: `radial-gradient(circle at 42% 42%, color-mix(in srgb, ${c} 22%, transparent) 0 4px, transparent 5px), radial-gradient(circle at 58% 42%, color-mix(in srgb, ${c} 22%, transparent) 0 4px, transparent 5px), radial-gradient(ellipse at 50% 55%, color-mix(in srgb, ${c} 10%, transparent) 0 18px, transparent 19px) 0 0 / 76px 70px`,
    border: `repeating-linear-gradient(135deg, color-mix(in srgb, ${b} 60%, ${ink}) 0 6px, ${b} 6px 15px, transparent 15px 20px)`
  },
  arcane: {
    background: `repeating-radial-gradient(circle at 18% 20%, transparent 0 21px, color-mix(in srgb, ${c} 20%, transparent) 22px 24px, transparent 25px 43px), conic-gradient(from 22deg at 78% 68%, transparent 0 11%, color-mix(in srgb, ${c} 16%, transparent) 12% 13%, transparent 14% 25%)`,
    border: `repeating-conic-gradient(from 0deg, ${b} 0 6deg, transparent 6deg 12deg, color-mix(in srgb, ${b} 56%, ${ink}) 12deg 16deg)`
  },
  runes: {
    background: `repeating-linear-gradient(90deg, transparent 0 40px, color-mix(in srgb, ${c} 15%, transparent) 41px 43px, transparent 44px 78px), repeating-linear-gradient(35deg, transparent 0 66px, color-mix(in srgb, ${c} 11%, transparent) 67px 69px)`,
    border: `repeating-linear-gradient(90deg, ${b} 0 8px, transparent 8px 12px, color-mix(in srgb, ${b} 62%, ${ink}) 12px 17px, transparent 17px 22px)`
  },
  axes: {
    background: `repeating-conic-gradient(from 45deg at 18% 22%, transparent 0 20deg, color-mix(in srgb, ${c} 17%, transparent) 21deg 35deg, transparent 36deg 90deg) 0 0 / 96px 96px`,
    border: `repeating-conic-gradient(from 45deg, ${b} 0 14deg, color-mix(in srgb, ${b} 58%, ${ink}) 14deg 24deg, transparent 24deg 34deg)`
  },
  swords: {
    background: `repeating-linear-gradient(45deg, transparent 0 54px, color-mix(in srgb, ${c} 20%, transparent) 55px 58px, transparent 59px 108px), repeating-linear-gradient(135deg, transparent 0 82px, color-mix(in srgb, ${c} 10%, transparent) 83px 85px)`,
    border: `repeating-linear-gradient(45deg, color-mix(in srgb, ${b} 68%, ${ink}) 0 4px, ${b} 4px 16px, transparent 16px 20px)`
  },
  flintlocks: {
    background: `radial-gradient(circle, color-mix(in srgb, ${c} 20%, transparent) 0 3px, transparent 4px) 0 0 / 48px 48px, repeating-linear-gradient(18deg, transparent 0 73px, color-mix(in srgb, ${c} 11%, transparent) 74px 77px)`,
    border: `repeating-radial-gradient(circle, color-mix(in srgb, ${b} 68%, ${ink}) 0 3px, ${b} 4px 9px, color-mix(in srgb, ${b} 35%, black) 10px 13px)`
  },
  daggers: {
    background: `repeating-conic-gradient(from 0deg at 16% 18%, transparent 0 35deg, color-mix(in srgb, ${c} 17%, transparent) 36deg 44deg, transparent 45deg 90deg) 0 0 / 82px 82px`,
    border: `repeating-linear-gradient(120deg, transparent 0 5px, color-mix(in srgb, ${b} 62%, ${ink}) 5px 9px, ${b} 9px 18px, transparent 18px 23px)`
  }
};

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
