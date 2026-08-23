export type ShopKind = 'crafting' | 'ritual';

export interface BonusBreakdown {
  level: number;
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
  discordUserId?: string;
  kind: ShopKind;
  title: string;
  description: string;
  imageUrl?: string;
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

export const emptyBonus = (): BonusBreakdown => ({ level: 0, ability: 0, item: 0, circumstance: 0, status: 0 });
export const totalBonus = (bonus: BonusBreakdown) => Object.values(bonus).reduce((total, value) => total + Number(value || 0), 0);
export const assuranceDc = (bonus: BonusBreakdown) => 10 + Number(bonus.level || 0) + Number(bonus.item || 0) + Number(bonus.circumstance || 0) + Number(bonus.status || 0);

