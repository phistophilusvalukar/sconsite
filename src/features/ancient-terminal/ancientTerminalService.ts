import { z } from 'zod';
import { supabase } from '../../config/database';

const progressSchema = z.object({
  scriptFixed: z.boolean(),
  eldritchAwakened: z.boolean(),
  helpUpdated: z.boolean(),
  cleanerFixed: z.boolean(),
  filesRestored: z.boolean(),
  aliases: z.record(z.string(), z.string()),
});

export type AncientTerminalProgress = z.infer<typeof progressSchema>;
export type AncientTerminalAction =
  | 'fix_script'
  | 'awaken_eldritch'
  | 'update_help'
  | 'fix_cleaner'
  | 'restore_files';

export async function loadAncientTerminalProgress(): Promise<AncientTerminalProgress> {
  const { data, error } = await supabase.rpc('get_ancient_terminal_progress');
  if (error) throw new Error(error.message);
  return progressSchema.parse(data);
}

export async function advanceAncientTerminalProgress(action: AncientTerminalAction): Promise<AncientTerminalProgress> {
  const { data, error } = await supabase.rpc('advance_ancient_terminal_progress_command', { p_action: action });
  if (error) throw new Error(error.message);
  return progressSchema.parse(data);
}

export async function setAncientTerminalAlias(name: string, command: string): Promise<AncientTerminalProgress> {
  const { data, error } = await supabase.rpc('set_ancient_terminal_alias_command', {
    p_alias_name: name,
    p_command: command,
  });
  if (error) throw new Error(error.message);
  return progressSchema.parse(data);
}

export async function replaceAncientTerminalAliases(aliases: Record<string, string>): Promise<AncientTerminalProgress> {
  const { data, error } = await supabase.rpc('replace_ancient_terminal_aliases_command', { p_aliases: aliases });
  if (error) throw new Error(error.message);
  return progressSchema.parse(data);
}

export async function resetAncientTerminalProgress(): Promise<AncientTerminalProgress> {
  const { data, error } = await supabase.rpc('reset_ancient_terminal_progress_command');
  if (error) throw new Error(error.message);
  return progressSchema.parse(data);
}
