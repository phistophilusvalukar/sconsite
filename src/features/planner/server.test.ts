import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import migration from '../../../supabase/migrations/20260921000200_shared_planner.sql?raw';
import { occursOn, snapshotSchema, type Task } from './model';
const db = new PGlite();
const owner = '11111111-1111-4111-8111-111111111111';
const member = '22222222-2222-4222-8222-222222222222';
const outsider = '33333333-3333-4333-8333-333333333333';
async function asUser(id: string) { await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]); }
async function snapshot() { return snapshotSchema.parse((await db.query<{ s: unknown }>('SELECT planner_snapshot() s')).rows[0].s); }
async function command(payload: unknown, request = crypto.randomUUID()) { return snapshotSchema.parse((await db.query<{ s: unknown }>('SELECT planner_command($1,$2) s', [request, JSON.stringify(payload)])).rows[0].s); }
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,raw_user_meta_data jsonb DEFAULT '{}');
    INSERT INTO auth.users(id) VALUES('${owner}'),('${member}'),('${outsider}');
    GRANT USAGE ON SCHEMA auth TO authenticated;`);
  await db.exec(migration);
}, 30000);
beforeEach(async () => { await db.exec('RESET ROLE; TRUNCATE planner_spaces,planner_requests CASCADE; SET ROLE authenticated;'); await asUser(owner); });
afterAll(async () => { await db.close(); });
describe('protected planner database', () => {
  it('blocks anonymous access and direct table access; private spaces are invisible to others', async () => {
    const s = await command({ type: 'create_space', name: 'Private', shared: false });
    expect(s.spaces[0].invite_code).toBeNull();
    await expect(db.query('SELECT * FROM planner_spaces')).rejects.toThrow('permission denied');
    await expect(db.query("INSERT INTO planner_spaces(name,owner_id) VALUES('Bypass',$1)", [owner])).rejects.toThrow('permission denied');
    await asUser(outsider); expect((await snapshot()).spaces).toHaveLength(0);
    await expect(command({ type: 'create_list', spaceId: s.spaces[0].id, title: 'Intrusion' })).rejects.toThrow('Space unavailable');
    await asUser(''); await expect(snapshot()).rejects.toThrow('Sign in');
    await expect(command({ type: 'create_space', name: 'No', shared: true })).rejects.toThrow('Sign in');
  });
  it('shares lists, protects invite administration, revokes access, and invalidates old codes', async () => {
    let s = await command({ type: 'create_space', name: 'Together', shared: true }); const space = s.spaces[0];
    s = await command({ type: 'create_list', spaceId: space.id, title: 'Groceries' }); const list = s.lists[0];
    await asUser(member); s = await command({ type: 'join', code: space.invite_code });
    expect(s.spaces[0].invite_code).toBeNull();
    s = await command({ type: 'add_item', spaceId: space.id, listId: list.id, title: 'Milk' });
    s = await command({ type: 'check_item', spaceId: space.id, id: s.items[0].id, done: true });
    expect(s.items[0].done).toBe(true);
    await expect(command({ type: 'delete_space', spaceId: space.id })).rejects.toThrow('Only the owner');
    await expect(command({ type: 'rotate_invite', spaceId: space.id })).rejects.toThrow('Only the shared space owner');
    await asUser(owner); expect((await snapshot()).items[0].done).toBe(true);
    await command({ type: 'rotate_invite', spaceId: space.id });
    await command({ type: 'remove_member', spaceId: space.id, userId: member });
    await asUser(member); expect((await snapshot()).spaces).toHaveLength(0);
    await expect(command({ type: 'join', code: space.invite_code })).rejects.toThrow('invalid');
    await expect(command({ type: 'check_item', spaceId: space.id, id: s.items[0].id, done: false })).rejects.toThrow('Space unavailable');
  });
  it('keeps completions independent, validates dates, preserves history and deduplicates requests', async () => {
    const create = { type: 'create_space', name: 'Home', shared: false }; const request = crypto.randomUUID();
    let s = await command(create, request); const spaceId = s.spaces[0].id;
    expect((await command(create, request)).spaces).toHaveLength(1);
    await expect(command({ ...create, name: 'Different' }, request)).rejects.toThrow('different command');
    s = await command({ type: 'save_task', spaceId, title: 'Monthly', startsOn: '2024-01-31', recurrence: 'monthly' }); const id = s.tasks[0].id;
    s = await command({ type: 'check_task', spaceId, id, date: '2024-02-29', done: true });
    s = await command({ type: 'check_task', spaceId, id, date: '2024-03-31', done: true }); expect(s.completions).toHaveLength(2);
    await expect(command({ type: 'check_task', spaceId, id, date: '2024-03-30', done: true })).rejects.toThrow('does not occur');
    await expect(command({ type: 'save_task', spaceId, id, title: 'Monthly', startsOn: '2024-01-30', recurrence: 'daily' })).rejects.toThrow('Undo completions');
    s = await command({ type: 'check_task', spaceId, id, date: '2024-02-29', done: false });
    expect(s.completions.map(c => c.occurs_on)).toEqual(['2024-03-31']);
    s = await command({ type: 'delete_task', spaceId, id }); expect(s.completions).toHaveLength(0);
  });
  it('rejects cross-space item/task operations even for a valid member of another space', async () => {
    let s = await command({ type: 'create_space', name: 'Secret', shared: false }); const secret = s.spaces[0].id;
    s = await command({ type: 'create_list', spaceId: secret, title: 'Secret list' }); const listId = s.lists[0].id;
    s = await command({ type: 'save_task', spaceId: secret, title: 'Secret task', startsOn: '2026-09-21', recurrence: 'daily' }); const id = s.tasks[0].id;
    await asUser(outsider); s = await command({ type: 'create_space', name: 'Mine', shared: false }); const spaceId = s.spaces[0].id;
    await expect(command({ type: 'add_item', spaceId, listId, title: 'Bad' })).rejects.toThrow('List unavailable');
    await expect(command({ type: 'check_task', spaceId, id, date: '2026-09-21', done: true })).rejects.toThrow('Task unavailable');
    await expect(command({ type: 'delete_task', spaceId, id })).rejects.toThrow('Task unavailable');
  });
  it('matches client recurrence calculations at leap-year and monthly boundaries', async () => {
    await db.exec('RESET ROLE');
    for (const recurrence of ['once', 'daily', 'weekly', 'monthly'] as const) {
      for (const date of ['2023-12-31','2024-01-31','2024-02-28','2024-02-29','2024-03-31','2025-02-28']) {
        const task: Task = { id: owner, space_id: owner, title: 'Test', starts_on: '2024-01-31', recurrence };
        const actual = (await db.query<{ result: boolean }>('SELECT planner_occurs($1,$2,$3) result', [task.starts_on, recurrence, date])).rows[0].result;
        expect(actual).toBe(occursOn(task, date));
      }
    }
  });
});
