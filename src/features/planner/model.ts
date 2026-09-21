import { z } from 'zod';

const id = z.string().uuid();
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Choose a valid date');
export const recurrenceSchema = z.enum(['once', 'daily', 'weekly', 'monthly']);
export const snapshotSchema = z.object({
  spaces: z.array(z.object({ id, name: z.string(), owner_id: id, shared: z.boolean(), invite_code: id.nullable() })),
  members: z.array(z.object({ space_id: id, user_id: id, name: z.string() })),
  lists: z.array(z.object({ id, space_id: id, title: z.string() })),
  items: z.array(z.object({ id, list_id: id, title: z.string(), done: z.boolean() })),
  tasks: z.array(z.object({ id, space_id: id, title: z.string(), starts_on: dateSchema, recurrence: recurrenceSchema })),
  completions: z.array(z.object({ task_id: id, occurs_on: dateSchema })),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export type Task = Snapshot['tasks'][number];
export type CalendarView = 'day' | 'week' | 'month';
const title = z.string().trim().min(1).max(160);
export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('create_space'), name: title, shared: z.boolean() }),
  z.object({ type: z.literal('join'), code: id }),
  z.object({ type: z.literal('rotate_invite'), spaceId: id }),
  z.object({ type: z.literal('remove_member'), spaceId: id, userId: id }),
  z.object({ type: z.literal('delete_space'), spaceId: id }),
  z.object({ type: z.literal('create_list'), spaceId: id, title }),
  z.object({ type: z.literal('delete_list'), spaceId: id, id }),
  z.object({ type: z.literal('add_item'), spaceId: id, listId: id, title }),
  z.object({ type: z.literal('check_item'), spaceId: id, id, done: z.boolean() }),
  z.object({ type: z.literal('delete_item'), spaceId: id, id }),
  z.object({ type: z.literal('save_task'), spaceId: id, id: id.optional(), title, startsOn: dateSchema, recurrence: recurrenceSchema }),
  z.object({ type: z.literal('delete_task'), spaceId: id, id }),
  z.object({ type: z.literal('check_task'), spaceId: id, id, date: dateSchema, done: z.boolean() }),
]);
export type Command = z.infer<typeof commandSchema>;

// Date-only arithmetic uses UTC so DST and the viewer's timezone cannot shift occurrences.
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function dateValue(key: string): Date { return new Date(`${key}T12:00:00Z`); }
export function addDays(key: string, count: number): string {
  const date = dateValue(key); date.setUTCDate(date.getUTCDate() + count); return date.toISOString().slice(0, 10);
}
export function occursOn(task: Task, key: string): boolean {
  if (key < task.starts_on) return false;
  const start = dateValue(task.starts_on); const day = dateValue(key);
  if (task.recurrence === 'once') return key === task.starts_on;
  if (task.recurrence === 'daily') return true;
  if (task.recurrence === 'weekly') return start.getUTCDay() === day.getUTCDay();
  const last = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0)).getUTCDate();
  return day.getUTCDate() === Math.min(start.getUTCDate(), last);
}
export function calendarDays(key: string, view: CalendarView): string[] {
  if (view === 'day') return [key];
  const date = dateValue(key);
  const first = view === 'month' ? `${key.slice(0, 7)}-01` : key;
  const offset = (dateValue(first).getUTCDay() + 6) % 7;
  const start = addDays(first, -offset);
  const count = view === 'week' ? 7 : Math.ceil((offset + new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()) / 7) * 7;
  return Array.from({ length: count }, (_, index) => addDays(start, index));
}
export function moveDate(key: string, view: CalendarView, direction: number): string {
  if (view !== 'month') return addDays(key, direction * (view === 'week' ? 7 : 1));
  const date = dateValue(key); date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + direction); return date.toISOString().slice(0, 10);
}
export function formatDate(key: string, options: Intl.DateTimeFormatOptions): string {
  return dateValue(key).toLocaleDateString(undefined, { ...options, timeZone: 'UTC' });
}
