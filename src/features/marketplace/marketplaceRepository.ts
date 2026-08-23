import { z } from 'zod';
import { supabase } from '../../config/database';
import type { CommissionDraft, PlayerShop, ShopCharacterOption } from './types';

const shopSchema = z.object({
  id: z.string(), owner_id: z.string(), owner_name: z.string(), owner_avatar: z.string().nullish(),
  discord_user_id: z.string().nullish(), character_id: z.string(), character_name: z.string(), character_avatar: z.string().nullish(), kind: z.enum(['crafting', 'ritual']), title: z.string(),
  description: z.string(), image_url: z.string().nullish(), tags: z.array(z.string()), specialty: z.string().nullish(),
  tier: z.number(), overall_discount_percent: z.number(), feats: z.array(z.unknown()), crafting_bonus: z.record(z.string(), z.unknown()),
  crafting_assurance: z.boolean(), crafting_degree_boost: z.string(), ritual_skills: z.array(z.unknown()),
  rituals: z.array(z.unknown()), contributors: z.array(z.unknown()), accepts_commissions: z.boolean(), updated_at: z.string()
});

function fromRow(value: unknown): PlayerShop {
  const row = shopSchema.parse(value);
  return {
    id: row.id, ownerId: row.owner_id, ownerName: row.owner_name, ownerAvatar: row.owner_avatar ?? undefined,
    discordUserId: row.discord_user_id ?? undefined, characterId: row.character_id, characterName: row.character_name, characterAvatar: row.character_avatar ?? undefined, kind: row.kind, title: row.title, description: row.description,
    imageUrl: row.image_url ?? undefined, tags: row.tags, specialty: row.specialty ?? undefined, tier: row.tier,
    overallDiscountPercent: row.overall_discount_percent, feats: row.feats as PlayerShop['feats'],
    craftingBonus: row.crafting_bonus as unknown as PlayerShop['craftingBonus'], craftingAssurance: row.crafting_assurance,
    craftingDegreeBoost: row.crafting_degree_boost, ritualSkills: row.ritual_skills as PlayerShop['ritualSkills'],
    rituals: row.rituals as PlayerShop['rituals'], contributors: row.contributors as PlayerShop['contributors'],
    acceptsCommissions: row.accepts_commissions, updatedAt: row.updated_at
  };
}

export async function listShops(): Promise<PlayerShop[]> {
  const { data, error } = await supabase.rpc('get_marketplace_shops');
  if (error) throw error;
  return z.array(z.unknown()).parse(data ?? []).map(fromRow);
}

export async function listMyShopCharacters(): Promise<ShopCharacterOption[]> {
  const { data, error } = await supabase.rpc('get_my_shop_characters');
  if (error) throw error;
  return z.array(z.object({ id: z.string(), name: z.string(), level: z.number(), avatar: z.string().nullish() })).parse(data ?? []).map(row => ({ ...row, avatar: row.avatar ?? undefined }));
}

export async function saveShop(shop: Omit<PlayerShop, 'id' | 'ownerId' | 'ownerName' | 'ownerAvatar' | 'characterName' | 'characterAvatar' | 'updatedAt'> & { id?: string }): Promise<string> {
  const { data, error } = await supabase.rpc('upsert_player_shop_command', { p_shop: shop });
  if (error) throw error;
  return z.string().parse(data);
}

export async function submitCommission(draft: CommissionDraft): Promise<string> {
  const { data, error } = await supabase.functions.invoke('marketplace-commission', { body: draft });
  if (error) throw error;
  return z.object({ commissionId: z.string() }).parse(data).commissionId;
}
