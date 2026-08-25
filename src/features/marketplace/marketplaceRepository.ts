import { z } from 'zod';
import { supabase } from '../../config/database';
import type { CommissionDraft, CommissionStatus, PlayerShop, ShopCharacterOption, ShopCommission, ShopCommissionEvent } from './types';

const shopSchema = z.object({
  id: z.string(), owner_id: z.string(), owner_name: z.string(), owner_avatar: z.string().nullish(),
  discord_user_id: z.string().nullish(), discord_pings_enabled: z.boolean().optional().default(false), character_id: z.string(), character_name: z.string(), character_avatar: z.string().nullish(), kind: z.enum(['crafting', 'ritual']), title: z.string(),
  description: z.string(), image_url: z.string().nullish(), page_theme: z.enum(['forge', 'arcane', 'parchment']).optional().default('forge'),
  page_accent_color: z.string().optional().default('#d1cabf'), page_background_image_url: z.string().nullish(), page_tagline: z.string().optional().default(''),
  tags: z.array(z.string()), specialty: z.string().nullish(),
  tier: z.number(), overall_discount_percent: z.number(), feats: z.array(z.unknown()), crafting_bonus: z.record(z.string(), z.unknown()),
  crafting_assurance: z.boolean(), crafting_degree_boost: z.string(), ritual_skills: z.array(z.unknown()),
  rituals: z.array(z.unknown()), contributors: z.array(z.unknown()), accepts_commissions: z.boolean(), updated_at: z.string()
});

function fromRow(value: unknown): PlayerShop {
  const row = shopSchema.parse(value);
  return {
    id: row.id, ownerId: row.owner_id, ownerName: row.owner_name, ownerAvatar: row.owner_avatar ?? undefined,
    discordUserId: row.discord_user_id ?? undefined, discordPingsEnabled: row.discord_pings_enabled, characterId: row.character_id, characterName: row.character_name, characterAvatar: row.character_avatar ?? undefined, kind: row.kind, title: row.title, description: row.description,
    imageUrl: row.image_url ?? undefined, pageTheme: row.page_theme, pageAccentColor: row.page_accent_color,
    pageBackgroundImageUrl: row.page_background_image_url ?? undefined, pageTagline: row.page_tagline,
    tags: row.tags, specialty: row.specialty ?? undefined, tier: row.tier,
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
  if (error) throw new Error(error.message);
  try {
    return z.array(z.object({ id: z.string(), name: z.string(), level: z.number(), avatar: z.string().nullish() })).parse(data ?? []).map(row => ({ ...row, avatar: row.avatar ?? undefined }));
  } catch (error) {
    throw new Error(`Character data returned by the server was invalid: ${error instanceof Error ? error.message : 'unknown response'}`);
  }
}

export async function saveShop(shop: Omit<PlayerShop, 'id' | 'ownerId' | 'ownerName' | 'ownerAvatar' | 'characterName' | 'characterAvatar' | 'updatedAt'> & { id?: string }): Promise<string> {
  const { data, error } = await supabase.rpc('upsert_player_shop_v2_command', { p_shop: shop });
  if (error) throw error;
  return z.string().parse(data);
}

export async function submitCommission(draft: CommissionDraft): Promise<string> {
  const { data, error } = await supabase.rpc('create_shop_commission_command', { p_commission: draft });
  if (error) throw new Error(error.message);
  return z.object({ commissionId: z.string() }).parse(data).commissionId;
}

const commissionSchema = z.object({
  id: z.string(), shop_id: z.string(), shop_title: z.string(), character_name: z.string(), requester_name: z.string(),
  item_name: z.string(), aon_url: z.string(), item_tier: z.number(), quantity: z.number(), budget: z.string().nullish(),
  deadline: z.string().nullish(), details: z.string(), needs_secondary_help: z.boolean(),
  status: z.enum(['requested', 'in_progress', 'waiting_for_payment', 'completed', 'declined', 'cancelled']), created_at: z.string(), updated_at: z.string(),
  perspective: z.enum(['owner', 'requester']), events: z.array(z.object({
    id: z.string(), source: z.enum(['web', 'discord', 'system']), from_status: z.enum(['requested', 'in_progress', 'waiting_for_payment', 'completed', 'declined', 'cancelled']).nullish(),
    to_status: z.enum(['requested', 'in_progress', 'waiting_for_payment', 'completed', 'declined', 'cancelled']), note: z.string().nullish(),
    external_actor_id: z.string().nullish(), actor_name: z.string().nullish(), created_at: z.string()
  })).optional()
});

const fromCommissionRow = (row: z.infer<typeof commissionSchema>): ShopCommission => ({
  id: row.id, shopId: row.shop_id, shopTitle: row.shop_title, characterName: row.character_name,
  requesterName: row.requester_name, itemName: row.item_name, aonUrl: row.aon_url, itemTier: row.item_tier,
  quantity: row.quantity, budget: row.budget ?? undefined, deadline: row.deadline ?? undefined,
  details: row.details, needsSecondaryHelp: row.needs_secondary_help, status: row.status,
  createdAt: row.created_at, updatedAt: row.updated_at, perspective: row.perspective,
  events: row.events?.map((event): ShopCommissionEvent => ({
    id: event.id, source: event.source, fromStatus: event.from_status ?? undefined, toStatus: event.to_status,
    note: event.note ?? undefined, externalActorId: event.external_actor_id ?? undefined,
    actorName: event.actor_name ?? undefined, createdAt: event.created_at
  }))
});

export async function listMyCommissions(): Promise<ShopCommission[]> {
  const { data, error } = await supabase.rpc('get_my_shop_commissions');
  if (error) throw new Error(error.message);
  return z.array(commissionSchema).parse(data ?? []).map(fromCommissionRow);
}

export async function listShopCommissionLog(shopId: string): Promise<ShopCommission[]> {
  const { data, error } = await supabase.rpc('get_shop_commission_log', { p_shop_id: shopId });
  if (error) throw new Error(error.message);
  return z.array(commissionSchema).parse(data ?? []).map(fromCommissionRow);
}

export async function updateCommissionStatus(commissionId: string, status: CommissionStatus, note?: string): Promise<void> {
  const { error } = await supabase.rpc('update_shop_commission_status_v2_command', {
    p_commission_id: commissionId, p_status: status, p_note: note || null, p_source: 'web', p_external_actor_id: null, p_actor_role: null
  });
  if (error) throw new Error(error.message);
}
