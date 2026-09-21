import { supabase } from '../../config/database';
import { snapshotSchema, type Command } from './model';

function describeError(message: string) {
  if (/wm_snapshot|schema cache|does not exist/i.test(message)) return 'The event service is not installed yet. Your account and characters are safe. An administrator needs to apply the Westmarch database migration.';
  return message;
}
export async function loadWestmarch() {
  const { data, error } = await supabase.rpc('wm_snapshot');
  if (error) throw new Error(describeError(error.message));
  return snapshotSchema.parse(data);
}
export async function sendWestmarchCommand(command: Command, requestId: string) {
  const { data, error } = await supabase.rpc('wm_command', { p_request_id: requestId, p_command: command });
  if (error) throw new Error(describeError(error.message));
  return snapshotSchema.parse(data);
}
