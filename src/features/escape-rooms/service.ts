import { z } from 'zod';
import { supabase } from '../../config/database';
import { blueprintSchema, leaderboardSchema, librarySchema, sessionSchema, type Blueprint } from './model';

export async function getLibrary() {
  const { data, error } = await supabase.rpc('escape_library');
  if (error) throw new Error(error.message);
  return librarySchema.parse(data);
}
export async function saveBlueprint(id: string | null, definition: Blueprint, revision: number) {
  const { data, error } = await supabase.rpc('escape_save_blueprint', { p_id: id, p_definition: blueprintSchema.parse(definition), p_revision: revision });
  if (error) throw new Error(error.message);
  return z.object({ id: z.string().uuid(), revision: z.number() }).parse(data);
}
export async function startSession(blueprintId: string) {
  const { data, error } = await supabase.rpc('escape_start_session', { p_blueprint_id: blueprintId });
  if (error) throw new Error(error.message);
  return sessionSchema.parse(data);
}
export async function joinSession(code: string) {
  const { data, error } = await supabase.rpc('escape_join_session', { p_code: code.trim() });
  if (error) throw new Error(error.message);
  return sessionSchema.parse(data);
}
export async function getSession(id: string) {
  const { data, error } = await supabase.rpc('escape_snapshot', { p_id: id });
  if (error) throw new Error(error.message);
  return sessionSchema.parse(data);
}
export type SessionCommand = { type: 'reveal' | 'mark_used' | 'start_pick' | 'release_pick' | 'force_attempt'; nodeId: string }
  | { type: 'pick_turn'; nodeId: string; angle: number }
  | { type: 'resolve_force'; nodeId: string; success: boolean }
  | { type: 'request_hint'; nodeId?: string }
  | { type: 'answer_hint'; hintId: string; text: string }
  | { type: 'set_party_name'; name: string }
  | { type: 'unlock'; nodeId: string; code: string; itemIds: string[] } | { type: 'pause' | 'resume' };
export type RoomCommand = (command: SessionCommand) => Promise<boolean>;
export async function getLeaderboard(id: string) {
  const { data, error } = await supabase.rpc('escape_leaderboard', { p_id: id });
  if (error) throw new Error(error.message);
  return leaderboardSchema.parse(data);
}
export async function sendCommand(id: string, revision: number, command: SessionCommand) {
  const { data, error } = await supabase.rpc('escape_command', { p_id: id, p_revision: revision, p_command: command });
  if (error) throw new Error(error.message);
  return sessionSchema.parse(data);
}
