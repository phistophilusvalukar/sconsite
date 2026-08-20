import { z } from 'zod';
import { supabase } from '../config/database';

const dbAdminUserSchema = z.object({
  userId: z.string().min(1),
  username: z.string(),
  email: z.string(),
  avatar: z.string(),
  isAdmin: z.boolean(),
  isLoremaster: z.boolean(),
  isBanned: z.boolean(),
  bannedAt: z.string().nullable()
}).strict();

const dbAdminCharacterSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  className: z.string(),
  level: z.number().int(),
  status: z.enum(['active', 'retired', 'dead']),
  ownerId: z.string(),
  ownerName: z.string()
}).strict();

const dbAdminGuildSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  leaderId: z.string(),
  leaderName: z.string(),
  memberCount: z.number().int()
}).strict();

const dbAdminLoreEntrySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  status: z.enum(['draft', 'published']),
  authorName: z.string()
}).strict();

const dbAdminSnapshotSchema = z.object({
  users: z.array(dbAdminUserSchema),
  characters: z.array(dbAdminCharacterSchema),
  guilds: z.array(dbAdminGuildSchema),
  loreEntries: z.array(dbAdminLoreEntrySchema)
}).strict();

export type DbAdminUser = z.infer<typeof dbAdminUserSchema>;
export type DbAdminCharacter = z.infer<typeof dbAdminCharacterSchema>;
export type DbAdminGuild = z.infer<typeof dbAdminGuildSchema>;
export type DbAdminLoreEntry = z.infer<typeof dbAdminLoreEntrySchema>;
export type DbAdminSnapshot = z.infer<typeof dbAdminSnapshotSchema>;
export type DbAdminDeletableEntity = 'character' | 'guild' | 'lore';

export async function verifyDbAdminPassword(password: string): Promise<void> {
  const { data, error } = await supabase.rpc('verify_db_admin_password_command', {
    p_password: password
  });
  if (error) throw new Error(error.message);
  if (data !== true) throw new Error('Invalid database admin password.');
}

export async function getDbAdminSnapshot(password: string): Promise<DbAdminSnapshot> {
  const { data, error } = await supabase.rpc('get_db_admin_snapshot_command', {
    p_password: password
  });
  if (error) throw new Error(error.message);

  const parsed = dbAdminSnapshotSchema.safeParse(data);
  if (!parsed.success) {
    console.error('Invalid database admin snapshot:', parsed.error);
    throw new Error('The database returned an invalid administration snapshot.');
  }
  return parsed.data;
}

export async function setDbAdminUserRoles(
  password: string,
  userId: string,
  roles: Pick<DbAdminUser, 'isAdmin' | 'isLoremaster'>
): Promise<void> {
  const { error } = await supabase.rpc('set_db_admin_user_roles_command', {
    p_password: password,
    p_user_id: userId,
    p_is_admin: roles.isAdmin,
    p_is_loremaster: roles.isLoremaster
  });
  if (error) throw new Error(error.message);
}

export async function setDbAdminUserBan(password: string, userId: string, isBanned: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_db_admin_user_ban_command', {
    p_password: password,
    p_user_id: userId,
    p_is_banned: isBanned
  });
  if (error) throw new Error(error.message);
}

export async function setDbAdminCharacterStatus(
  password: string,
  characterId: string,
  status: DbAdminCharacter['status']
): Promise<void> {
  const { error } = await supabase.rpc('set_db_admin_character_status_command', {
    p_password: password,
    p_character_id: characterId,
    p_status: status
  });
  if (error) throw new Error(error.message);
}

export async function deleteDbAdminContent(
  password: string,
  entityType: DbAdminDeletableEntity,
  entityId: string
): Promise<void> {
  const { error } = await supabase.rpc('delete_db_admin_content_command', {
    p_password: password,
    p_entity_type: entityType,
    p_entity_id: entityId
  });
  if (error) throw new Error(error.message);
}
