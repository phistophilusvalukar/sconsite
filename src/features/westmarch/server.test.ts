import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import migration from '../../../supabase/migrations/20260917000100_westmarch_events.sql?raw';
import { snapshotSchema, type EventDefinition } from './model';

const db = new PGlite();
const admin = '11111111-1111-4111-8111-111111111111';
const author = '22222222-2222-4222-8222-222222222222';
const player = '33333333-3333-4333-8333-333333333333';
const applicant = '44444444-4444-4444-8444-444444444444';
const definition: EventDefinition = { title: 'The crop plague', kind: 'minor', region: 'Green Vale', requester: 'Farmer Jo', location: 'The fields', description: 'A strange blight is destroying the summer crops.', successText: 'The harvest is saved.', failureText: 'The fields are lost.', durationHours: 168, target: 75, minimum: 1, actions: [
  { id: 'main', name: 'Restore crops', kind: 'main', description: '', skills: ['Nature'], hours: 1, adjustment: 0, threshold: 1, reduction: 2 },
  { id: 'aid', name: 'Find the blight', kind: 'aid', description: '', skills: ['Perception'], hours: 1, adjustment: 0, threshold: 1, reduction: 2 },
] };
async function asUser(id: string) { await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]); }
async function rpc(sql: string, params: unknown[] = []) { return (await db.query<{ result: unknown }>(`SELECT ${sql} AS result`, params)).rows[0].result; }
async function snapshot() { return snapshotSchema.parse(await rpc('wm_snapshot()')); }
async function command(payload: unknown, requestId = crypto.randomUUID()) { return snapshotSchema.parse(await rpc('wm_command($1,$2)', [requestId, JSON.stringify(payload)])); }
async function privileged(sql: string, params: unknown[] = []) {
  await db.exec('RESET ROLE');
  try { return await db.query(sql, params); } finally { await db.exec('SET ROLE authenticated'); }
}
async function submit(kind: 'minor' | 'meta' = 'minor') {
  await asUser(author);
  const s = await command({ type: 'save_event', definition: { ...definition, kind }, submit: true });
  return s.events.find(e => e.status === 'submitted')!;
}
async function activate(kind: 'minor' | 'meta' = 'minor') {
  const e = await submit(kind); await asUser(admin);
  let s = await command({ type: 'review_event', id: e.id, revision: e.revision, decision: 'approve' });
  if (kind === 'meta') {
    const queued = s.events.find(x => x.id === e.id)!;
    s = await command({ type: 'control_event', operation: 'start', id: e.id, revision: queued.revision, slotId: 6, reason: 'Begin the meta story' });
  }
  return s.events.find(x => x.id === e.id)!;
}
async function character() {
  await asUser(player);
  return (await command({ type: 'save_character', character: { name: 'Arden', ancestry: 'Elf', heritage: '', classPrimary: 'Druid', classSecondary: '', level: 6 } })).characters[0];
}
function booking(eventId: string, characterId: string, hour = 1, actionId = 'main') {
  return { eventId, characterId, actionId, skill: actionId === 'main' ? 'Nature' : 'Perception', modifier: 9, description: 'I carefully inspect and tend the fields.', startsAt: new Date(Date.now() + hour * 3600000).toISOString() };
}

beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE users(auth_user_id text PRIMARY KEY,username text NOT NULL,is_admin boolean NOT NULL DEFAULT false,is_banned boolean NOT NULL DEFAULT false);
    INSERT INTO users VALUES('${admin}','Admin',true,false),('${author}','Author',false,false),('${player}','Player',false,false),('${applicant}','Applicant',false,false);
    CREATE TABLE characters(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id text NOT NULL REFERENCES users(auth_user_id),name text NOT NULL,class text NOT NULL,class_primary text,class_secondary text,race text NOT NULL,ancestry text,heritage text,level integer DEFAULT 1,character_status text NOT NULL DEFAULT 'active',is_active boolean DEFAULT true,updated_at timestamptz DEFAULT now());
    GRANT USAGE ON SCHEMA auth TO authenticated;
  `);
  await db.exec(migration);
}, 30000);
beforeEach(async () => {
  await db.exec('RESET ROLE');
  await db.exec('TRUNCATE wm_requests,wm_log,wm_rewards,wm_milestones,wm_contributions,wm_applications,wm_staff,wm_slots,wm_events,characters CASCADE');
  await db.exec("INSERT INTO wm_slots(id,kind) SELECT n,CASE WHEN n=6 THEN 'meta' ELSE 'minor' END FROM generate_series(1,6) n; UPDATE users SET is_banned=false;");
  await db.exec('SET ROLE authenticated');
});
afterAll(async () => { await db.close(); });

describe('Westmarch protected PostgreSQL commands', () => {
  it('rejects anonymous, banned and direct table writes; hides drafts and private applications', async () => {
    await asUser(''); await expect(snapshot()).rejects.toThrow('eligible account');
    await submit(); await asUser(player);
    expect((await snapshot()).events).toHaveLength(0);
    await expect(db.query('SELECT * FROM wm_events')).rejects.toThrow('permission denied');
    await expect(rpc('wm_tick()')).rejects.toThrow('permission denied');
    await expect(rpc('wm_start(NULL,1,NULL,\'test\')')).rejects.toThrow('permission denied');
    await privileged('UPDATE users SET is_banned=true WHERE auth_user_id=$1', [player]);
    await expect(snapshot()).rejects.toThrow('eligible account');
  });
  it('approves once, issues an author-bound reward and automatically starts minor events only', async () => {
    const e = await submit();
    await expect(command({ type: 'review_event', id: e.id, revision: e.revision, decision: 'approve' })).rejects.toThrow('Event Staff');
    await asUser(admin);
    const request = crypto.randomUUID(); const payload = { type: 'review_event', id: e.id, revision: e.revision, decision: 'approve' };
    let s = await command(payload, request); s = await command(payload, request);
    expect(s.events.find(x => x.id === e.id)?.status).toBe('active');
    expect(s.rewards).toHaveLength(1); expect(s.rewards[0].authorId).toBe(author);
    expect(s.logs.filter(l => l.action === 'automatic_start')).toHaveLength(1);
    await expect(command({ ...payload, decision: 'reject' }, request)).rejects.toThrow('different command');
    const meta = await submit('meta'); await asUser(admin);
    s = await command({ type: 'review_event', id: meta.id, revision: meta.revision, decision: 'approve' });
    expect(s.events.find(x => x.id === meta.id)?.status).toBe('queued');
    expect(s.slots.find(x => x.id === 6)?.eventId).toBeNull();
    await asUser(player); expect((await snapshot()).rewards).toHaveLength(0);
  });
  it('commits rolls once, rejects overlapping cross-event work and rolls back invalid whole plans', async () => {
    const first = await activate(); const second = await activate(); const ch = await character();
    const b = booking(first.id, ch.id); const request = crypto.randomUUID();
    const s = await command({ type: 'book', bookings: [b] }, request);
    expect(s.contributions).toHaveLength(1);
    expect(s.contributions[0].baseDc).toBe(22);
    expect(s.contributions[0].total).toBe(s.contributions[0].die + 9);
    expect((await command({ type: 'book', bookings: [b] }, request)).contributions).toEqual(s.contributions);
    await expect(command({ type: 'book', bookings: [{ ...b, eventId: second.id }] })).rejects.toThrow('already has work');
    const later = booking(first.id, ch.id, 5);
    await expect(command({ type: 'book', bookings: [later, { ...later, skill: 'Arcana' }] })).rejects.toThrow('allowed check');
    expect((await snapshot()).contributions).toHaveLength(1);
    await command({ type: 'book', bookings: [{ ...b, startsAt: s.contributions[0].endsAt }] });
    expect((await snapshot()).contributions).toHaveLength(2);
    await expect(command({ type: 'book', bookings: [booking(first.id, ch.id, 169)] })).rejects.toThrow('deadline');
    await asUser(author);
    await expect(command({ type: 'book', bookings: [booking(first.id, ch.id, 8)] })).rejects.toThrow();
  });
  it('finalizes aid before same-time main work and never retroactively rescues earlier failures', async () => {
    const e = await activate(); const ch = await character();
    await command({ type: 'book', bookings: [booking(e.id, ch.id, 1), booking(e.id, ch.id, 3, 'aid'), booking(e.id, ch.id, 5)] });
    // Shift fixture clocks after legitimate booking to exercise downtime catch-up without wall-clock waits.
    await privileged("UPDATE wm_contributions SET starts_at=now()-interval '4 hours',ends_at=CASE WHEN kind='aid' THEN now()-interval '1 hour' ELSE CASE WHEN starts_at=(SELECT min(starts_at) FROM wm_contributions) THEN now()-interval '2 hours' ELSE now()-interval '1 hour' END END,die=12,modifier=CASE WHEN kind='aid' THEN 20 ELSE 9 END,total=CASE WHEN kind='aid' THEN 32 ELSE 21 END WHERE event_id=$1", [e.id]);
    await db.exec('RESET ROLE; SET ROLE service_role'); await rpc('wm_tick()'); await db.exec('RESET ROLE; SET ROLE authenticated');
    const rows = (await snapshot()).contributions.filter(c => c.kind === 'main').sort((a, b) => a.endsAt.localeCompare(b.endsAt));
    expect(rows.map(c => [c.finalDc, c.success])).toEqual([[22, false], [20, true]]);
    await command({ type: 'save_character', character: { ...ch, level: 20 } });
    expect((await snapshot()).contributions.every(c => c.level === 6 && c.baseDc === 22)).toBe(true);
  });
  it('makes staff admin-approved, rejects self-review and removes privileges on the next request', async () => {
    await asUser(applicant);
    let s = await command({ type: 'apply_staff', motivation: 'I want to help run thoughtful community events.', experience: 'GM for years', availability: 'Weekends' });
    const id = s.applications[0].id;
    await asUser(author); expect((await snapshot()).applications).toHaveLength(0);
    await expect(command({ type: 'review_staff', id, approve: true })).rejects.toThrow('Administrator');
    await asUser(admin); await command({ type: 'review_staff', id, approve: true });
    await asUser(applicant);
    s = await command({ type: 'save_event', definition, submit: true });
    const own = s.events.find(e => e.authorId === applicant)!;
    await expect(command({ type: 'review_event', id: own.id, revision: own.revision, decision: 'approve' })).rejects.toThrow('Another reviewer');
    const e = await submit(); await asUser(applicant);
    await command({ type: 'review_event', id: e.id, revision: e.revision, decision: 'approve' });
    await asUser(admin); await command({ type: 'revoke_staff', userId: applicant, reason: 'Access review completed' });
    await asUser(applicant); expect((await snapshot()).isStaff).toBe(false);
    await expect(command({ type: 'control_event', operation: 'pause', id: e.id, revision: 3, reason: 'Pause this event' })).rejects.toThrow('Event Staff');
  });
  it('pauses processing and booking, then catches up; removal voids only unfinished work', async () => {
    let e = await activate('meta'); const ch = await character();
    await command({ type: 'book', bookings: [booking(e.id, ch.id)] });
    await asUser(admin);
    let s = await command({ type: 'control_event', operation: 'pause', id: e.id, revision: e.revision, reason: 'Investigating a reported issue' });
    e = s.events.find(x => x.id === e.id)!;
    await privileged("UPDATE wm_contributions SET starts_at=now()-interval '2 hours',ends_at=now()-interval '1 hour' WHERE event_id=$1", [e.id]);
    await asUser(player); await expect(command({ type: 'book', bookings: [booking(e.id, ch.id, 3)] })).rejects.toThrow();
    await asUser(admin); s = await command({ type: 'control_event', operation: 'resume', id: e.id, revision: e.revision, reason: 'Issue resolved safely' });
    expect(s.contributions[0].status).toBe('completed'); e = s.events.find(x => x.id === e.id)!;
    await asUser(player); await command({ type: 'book', bookings: [booking(e.id, ch.id, 3)] });
    await asUser(admin); s = await command({ type: 'control_event', operation: 'remove', id: e.id, revision: e.revision, reason: 'Story withdrawn by its author' });
    expect(s.contributions.map(c => c.status).sort()).toEqual(['completed', 'void']);
    expect(s.slots.find(x => x.id === 6)?.cooldownUntil).not.toBeNull();
  });
});
