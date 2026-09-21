import { z } from 'zod';

export const CHECKS = ['Acrobatics', 'Arcana', 'Athletics', 'Crafting', 'Deception', 'Diplomacy', 'Intimidation', 'Lore', 'Medicine', 'Nature', 'Occultism', 'Perception', 'Performance', 'Religion', 'Society', 'Stealth', 'Survival', 'Thievery'] as const;
export const actionSchema = z.object({
  id: z.string().min(1), name: z.string().trim().min(3).max(100), kind: z.enum(['main', 'aid']),
  description: z.string().max(2000), skills: z.array(z.enum(CHECKS)).min(1), hours: z.number().int().min(1).max(168),
  adjustment: z.number().int().min(-10).max(10), threshold: z.number().int().min(1).max(10000), reduction: z.number().int().min(1).max(10),
});
export const definitionSchema = z.object({
  title: z.string().trim().min(3).max(120), kind: z.enum(['minor', 'meta']), region: z.string().trim().min(2).max(80),
  requester: z.string().trim().min(2).max(120), location: z.string().max(2000), description: z.string().trim().min(20).max(10000),
  successText: z.string().trim().min(5).max(4000), failureText: z.string().trim().min(5).max(4000),
  durationHours: z.number().int().min(1).max(2160), target: z.number().int().min(1).max(100), minimum: z.number().int().min(1).max(10000),
  actions: z.array(actionSchema).min(1).max(12),
}).refine(d => d.actions.some(a => a.kind === 'main'), 'Include at least one main action.')
  .refine(d => new Set(d.actions.map(a => a.id)).size === d.actions.length, 'Actions must have unique IDs.')
  .refine(d => d.actions.every(a => a.hours <= d.durationHours), 'Actions must fit inside the event duration.');
export const eventSchema = z.object({
  id: z.string(), authorId: z.string(), authorName: z.string(), definition: definitionSchema,
  status: z.enum(['draft', 'submitted', 'returned', 'rejected', 'queued', 'active', 'paused', 'completed', 'cancelled']),
  revision: z.number().int(), createdAt: z.string(), approvedAt: z.string().nullable(), startsAt: z.string().nullable(), endsAt: z.string().nullable(),
  outcome: z.string().nullable(), reviewNote: z.string().default(''),
});
export const characterSchema = z.object({ id: z.string(), name: z.string(), ancestry: z.string(), heritage: z.string(), classPrimary: z.string(), classSecondary: z.string(), level: z.number().int(), status: z.string() });
export const contributionSchema = z.object({
  id: z.string(), eventId: z.string(), characterId: z.string(), playerId: z.string(), playerName: z.string().optional(), characterName: z.string(), level: z.number(),
  actionId: z.string(), kind: z.enum(['main', 'aid']), skill: z.enum(CHECKS), modifier: z.number(), description: z.string(), die: z.number().int().min(1).max(20),
  total: z.number(), baseDc: z.number(), finalDc: z.number().nullable(), success: z.boolean().nullable(),
  startsAt: z.string(), endsAt: z.string(), status: z.enum(['pending', 'completed', 'void']),
});
export const slotSchema = z.object({ id: z.number().int(), kind: z.enum(['minor', 'meta']), eventId: z.string().nullable(), cooldownUntil: z.string().nullable() });
export const applicationSchema = z.object({ id: z.string(), userId: z.string(), username: z.string(), motivation: z.string(), experience: z.string(), availability: z.string(), status: z.enum(['pending', 'approved', 'declined', 'withdrawn']), createdAt: z.string(), note: z.string().default('') });
export const logSchema = z.object({ id: z.string(), actorName: z.string(), action: z.string(), eventId: z.string().nullable(), reason: z.string(), createdAt: z.string() });
export const rewardSchema = z.object({ id: z.string(), eventId: z.string(), authorId: z.string(), code: z.string(), status: z.enum(['issued', 'redeemed', 'revoked']), createdAt: z.string() });
export const snapshotSchema = z.object({
  userId: z.string(), isAdmin: z.boolean(), isStaff: z.boolean(), events: z.array(eventSchema), characters: z.array(characterSchema),
  contributions: z.array(contributionSchema), slots: z.array(slotSchema), applications: z.array(applicationSchema), logs: z.array(logSchema), rewards: z.array(rewardSchema),
  staff: z.array(z.object({ userId: z.string(), username: z.string() })),
  awards: z.array(z.object({ characterId: z.string(), region: z.string(), amount: z.number(), eventId: z.string() })),
});
export type EventDefinition = z.infer<typeof definitionSchema>;
export type EventAction = z.infer<typeof actionSchema>;
export type WestmarchEvent = z.infer<typeof eventSchema>;
export type MiniCharacter = z.infer<typeof characterSchema>;
export type Contribution = z.infer<typeof contributionSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export type Command = { type: string; [key: string]: unknown };
export const blankDefinition = (): EventDefinition => ({ title: '', kind: 'minor', region: '', requester: '', location: '', description: '', successText: '', failureText: '', durationHours: 168, target: 75, minimum: 5, actions: [{ id: crypto.randomUUID(), name: '', kind: 'main', description: '', skills: ['Nature'], hours: 24, adjustment: 0, threshold: 10, reduction: 2 }] });
