import type { GuildMembership } from '../../types/database';
import { describe, expect, it } from 'vitest';
import { createDefaultGuildLineup, isEligibleForGuildLineup } from './guildRosterLineupUtils';

const member = (characterId: string, dynamicPortraitEnabled: boolean, cutoutUrl?: string) => ({
  _id: `membership-${characterId}`,
  characterId,
  character: {
    _id: characterId,
    profileDynamicPortraitEnabled: dynamicPortraitEnabled,
    profilePortraitCutoutImageUrl: cutoutUrl
  }
}) as unknown as GuildMembership;

describe('guild Class Photo arrangement', () => {
  it('only admits guild characters with enabled cutout portraits', () => {
    expect(isEligibleForGuildLineup(member('11111111-1111-4111-8111-111111111111', true, 'https://example.com/top.webp'))).toBe(true);
    expect(isEligibleForGuildLineup(member('22222222-2222-4222-8222-222222222222', false, 'https://example.com/top.webp'))).toBe(false);
    expect(isEligibleForGuildLineup(member('33333333-3333-4333-8333-333333333333', true))).toBe(false);
  });

  it('creates a centered, bounded arrangement without ineligible members', () => {
    const placements = createDefaultGuildLineup([
      member('11111111-1111-4111-8111-111111111111', true, 'https://example.com/one.webp'),
      member('22222222-2222-4222-8222-222222222222', false, 'https://example.com/two.webp'),
      member('33333333-3333-4333-8333-333333333333', true, 'https://example.com/three.webp')
    ]);

    expect(placements.map(placement => placement.characterId)).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '33333333-3333-4333-8333-333333333333'
    ]);
    expect(placements.every(placement => placement.x >= 0 && placement.x <= 100)).toBe(true);
    expect(placements.every(placement => placement.scale >= 50 && placement.scale <= 180)).toBe(true);
    expect(createDefaultGuildLineup([
      member('44444444-4444-4444-8444-444444444444', true, 'https://example.com/solo.webp')
    ])[0]?.x).toBe(50);
  });
});
