import { z } from 'zod';

export const propKinds = ['paper', 'book', 'key', 'rod', 'chest', 'door', 'crystal'] as const;
export const nodeKinds = ['clue', 'item', 'container', 'room', 'puzzle', 'treasure'] as const;
export const statusSchema = z.enum(['hidden', 'known', 'used']);
export type ClueStatus = z.infer<typeof statusSchema>;
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const nodeSchema = z.object({
  id, title: z.string().trim().min(1).max(120), kind: z.enum(nodeKinds),
  prop: z.enum(propKinds), location: z.string().max(200), text: z.string().max(8000),
  backText: z.string().max(8000), gmNotes: z.string().max(8000),
  reveal: z.enum(['manual', 'automatic']), gate: z.enum(['all', 'any']),
  requires: z.array(z.object({ nodeId: id, state: z.enum(['known', 'used']) })).max(100),
  code: z.string().max(120), keyIds: z.array(id).max(100),
});
export const blueprintSchema = z.object({
  title: z.string().trim().min(1).max(120), description: z.string().max(2000),
  nodes: z.array(nodeSchema).min(1).max(100),
});
export type PuzzleNode = z.infer<typeof nodeSchema>;
export type Blueprint = z.infer<typeof blueprintSchema>;
export const publicNodeSchema = nodeSchema.pick({ id: true, title: true, kind: true, prop: true, location: true, text: true, backText: true }).extend({
  status: statusSchema, needsCode: z.boolean(), needsItems: z.boolean(),
});
export type PublicNode = z.infer<typeof publicNodeSchema>;
export const sessionSchema = z.object({
  id: z.string().uuid(), title: z.string(), description: z.string(), revision: z.number(),
  status: z.enum(['active', 'paused', 'completed']), isGm: z.boolean(),
  nodes: z.array(publicNodeSchema), memberCount: z.number(),
  definition: blueprintSchema.optional(), states: z.record(z.string(), statusSchema).optional(),
  joinCode: z.string().optional(),
  history: z.array(z.object({ action: z.string(), title: z.string(), at: z.string() })),
});
export type PuzzleSession = z.infer<typeof sessionSchema>;
export const librarySchema = z.object({
  blueprints: z.array(z.object({ id: z.string().uuid(), definition: blueprintSchema, revision: z.number() })),
  sessions: z.array(z.object({ id: z.string().uuid(), title: z.string(), status: z.string(), isGm: z.boolean() })),
});
export type Library = z.infer<typeof librarySchema>;
export const isLock = (node: Pick<PuzzleNode, 'kind'>) => ['container', 'room', 'puzzle', 'treasure'].includes(node.kind);

/** Authoring diagnostics only; protected server commands repeat validation. */
export function validateBlueprint(blueprint: Blueprint): string[] {
  const errors: string[] = [];
  const parsed = blueprintSchema.safeParse(blueprint);
  if (!parsed.success) errors.push(...parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`));
  const byId = new Map(blueprint.nodes.map(node => [node.id, node]));
  if (byId.size !== blueprint.nodes.length) errors.push('Every node needs a unique ID.');
  for (const node of blueprint.nodes) {
    for (const ref of [...node.requires.map(r => r.nodeId), ...node.keyIds]) {
      if (!byId.has(ref)) errors.push(`${node.title}: missing reference ${ref}.`);
      if (ref === node.id) errors.push(`${node.title}: cannot depend on itself.`);
    }
    if (new Set(node.requires.map(r => r.nodeId)).size !== node.requires.length) errors.push(`${node.title}: duplicate prerequisite.`);
    if (new Set(node.keyIds).size !== node.keyIds.length) errors.push(`${node.title}: duplicate key.`);
    if (!isLock(node) && (node.code || node.keyIds.length)) errors.push(`${node.title}: only locks can require codes or items.`);
    if (node.keyIds.some(key => byId.get(key)?.kind !== 'item')) errors.push(`${node.title}: required keys must be item nodes.`);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const walk = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visiting.add(nodeId);
    const node = byId.get(nodeId);
    if (node && [...node.requires.map(r => r.nodeId), ...node.keyIds].some(walk)) return true;
    visiting.delete(nodeId); visited.add(nodeId);
    return false;
  };
  if (blueprint.nodes.some(node => walk(node.id))) errors.push('The clue path contains a cycle. Remove a prerequisite or item dependency.');
  if (!blueprint.nodes.some(node => node.kind === 'treasure')) errors.push('Add at least one treasure node to define the ending.');
  return [...new Set(errors)];
}

export function prerequisitesMet(node: PuzzleNode, states: Record<string, ClueStatus>) {
  if (!node.requires.length) return true;
  const checks = node.requires.map(r => r.state === 'used' ? states[r.nodeId] === 'used' : ['known', 'used'].includes(states[r.nodeId]));
  return node.gate === 'all' ? checks.every(Boolean) : checks.some(Boolean);
}

export function newNode(): PuzzleNode {
  return { id: crypto.randomUUID(), title: 'New clue', kind: 'clue', prop: 'paper', location: '', text: '', backText: '', gmNotes: '', reveal: 'manual', gate: 'all', requires: [], code: '', keyIds: [] };
}

/** Stable topological columns for the map, including item-to-lock edges. */
export function graphColumns(nodes: PuzzleNode[]): PuzzleNode[][] {
  const pending = new Set(nodes.map(n => n.id));
  const columns: PuzzleNode[][] = [];
  while (pending.size) {
    const column = nodes.filter(n => pending.has(n.id) && [...n.requires.map(r => r.nodeId), ...n.keyIds].every(ref => !pending.has(ref)));
    if (!column.length) { columns.push(nodes.filter(n => pending.has(n.id))); break; }
    columns.push(column);
    column.forEach(n => pending.delete(n.id));
  }
  return columns;
}
