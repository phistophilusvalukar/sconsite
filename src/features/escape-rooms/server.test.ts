import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import migration from '../../../supabase/migrations/20260916000100_escape_rooms.sql?raw';
import { sessionSchema } from './model';
import { starter } from './starter';

// Execute the actual PostgreSQL migration and commands, not a JS imitation.
const db = new PGlite();
const gm = '11111111-1111-4111-8111-111111111111';
const player = '22222222-2222-4222-8222-222222222222';
const stranger = '33333333-3333-4333-8333-333333333333';
async function asUser(id: string) { await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [id]); }
async function rpc(sql: string, params: unknown[] = []) { const r = await db.query<{ result: unknown }>(`SELECT ${sql} AS result`, params); return r.rows[0].result; }
async function snapshot(id: string) { return sessionSchema.parse(await rpc('escape_snapshot($1)', [id])); }
async function command(id: string, revision: number, payload: unknown) { return sessionSchema.parse(await rpc('escape_command($1,$2,$3)', [id, revision, JSON.stringify(payload)])); }
async function createRoom() {
  await asUser(gm);
  const b = await rpc('escape_save_blueprint(NULL,$1,0)', [JSON.stringify(starter)]) as { id: string };
  return sessionSchema.parse(await rpc('escape_start_session($1)', [b.id]));
}
beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE TABLE public.site_pages(page_key text PRIMARY KEY, is_enabled boolean NOT NULL DEFAULT true);
    GRANT SELECT ON public.site_pages TO authenticated;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    INSERT INTO auth.users VALUES ('${gm}'),('${player}'),('${stranger}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION public.is_user_banned(text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE FUNCTION public.is_site_admin(text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1 = '${gm}' $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
  `);
  await db.exec(migration);
  await db.exec('SET ROLE authenticated');
}, 30000);
afterAll(async () => { await db.close(); });

describe('protected escape room commands', () => {
  it('registers the route in site visibility and rejects anonymous sessions', async () => {
    expect((await db.query('SELECT is_enabled FROM site_pages WHERE page_key = $1', ['escape-rooms'])).rows).toEqual([{ is_enabled: true }]);
    await asUser('');
    await expect(rpc('escape_library()')).rejects.toThrow('Sign in');
  });
  it('keeps definitions private, rejects strangers and direct writes, and rejects non-admin creation', async () => {
    const room = await createRoom();
    expect(room.nodes).toHaveLength(0);
    await asUser(stranger);
    await expect(snapshot(room.id)).rejects.toThrow('access denied');
    await expect(rpc('escape_save_blueprint(NULL,$1,0)', [JSON.stringify(starter)])).rejects.toThrow('administrators');
    await expect(db.query('SELECT * FROM escape_sessions')).rejects.toThrow('permission denied');
    await expect(db.query('UPDATE escape_updates SET revision = 999')).rejects.toThrow('permission denied');
    const notices = await db.query('SELECT * FROM escape_updates WHERE session_id = $1', [room.id]);
    expect(notices.rows).toHaveLength(0);
    await asUser(player);
    const joined = sessionSchema.parse(await rpc('escape_join_session($1)', [room.joinCode]));
    expect(joined.definition).toBeUndefined(); expect(joined.states).toBeUndefined(); expect(joined.joinCode).toBeUndefined();
    expect(JSON.stringify(joined)).not.toContain('314');
    expect(joined.nodes).toHaveLength(0);
    await expect(command(room.id, joined.revision, { type: 'reveal', nodeId: 'letter' })).rejects.toThrow('puzzle master');
    await expect(command(room.id, joined.revision, { type: 'unlock', nodeId: 'treasure', code: '', itemIds: [] })).rejects.toThrow('unavailable');
    expect((await db.query('SELECT * FROM escape_updates WHERE session_id = $1', [room.id])).rows).toHaveLength(1);
  });
  it('runs both branches, rejects stale and wrong attempts, applies items, and completes the adventure', async () => {
    let room = await createRoom();
    const id = room.id;
    room = await command(id, room.revision, { type: 'reveal', nodeId: 'letter' });
    expect(room.nodes.map(n => n.id)).toEqual(['letter', 'cabinet']);
    await asUser(player);
    await rpc('escape_join_session($1)', [room.joinCode]);
    await expect(command(id, room.revision, { type: 'unlock', nodeId: 'cabinet', code: '999', itemIds: [] })).rejects.toThrow('does not open');
    expect((await snapshot(id)).revision).toBe(room.revision);
    const oldRevision = room.revision;
    room = await command(id, room.revision, { type: 'unlock', nodeId: 'cabinet', code: ' 314 ', itemIds: [] });
    expect(room.nodes.map(n => n.id)).toContain('key');
    expect(room.nodes.map(n => n.id)).not.toContain('vault');
    await expect(command(id, oldRevision, { type: 'unlock', nodeId: 'cabinet', code: '314', itemIds: [] })).rejects.toThrow('party made progress');
    await asUser(gm);
    room = await command(id, room.revision, { type: 'reveal', nodeId: 'book' });
    await asUser(player);
    room = await command(id, room.revision, { type: 'unlock', nodeId: 'case', code: 'dawn', itemIds: [] });
    expect(room.nodes.map(n => n.id)).toContain('vault');
    await expect(command(id, room.revision, { type: 'unlock', nodeId: 'vault', code: '', itemIds: ['key'] })).rejects.toThrow('does not open');
    room = await command(id, room.revision, { type: 'unlock', nodeId: 'vault', code: '', itemIds: ['key', 'rod'] });
    expect(room.nodes.find(n => n.id === 'rod')?.status).toBe('used');
    expect(room.nodes.map(n => n.id)).toContain('treasure');
    expect(room.nodes.find(n => n.id === 'cabinet')).not.toHaveProperty('code');
    room = await command(id, room.revision, { type: 'unlock', nodeId: 'treasure', code: '', itemIds: [] });
    expect(room.status).toBe('completed');
    await expect(command(id, room.revision, { type: 'unlock', nodeId: 'treasure', code: '', itemIds: [] })).rejects.toThrow('complete');
  });
  it('supports ANY joins, chained automatic reveals, and pause/resume', async () => {
    await asUser(gm);
    const draft = structuredClone(starter);
    draft.nodes.find(n => n.id === 'vault')!.gate = 'any';
    const b = await rpc('escape_save_blueprint(NULL,$1,0)', [JSON.stringify(draft)]) as { id: string };
    let room = sessionSchema.parse(await rpc('escape_start_session($1)', [b.id]));
    room = await command(room.id, room.revision, { type: 'reveal', nodeId: 'letter' });
    room = await command(room.id, room.revision, { type: 'pause' });
    await expect(command(room.id, room.revision, { type: 'unlock', nodeId: 'cabinet', code: '314', itemIds: [] })).rejects.toThrow('paused');
    room = await command(room.id, room.revision, { type: 'resume' });
    room = await command(room.id, room.revision, { type: 'mark_used', nodeId: 'cabinet' });
    expect(room.nodes.map(n => n.id)).toContain('vault');
    expect(room.nodes.map(n => n.id)).toContain('key');
  });
  it('rejects cycles, broken references, malformed fields, and conflicting blueprint saves', async () => {
    await asUser(gm);
    const draft = structuredClone(starter);
    draft.nodes[0].requires = [{ nodeId: 'vault', state: 'used' }];
    await expect(rpc('escape_save_blueprint(NULL,$1,0)', [JSON.stringify(draft)])).rejects.toThrow('cycle');
    draft.nodes[0].requires = [{ nodeId: 'missing', state: 'known' }];
    await expect(rpc('escape_save_blueprint(NULL,$1,0)', [JSON.stringify(draft)])).rejects.toThrow('prerequisite');
    await expect(rpc('escape_save_blueprint(NULL,$1,0)', [JSON.stringify({ ...starter, title: null })])).rejects.toThrow('Invalid blueprint');
    const b = await rpc('escape_save_blueprint(NULL,$1,0)', [JSON.stringify(starter)]) as { id: string };
    await rpc('escape_save_blueprint($1,$2,1)', [b.id, JSON.stringify({ ...starter, title: 'Updated' })]);
    await expect(rpc('escape_save_blueprint($1,$2,1)', [b.id, JSON.stringify(starter)])).rejects.toThrow('Reload');
  });
  it('freezes session definitions and shares progress with a second player', async () => {
    await asUser(gm);
    const b = await rpc('escape_save_blueprint(NULL,$1,0)', [JSON.stringify(starter)]) as { id: string };
    let room = sessionSchema.parse(await rpc('escape_start_session($1)', [b.id]));
    const invite = room.joinCode;
    await rpc('escape_save_blueprint($1,$2,1)', [b.id, JSON.stringify({ ...starter, title: 'A different mystery' })]);
    expect((await snapshot(room.id)).title).toBe(starter.title);
    room = await command(room.id, room.revision, { type: 'reveal', nodeId: 'book' });
    await asUser(player);
    await rpc('escape_join_session($1)', [invite]);
    await rpc('escape_join_session($1)', [invite]);
    const first = await snapshot(room.id);
    expect(first.memberCount).toBe(1);
    await asUser(stranger);
    const second = sessionSchema.parse(await rpc('escape_join_session($1)', [invite]));
    expect(second.memberCount).toBe(2);
    expect(second.nodes).toEqual(first.nodes);
    expect(second.history).toEqual(first.history);
  });
});
