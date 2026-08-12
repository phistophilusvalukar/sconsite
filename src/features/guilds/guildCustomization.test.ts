import { describe, expect, it } from 'vitest';
import { defaultGuildRoleLabels, getGuildFontStack, guildCustomizationSchema } from './guildCustomization';

const validCustomization = {
  name: 'The Argent Cartographers',
  subtitle: 'Seekers of roads unwritten',
  description: 'An order devoted to exploration.',
  fontFamily: 'cinzel' as const,
  fontColor: '#f8fafc',
  baseColor: '#171425',
  accentColor: '#d6a84b',
  layoutStyle: 'chronicle' as const,
  emblemUrl: '',
  headquartersName: 'The Gilded Compass',
  headquartersTitle: 'Hall of the Far Horizon',
  headquartersDescription: 'A warm hall filled with maps.',
  headquartersImageUrl: '',
  roleLabels: { ...defaultGuildRoleLabels }
};

describe('guild customization', () => {
  it('accepts a complete guild page configuration', () => {
    expect(guildCustomizationSchema.safeParse(validCustomization).success).toBe(true);
  });

  it('rejects malformed colors and missing roster labels', () => {
    const result = guildCustomizationSchema.safeParse({
      ...validCustomization,
      accentColor: 'gold',
      roleLabels: { ...validCustomization.roleLabels, Officer: '' }
    });

    expect(result.success).toBe(false);
  });

  it('maps every stored font choice to a usable font stack', () => {
    expect(getGuildFontStack('cormorant')).toContain('Cormorant Garamond');
    expect(getGuildFontStack('inter')).toContain('Inter');
  });
});
