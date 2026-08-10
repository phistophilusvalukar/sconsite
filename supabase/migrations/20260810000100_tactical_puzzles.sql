CREATE TABLE IF NOT EXISTS public.tactical_puzzle_designs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  puzzle_key text NOT NULL CHECK (puzzle_key ~ '^[a-z0-9][a-z0-9-]*$'),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '',
  difficulty text NOT NULL CHECK (difficulty IN ('tutorial', 'easy', 'moderate', 'hard', 'expert')),
  tags text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, puzzle_key)
);

CREATE TABLE IF NOT EXISTS public.tactical_puzzle_progress (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  puzzle_key text NOT NULL CHECK (puzzle_key ~ '^[a-z0-9][a-z0-9-]*$'),
  puzzle_design_id uuid REFERENCES public.tactical_puzzle_designs(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  best_actions integer CHECK (best_actions IS NULL OR best_actions >= 0),
  completed_at timestamptz,
  last_result jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(last_result) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, puzzle_key)
);

CREATE INDEX IF NOT EXISTS tactical_puzzle_designs_owner_updated_idx
  ON public.tactical_puzzle_designs (owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS tactical_puzzle_designs_published_idx
  ON public.tactical_puzzle_designs (status, updated_at DESC)
  WHERE status = 'published';
CREATE INDEX IF NOT EXISTS tactical_puzzle_progress_user_status_idx
  ON public.tactical_puzzle_progress (user_id, status);

CREATE OR REPLACE FUNCTION public.set_tactical_puzzle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_tactical_puzzle_designs_updated_at ON public.tactical_puzzle_designs;
CREATE TRIGGER set_tactical_puzzle_designs_updated_at
  BEFORE UPDATE ON public.tactical_puzzle_designs
  FOR EACH ROW EXECUTE FUNCTION public.set_tactical_puzzle_updated_at();

DROP TRIGGER IF EXISTS set_tactical_puzzle_progress_updated_at ON public.tactical_puzzle_progress;
CREATE TRIGGER set_tactical_puzzle_progress_updated_at
  BEFORE UPDATE ON public.tactical_puzzle_progress
  FOR EACH ROW EXECUTE FUNCTION public.set_tactical_puzzle_updated_at();

ALTER TABLE public.tactical_puzzle_designs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tactical_puzzle_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Puzzle designs are visible to owners or when published" ON public.tactical_puzzle_designs;
CREATE POLICY "Puzzle designs are visible to owners or when published"
  ON public.tactical_puzzle_designs FOR SELECT
  USING (status = 'published' OR owner_id = auth.uid());

DROP POLICY IF EXISTS "Users create their own puzzle designs" ON public.tactical_puzzle_designs;
CREATE POLICY "Users create their own puzzle designs"
  ON public.tactical_puzzle_designs FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Users update their own puzzle designs" ON public.tactical_puzzle_designs;
CREATE POLICY "Users update their own puzzle designs"
  ON public.tactical_puzzle_designs FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Users delete their own puzzle designs" ON public.tactical_puzzle_designs;
CREATE POLICY "Users delete their own puzzle designs"
  ON public.tactical_puzzle_designs FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Users read their own puzzle progress" ON public.tactical_puzzle_progress;
CREATE POLICY "Users read their own puzzle progress"
  ON public.tactical_puzzle_progress FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.record_tactical_puzzle_completion(
  target_puzzle_key text,
  target_action_count integer,
  result_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  saved_progress public.tactical_puzzle_progress%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF target_puzzle_key IS NULL OR target_puzzle_key !~ '^[a-z0-9][a-z0-9-]*$' THEN
    RAISE EXCEPTION 'Invalid puzzle key';
  END IF;
  IF target_action_count IS NULL OR target_action_count < 0 THEN
    RAISE EXCEPTION 'Invalid action count';
  END IF;
  IF result_payload IS NULL OR jsonb_typeof(result_payload) <> 'object' THEN
    RAISE EXCEPTION 'Invalid result payload';
  END IF;

  INSERT INTO public.tactical_puzzle_progress (
    user_id, puzzle_key, status, attempts, best_actions, completed_at, last_result
  )
  VALUES (
    auth.uid(), target_puzzle_key, 'completed', 1, target_action_count, now(), result_payload
  )
  ON CONFLICT (user_id, puzzle_key) DO UPDATE
  SET status = 'completed',
      attempts = public.tactical_puzzle_progress.attempts + 1,
      best_actions = CASE
        WHEN public.tactical_puzzle_progress.best_actions IS NULL THEN EXCLUDED.best_actions
        ELSE LEAST(public.tactical_puzzle_progress.best_actions, EXCLUDED.best_actions)
      END,
      completed_at = now(),
      last_result = EXCLUDED.last_result
  RETURNING * INTO saved_progress;

  RETURN jsonb_build_object(
    'puzzleKey', saved_progress.puzzle_key,
    'status', saved_progress.status,
    'attempts', saved_progress.attempts,
    'bestActions', saved_progress.best_actions,
    'completedAt', saved_progress.completed_at
  );
END;
$$;

GRANT SELECT ON public.tactical_puzzle_designs TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.tactical_puzzle_designs TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.tactical_puzzle_progress FROM anon, authenticated;
GRANT SELECT ON public.tactical_puzzle_progress TO authenticated;
REVOKE ALL ON FUNCTION public.record_tactical_puzzle_completion(text, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_tactical_puzzle_completion(text, integer, jsonb) TO authenticated;

ALTER TABLE public.site_pages
  DROP CONSTRAINT IF EXISTS site_pages_known_page_key;

ALTER TABLE public.site_pages
  ADD CONSTRAINT site_pages_known_page_key CHECK (
    page_key IN (
      'home',
      'about',
      'characters',
      'citizens',
      'guilds',
      'schedule',
      'games',
      'arcana',
      'underhaul-contracts',
      'arcane-locks',
      'broken-seals',
      'citadel-tactics',
      'tactical-puzzles',
      'campaign-objectives',
      'event',
      'skill-checks',
      'news'
    )
  );

INSERT INTO public.site_pages (page_key, is_enabled)
VALUES ('tactical-puzzles', true)
ON CONFLICT (page_key) DO NOTHING;
