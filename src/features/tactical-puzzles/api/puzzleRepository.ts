import { supabase } from '../../../config/database';
import { z } from 'zod';
import { parsePuzzleDefinition } from '../engine/schema';
import type { PuzzleDefinition } from '../engine/types';

const LOCAL_DESIGNS_KEY = 'scon-tactical-puzzle-designs-v1';
const LOCAL_COMPLETIONS_KEY = 'scon-tactical-puzzle-completions-v1';

const puzzleDesignRowSchema = z.object({
  puzzle_key: z.string(),
  definition: z.unknown(),
  status: z.enum(['draft', 'published']),
  updated_at: z.string()
});
const puzzleDesignRowsSchema = z.array(puzzleDesignRowSchema);
const puzzleProgressRowsSchema = z.array(z.object({
  puzzle_key: z.string(),
  status: z.enum(['in_progress', 'completed']),
  attempts: z.number().int().nonnegative(),
  best_actions: z.number().int().nonnegative().nullable(),
  completed_at: z.string().nullable()
}));
const completionResponseSchema = z.object({
  puzzleKey: z.string(),
  status: z.literal('completed'),
  attempts: z.number().int().positive(),
  bestActions: z.number().int().nonnegative(),
  completedAt: z.string()
});

export interface PuzzleDesignRecord {
  puzzle: PuzzleDefinition;
  status: 'draft' | 'published';
  updatedAt: string;
  storage: 'supabase' | 'local';
}

export interface PuzzleProgress {
  puzzleKey: string;
  status: 'in_progress' | 'completed';
  attempts: number;
  bestActions: number | null;
  completedAt: string | null;
}

export interface PuzzleRepository {
  list(userId: string | null): Promise<PuzzleDesignRecord[]>;
  save(puzzle: PuzzleDefinition, userId: string | null): Promise<PuzzleDesignRecord>;
  delete(puzzleId: string, userId: string | null): Promise<void>;
}

export const puzzleRepository: PuzzleRepository = {
  async list(userId) {
    if (!userId) return readLocalDesigns();
    const { data, error } = await supabase
      .from('tactical_puzzle_designs')
      .select('puzzle_key,definition,status,updated_at')
      .eq('owner_id', userId)
      .order('updated_at', { ascending: false });
    if (error) throw new Error(`Could not load Supabase puzzle designs: ${error.message}`);
    return puzzleDesignRowsSchema.parse(data ?? []).flatMap(row => {
      try {
        return [{ puzzle: parsePuzzleDefinition(row.definition), status: row.status, updatedAt: row.updated_at, storage: 'supabase' as const }];
      } catch {
        return [];
      }
    });
  },

  async save(puzzle, userId) {
    const validated = parsePuzzleDefinition(puzzle);
    const updatedAt = new Date().toISOString();
    if (!userId) {
      const records = readLocalDesigns().filter(record => record.puzzle.id !== validated.id);
      const saved: PuzzleDesignRecord = { puzzle: validated, status: 'draft', updatedAt, storage: 'local' };
      writeLocalDesigns([saved, ...records]);
      return saved;
    }

    const { data, error } = await supabase
      .from('tactical_puzzle_designs')
      .upsert({
        owner_id: userId,
        puzzle_key: validated.id,
        title: validated.title,
        description: validated.summary,
        difficulty: validated.difficulty,
        tags: validated.tags,
        status: 'draft',
        definition: validated,
        version: 1
      }, { onConflict: 'owner_id,puzzle_key' })
      .select('puzzle_key,definition,status,updated_at')
      .single();
    if (error || !data) throw new Error(`Could not save the puzzle to Supabase: ${error?.message ?? 'No row returned'}`);
    const row = puzzleDesignRowSchema.parse(data);
    return { puzzle: parsePuzzleDefinition(row.definition), status: row.status, updatedAt: row.updated_at, storage: 'supabase' };
  },

  async delete(puzzleId, userId) {
    if (!userId) {
      writeLocalDesigns(readLocalDesigns().filter(record => record.puzzle.id !== puzzleId));
      return;
    }
    const { error } = await supabase.from('tactical_puzzle_designs').delete().eq('owner_id', userId).eq('puzzle_key', puzzleId);
    if (error) throw new Error(`Could not delete the Supabase puzzle design: ${error.message}`);
  }
};

export async function listPuzzleProgress(userId: string | null): Promise<PuzzleProgress[]> {
  if (!userId) return readLocalProgress();
  const { data, error } = await supabase
    .from('tactical_puzzle_progress')
    .select('puzzle_key,status,attempts,best_actions,completed_at')
    .eq('user_id', userId);
  if (error) throw new Error(`Could not load Supabase puzzle progress: ${error.message}`);
  return puzzleProgressRowsSchema.parse(data ?? []).map(row => ({
    puzzleKey: row.puzzle_key,
    status: row.status,
    attempts: row.attempts,
    bestActions: row.best_actions,
    completedAt: row.completed_at
  }));
}

export async function recordPuzzleCompletion(userId: string | null, puzzle: PuzzleDefinition, actionCount: number) {
  const completedAt = new Date().toISOString();
  if (!userId) {
    const records = readLocalProgress();
    const existing = records.find(record => record.puzzleKey === puzzle.id);
    const updated: PuzzleProgress = {
      puzzleKey: puzzle.id,
      status: 'completed',
      attempts: (existing?.attempts ?? 0) + 1,
      bestActions: existing?.bestActions == null ? actionCount : Math.min(existing.bestActions, actionCount),
      completedAt
    };
    writeLocalProgress([updated, ...records.filter(record => record.puzzleKey !== puzzle.id)]);
    return updated;
  }

  const { data, error } = await supabase.rpc('record_tactical_puzzle_completion', {
    target_puzzle_key: puzzle.id,
    target_action_count: actionCount,
    result_payload: { commandCount: actionCount, schemaVersion: puzzle.schemaVersion }
  });
  if (error) throw new Error(`Could not save puzzle completion through the protected Supabase command: ${error.message}`);
  return completionResponseSchema.parse(data);
}

function readLocalDesigns(): PuzzleDesignRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(LOCAL_DESIGNS_KEY) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.flatMap(item => {
      try {
        const record = item as Partial<PuzzleDesignRecord>;
        return [{
          puzzle: parsePuzzleDefinition(record.puzzle),
          status: record.status === 'published' ? 'published' as const : 'draft' as const,
          updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date(0).toISOString(),
          storage: 'local' as const
        }];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

function writeLocalDesigns(records: PuzzleDesignRecord[]) {
  if (typeof window !== 'undefined') window.localStorage.setItem(LOCAL_DESIGNS_KEY, JSON.stringify(records));
}

function readLocalProgress(): PuzzleProgress[] {
  if (typeof window === 'undefined') return [];
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(LOCAL_COMPLETIONS_KEY) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.filter(item => item && typeof item === 'object').map(item => item as PuzzleProgress);
  } catch {
    return [];
  }
}

function writeLocalProgress(records: PuzzleProgress[]) {
  if (typeof window !== 'undefined') window.localStorage.setItem(LOCAL_COMPLETIONS_KEY, JSON.stringify(records));
}
