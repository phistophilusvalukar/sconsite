import { supabase } from '../../config/database';
import { commandSchema, snapshotSchema, type Command } from './model';

export async function loadPlanner() {
  const { data, error } = await supabase.rpc('planner_snapshot');
  if (error) throw describeError(error.message);
  return snapshotSchema.parse(data);
}
export async function sendCommand(command: Command, requestId: string) {
  const { data, error } = await supabase.rpc('planner_command', { p_command: commandSchema.parse(command), p_request_id: requestId });
  if (error) throw describeError(error.message);
  return snapshotSchema.parse(data);
}
function describeError(message: string) {
  return new Error(/schema cache|does not exist|could not find the function/i.test(message)
    ? 'Planner setup is pending. Apply the shared planner database migration to enable your spaces.' : message);
}
