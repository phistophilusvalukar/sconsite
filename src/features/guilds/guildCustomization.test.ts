import { describe, expect, it } from 'vitest';
import { defaultGuildRoleLabels, getGuildFontStack, guildCustomizationSchema, isSafeExternalImageUrl } from './guildCustomization';
import { plainTextToRichHtml, richTextToPlainText } from './richText';

const validCustomization = {
  name: 'The Argent Cartographers',
  titleHtml: '<strong>The Argent Cartographers</strong>',
  titleAnimation: 'shimmer' as const,
  subtitle: 'Seekers of roads unwritten',
  description: 'An order devoted to exploration.',
  descriptionHtml: '<p>An order devoted to <em>exploration</em>.</p>',
  fontFamily: 'cinzel' as const,
  fontColor: '#f8fafc',
  baseColor: '#171425',
  accentColor: '#d6a84b',
  layoutStyle: 'chronicle' as const,
  rosterDisplay: 'dossiers' as const,
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

  it('maps every stored font choice to a usable font stack', () => {
    expect(getGuildFontStack('cormorant')).toContain('Cormorant Garamond');
    expect(getGuildFontStack('inter')).toContain('Inter');
    expect(getGuildFontStack('grenze')).toContain('Grenze Gotisch');
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

  it('rejects unsupported roster presentations and oversized visitor content', () => {
    expect(guildCustomizationSchema.safeParse({ ...validCustomization, rosterDisplay: 'carousel' }).success).toBe(false);
    expect(guildCustomizationSchema.safeParse({ ...validCustomization, messageBoardHtml: 'x'.repeat(12001) }).success).toBe(false);
  });

  it('only accepts HTTPS image links', () => {
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
