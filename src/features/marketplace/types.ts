export type ShopKind = 'crafting' | 'ritual';
export type ShopPageTheme = 'forge' | 'arcane' | 'parchment';
export type ProficiencyRank = 'untrained' | 'trained' | 'expert' | 'master' | 'legendary';

export interface BonusBreakdown {
  level: number;
  proficiency: ProficiencyRank;
  ability: number;
  item: number;
  circumstance: number;
  status: number;
}

export interface ShopFeat {
  name: string;
  discountPercent: number;
  appliesTo: string;
}

export interface RitualOffering {
  name: string;
  tier: number;
  aonUrl: string;
  secondarySkills: string[];
  bypassesSecondaries: boolean;
}

export interface RitualSkill {
  skill: string;
  bonus: BonusBreakdown;
  assurance: boolean;
  degreeBoost: string;
}

export interface ShopContributor {
  name: string;
  discordUserId?: string;
  skills: string[];
  bonus: number;
}

export interface PlayerShop {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerAvatar?: string;
  characterId: string;
  characterName: string;
  characterAvatar?: string;
  discordUserId?: string;
  discordPingsEnabled: boolean;
  kind: ShopKind;
  title: string;
  description: string;
  imageUrl?: string;
  pageTheme: ShopPageTheme;
  pageAccentColor: string;
  pageBackgroundImageUrl?: string;
  pageTagline: string;
  tags: string[];
  specialty?: string;
  tier: number;
  overallDiscountPercent: number;
  feats: ShopFeat[];
  craftingBonus: BonusBreakdown;
  craftingAssurance: boolean;
  craftingDegreeBoost: string;
  ritualSkills: RitualSkill[];
  rituals: RitualOffering[];
  contributors: ShopContributor[];
  acceptsCommissions: boolean;
  updatedAt: string;
}

export type CommissionStatus = 'requested' | 'in_progress' | 'waiting_for_payment' | 'completed' | 'declined' | 'cancelled';
export type CommissionPerspective = 'owner' | 'requester';
export const commissionWorkflow: CommissionStatus[] = ['requested', 'in_progress', 'waiting_for_payment', 'completed'];
export const commissionTransitions: Record<CommissionPerspective, Partial<Record<CommissionStatus, CommissionStatus[]>>> = {
  owner: { requested: ['in_progress', 'declined'], in_progress: ['waiting_for_payment'], waiting_for_payment: ['in_progress'] },
  requester: { requested: ['cancelled'], in_progress: ['cancelled'], waiting_for_payment: ['completed'] }
};
export const canTransitionCommission = (perspective: CommissionPerspective, from: CommissionStatus, to: CommissionStatus) =>
  commissionTransitions[perspective][from]?.includes(to) ?? false;
export interface ShopCommissionEvent {
  id: string;
  source: 'web' | 'discord' | 'system';
  fromStatus?: CommissionStatus;
  toStatus: CommissionStatus;
  note?: string;
  externalActorId?: string;
  actorName?: string;
  createdAt: string;
}
export interface ShopCommission {
  id: string;
  shopId: string;
  shopTitle: string;
  characterName: string;
  requesterName: string;
  itemName: string;
  aonUrl: string;
  itemTier: number;
  quantity: number;
  budget?: string;
  deadline?: string;
  details: string;
  needsSecondaryHelp: boolean;
  status: CommissionStatus;
  createdAt: string;
  updatedAt: string;
  perspective: CommissionPerspective;
  events?: ShopCommissionEvent[];
}

export interface CommissionDraft {
  shopId: string;
  itemName: string;
  aonUrl: string;
  itemTier: number;
  quantity: number;
  budget?: string;
  deadline?: string;
  details: string;
  needsSecondaryHelp: boolean;
}

export interface ShopCharacterOption { id: string; name: string; level: number; avatar?: string; }
export const proficiencyValues: Record<ProficiencyRank, number> = { untrained: 0, trained: 2, expert: 4, master: 6, legendary: 8 };
export const emptyBonus = (level = 0): BonusBreakdown => ({ level, proficiency: 'untrained', ability: 0, item: 0, circumstance: 0, status: 0 });
export const totalBonus = (bonus: BonusBreakdown) => Number(bonus.level || 0) + proficiencyValues[bonus.proficiency] + Number(bonus.ability || 0) + Number(bonus.item || 0) + Number(bonus.circumstance || 0) + Number(bonus.status || 0);
export const assuranceDc = (bonus: BonusBreakdown) => 10 + Number(bonus.level || 0) + proficiencyValues[bonus.proficiency];
