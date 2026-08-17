import { describe, expect, it } from 'vitest';
import { defaultGuildRoleLabels, defaultGuildSectionHeadings, getGuildFontStack, guildCustomizationSchema, isSafeExternalImageUrl } from './guildCustomization';
import { plainTextToRichHtml, richTextToPlainText } from './richText';

const validCustomization = {
  name: 'The Argent Cartographers',
  titleHtml: '<strong>The Argent Cartographers</strong>',
  titleAnimation: 'shimmer' as const,
  subtitle: 'Seekers of roads unwritten',
  description: 'An order devoted to exploration.',
  descriptionHtml: '<p>An order devoted to <em>exploration</em>.</p>',
  titleFontFamily: 'cinzel-decorative' as const,
  subtitleFontFamily: 'marcellus' as const,
  fontFamily: 'cinzel' as const,
  titleFontSize: 96,
  subtitleFontSize: 21,
  textFontSize: 16,
  borderTheme: 'knights' as const,
  backgroundTheme: 'metal' as const,
  borderColorSource: 'accent' as const,
  backgroundColorSource: 'base' as const,
  fontColor: '#f8fafc',
  baseColor: '#171425',
  accentColor: '#d6a84b',
  backgroundMode: 'solid' as const,
  gradientColor: '#27302d',
  gradientOrientation: 'diagonal' as const,
  gradientTransitionRate: 100,
  layoutStyle: 'chronicle' as const,
  rosterDisplay: 'dossiers' as const,
  rosterLineup: [],
  sectionVisibility: {
    charter: true,
    requirements: true,
    headquarters: true,
    leader: true,
    roster: true,
    messageBoard: true,
    checkIn: true,
    guestbook: true
  },
  sectionHeadings: { ...defaultGuildSectionHeadings },
  emblemUrl: '',
  bannerImageUrl: '',
  headquartersName: 'The Gilded Compass',
  headquartersTitle: 'Hall of the Far Horizon',
  headquartersTitleHtml: 'Hall of the <em>Far Horizon</em>',
  headquartersDescription: 'A warm hall filled with maps.',
  headquartersDescriptionHtml: '<p>A warm hall filled with maps.</p>',
  headquartersImageUrl: '',
  requirements: 'Bring a map and a story.',
  messageBoardHtml: '<p>Welcome, travelers.</p>',
  guestbookEnabled: true,
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

  it('validates dual-color gradient direction and transition rate', () => {
    expect(guildCustomizationSchema.safeParse({
      ...validCustomization,
      backgroundMode: 'gradient',
      gradientOrientation: 'horizontal',
      gradientTransitionRate: 0
    }).success).toBe(true);
    expect(guildCustomizationSchema.safeParse({ ...validCustomization, gradientColor: 'navy' }).success).toBe(false);
    expect(guildCustomizationSchema.safeParse({ ...validCustomization, gradientTransitionRate: -1 }).success).toBe(false);
  });

  it('validates independent typography size controls', () => {
    expect(guildCustomizationSchema.safeParse({ ...validCustomization, textFontSize: 20 }).success).toBe(true);
    expect(guildCustomizationSchema.safeParse({ ...validCustomization, textFontSize: 27 }).success).toBe(false);
    expect(guildCustomizationSchema.safeParse({ ...validCustomization, titleFontSize: 39 }).success).toBe(false);
  });

  it('validates independent guild border and background motifs', () => {
    expect(guildCustomizationSchema.safeParse({ ...validCustomization, borderTheme: 'flintlocks', backgroundTheme: 'pirates' }).success).toBe(true);
    expect(guildCustomizationSchema.safeParse({ ...validCustomization, backgroundTheme: 'spaceships' }).success).toBe(false);
  });

  it('maps every stored font choice to a usable font stack', () => {
    expect(getGuildFontStack('cormorant')).toContain('Cormorant Garamond');
    expect(getGuildFontStack('inter')).toContain('Inter');
    expect(getGuildFontStack('grenze')).toContain('Grenze Gotisch');
    expect(getGuildFontStack('metal-mania')).toContain('Metal Mania');
    expect(getGuildFontStack('great-vibes')).toContain('Great Vibes');
    expect(getGuildFontStack('mystery-quest')).toContain('Mystery Quest');
  });

  it('requires an explicit visibility choice for every customizable section', () => {
    const result = guildCustomizationSchema.safeParse({
      ...validCustomization,
      sectionVisibility: {
        charter: true,
        requirements: true,
        headquarters: true,
        leader: true,
        roster: true,
        messageBoard: true,
        checkIn: true
      }
    });

    expect(result.success).toBe(false);
  });

  it('validates editable section headings', () => {
    expect(guildCustomizationSchema.safeParse({
      ...validCustomization,
      sectionHeadings: { ...validCustomization.sectionHeadings, rosterTitle: 'The Company Roll' }
    }).success).toBe(true);
    expect(guildCustomizationSchema.safeParse({
      ...validCustomization,
      sectionHeadings: { ...validCustomization.sectionHeadings, rosterTitle: 'x'.repeat(81) }
    }).success).toBe(false);
  });

  it('rejects unsupported roster presentations and oversized visitor content', () => {
    expect(guildCustomizationSchema.safeParse({ ...validCustomization, rosterDisplay: 'carousel' }).success).toBe(false);
    expect(guildCustomizationSchema.safeParse({ ...validCustomization, messageBoardHtml: 'x'.repeat(12001) }).success).toBe(false);
  });

  it('validates a uniquely arranged Class Photo roster', () => {
    const placement = {
      characterId: '11111111-1111-4111-8111-111111111111',
      x: 50,
      y: 0,
      scale: 100,
      rotation: -2
    };
    expect(guildCustomizationSchema.safeParse({
      ...validCustomization,
      rosterDisplay: 'lineup',
      rosterLineup: [placement]
    }).success).toBe(true);
    expect(guildCustomizationSchema.safeParse({
      ...validCustomization,
      rosterDisplay: 'lineup',
      rosterLineup: [placement, placement]
    }).success).toBe(false);
    expect(guildCustomizationSchema.safeParse({
      ...validCustomization,
      rosterDisplay: 'lineup',
      rosterLineup: [{ ...placement, scale: 181 }]
    }).success).toBe(false);
  });

  it('only accepts HTTPS image links', () => {
    expect(guildCustomizationSchema.safeParse({ ...validCustomization, layoutStyle: 'cyberpunk' }).success).toBe(true);
    expect(guildCustomizationSchema.safeParse({ ...validCustomization, layoutStyle: 'nostalgia' }).success).toBe(true);
    expect(guildCustomizationSchema.safeParse({ ...validCustomization, fontFamily: 'press-start-2p' }).success).toBe(true);
    expect(isSafeExternalImageUrl('https://images.example.com/emblem.webp')).toBe(true);
    expect(isSafeExternalImageUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExternalImageUrl('http://images.example.com/emblem.webp')).toBe(false);
    expect(guildCustomizationSchema.safeParse({
      ...validCustomization,
      fontFamily: 'pirata',
      layoutStyle: 'saga',
      bannerImageUrl: 'https://images.example.com/banner.webp'
    }).success).toBe(true);
  });

  it('escapes plain legacy text before turning it into rich HTML', () => {
    const html = plainTextToRichHtml('<script>alert("nope")</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(richTextToPlainText('<strong>Guild</strong> story')).toBe('Guild story');
  });
});
