import { z } from 'zod';
import { supabase } from '../../config/database';

const progressSchema = z.object({
  scriptFixed: z.boolean(),
  eldritchAwakened: z.boolean(),
  helpUpdated: z.boolean(),
  cleanerFixed: z.boolean(),
  filesRestored: z.boolean(),
  aliases: z.record(z.string(), z.string()),
  populationBlocks: z.number().int().min(0).default(0),
  recoveryRead: z.boolean().default(false),
  operatorArchiveUnlocked: z.boolean().default(false),
  sentryContacted: z.boolean().default(false),
  sentryAuthorized: z.boolean().default(false),
  portalDiscovered: z.boolean().default(false),
  portalOpen: z.boolean().default(false),
  aiAlive: z.boolean().default(true),
  horrorAlive: z.boolean().default(true),
  quarantineExpiresAt: z.string().nullable().default(null),
  aiShutdownAt: z.string().nullable().default(null),
  instabilityAt: z.string().nullable().default(null),
  phaseTwoRoute: z.enum(['phase_2a', 'phase_2b', 'phase_2c']).nullable().default(null),
  terminalEnding: z.enum(['horror_lockout', 'ai_shutdown', 'simulation_collapse']).nullable().default(null),
});

const terminalFileSchema = z.object({
  path: z.string(),
  kind: z.enum(['file', 'directory']),
  contents: z.string().nullable(),
  revision: z.number().int().positive(),
  updatedAt: z.string().optional(),
});

const deletedFileSchema = z.object({ deleted: z.string() });

export type AncientTerminalProgress = z.infer<typeof progressSchema>;
export type AncientTerminalFile = z.infer<typeof terminalFileSchema>;
export type AncientTerminalAction =
  | 'fix_script'
  | 'awaken_eldritch'
  | 'update_help'
  | 'fix_cleaner'
  | 'restore_files'
  | 'record_population_block'
  | 'read_recovery'
  | 'contact_sentry'
  | 'authorize_sentry'
  | 'quarantine_horror'
  | 'discover_portal'
  | 'open_portal'
  | 'purge_ai'
  | 'purge_horror'
  | 'enter_portal';

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

export async function loadAncientTerminalFiles(): Promise<AncientTerminalFile[]> {
  const { data, error } = await supabase.rpc('get_ancient_terminal_files');
  if (error) throw new Error(error.message);
  return z.array(terminalFileSchema).parse(data);
}

export async function writeAncientTerminalFile(path: string, contents: string, expectedRevision: number): Promise<AncientTerminalFile> {
  const { data, error } = await supabase.rpc('write_ancient_terminal_file_command', {
    p_path: path,
    p_contents: contents,
    p_expected_revision: expectedRevision,
  });
  if (error) throw new Error(error.message);
  return terminalFileSchema.parse(data);
}

export async function createAncientTerminalDirectory(path: string): Promise<AncientTerminalFile> {
  const { data, error } = await supabase.rpc('create_ancient_terminal_directory_command', { p_path: path });
  if (error) throw new Error(error.message);
  return terminalFileSchema.parse(data);
}

export async function deleteAncientTerminalFile(path: string, expectedRevision: number): Promise<string> {
  const { data, error } = await supabase.rpc('delete_ancient_terminal_file_command', {
    p_path: path,
    p_expected_revision: expectedRevision,
  });
  if (error) throw new Error(error.message);
  return deletedFileSchema.parse(data).deleted;
}

export async function copyAncientTerminalFile(sourcePath: string, targetPath: string, expectedRevision: number): Promise<AncientTerminalFile> {
  const { data, error } = await supabase.rpc('copy_ancient_terminal_file_command', {
    p_source_path: sourcePath,
    p_target_path: targetPath,
    p_expected_revision: expectedRevision,
  });
  if (error) throw new Error(error.message);
  return terminalFileSchema.parse(data);
}

export async function moveAncientTerminalEntry(sourcePath: string, targetPath: string, expectedRevision: number): Promise<AncientTerminalFile[]> {
  const { data, error } = await supabase.rpc('move_ancient_terminal_entry_command', {
    p_source_path: sourcePath,
    p_target_path: targetPath,
    p_expected_revision: expectedRevision,
  });
  if (error) throw new Error(error.message);
  return z.array(terminalFileSchema).parse(data);
}
