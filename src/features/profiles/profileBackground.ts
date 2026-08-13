export const profileBackgroundModeValues = ['solid', 'gradient'] as const;
export const profileGradientOrientationValues = ['horizontal', 'diagonal', 'vertical'] as const;

export type ProfileBackgroundMode = typeof profileBackgroundModeValues[number];
export type ProfileGradientOrientation = typeof profileGradientOrientationValues[number];

export const defaultProfileBackground = {
  backgroundMode: 'solid',
  gradientColor: '#27302d',
  gradientOrientation: 'diagonal',
  gradientTransitionRate: 100
} as const;

const GRADIENT_ANGLES: Record<ProfileGradientOrientation, string> = {
  horizontal: '90deg',
  diagonal: '135deg',
  vertical: '180deg'
};

export const buildProfileBackground = (
  baseColor: string,
  mode: ProfileBackgroundMode,
  gradientColor: string,
  orientation: ProfileGradientOrientation,
  transitionRate: number
) => {
  if (mode === 'solid') return baseColor;

  const normalizedRate = Math.max(0, Math.min(100, transitionRate));
  const transitionStart = 50 - normalizedRate / 2;
  const transitionEnd = 50 + normalizedRate / 2;

  return `linear-gradient(${GRADIENT_ANGLES[orientation]}, ${baseColor} 0%, ${baseColor} ${transitionStart}%, ${gradientColor} ${transitionEnd}%, ${gradientColor} 100%)`;
};
