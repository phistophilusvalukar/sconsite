import type { GuildMembership, GuildRosterLineupPlacement } from '../../types/database';

export const guildLineupCharacterId = (member: GuildMembership) => member.characterId || member.character?._id || '';

export const isEligibleForGuildLineup = (member: GuildMembership) => Boolean(
  guildLineupCharacterId(member)
  && member.character?.profileDynamicPortraitEnabled
  && member.character.profilePortraitCutoutImageUrl
);

export const createDefaultGuildLineup = (members: GuildMembership[]): GuildRosterLineupPlacement[] => {
  const eligible = members.filter(isEligibleForGuildLineup).slice(0, 30);
  const lastIndex = Math.max(eligible.length - 1, 1);
  return eligible.map((member, index) => {
    const centerDistance = Math.abs(index - (eligible.length - 1) / 2) / Math.max(eligible.length / 2, 1);
    return {
      characterId: guildLineupCharacterId(member),
      x: eligible.length === 1 ? 50 : Math.round(10 + (index / lastIndex) * 80),
      y: index % 2 === 0 ? 1 : 4,
      scale: Math.round(112 - centerDistance * 14),
      rotation: Math.max(-6, Math.min(6, Math.round((index - (eligible.length - 1) / 2) * 1.4)))
    };
  });
};
