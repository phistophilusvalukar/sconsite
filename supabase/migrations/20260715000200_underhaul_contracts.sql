CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS public.contract_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  briefing text,
  client_name text,
  client_type text,
  job_type text,
  urgency text,
  difficulty integer NOT NULL DEFAULT 1,
  estimated_minutes integer NOT NULL DEFAULT 10,
  version integer NOT NULL DEFAULT 1,
  public_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contract_case_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.contract_cases(id) ON DELETE CASCADE,
  document_key text NOT NULL,
  sequence integer NOT NULL DEFAULT 0,
  document_type text NOT NULL,
  title text NOT NULL,
  issuer text,
  issued_date text,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  starting_position jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_optional boolean NOT NULL DEFAULT false,
  initially_locked boolean NOT NULL DEFAULT false,
  asset_path text,
  UNIQUE(case_id, document_key)
);

CREATE TABLE IF NOT EXISTS public.contract_case_visitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.contract_cases(id) ON DELETE CASCADE,
  visitor_key text NOT NULL,
  name text NOT NULL,
  role text NOT NULL,
  portrait_path text,
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  dialogue_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(case_id, visitor_key)
);

CREATE TABLE IF NOT EXISTS public.contract_case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.contract_cases(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  event_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  sequence integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.contract_case_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES public.contract_cases(id) ON DELETE CASCADE,
  case_version integer NOT NULL,
  status text NOT NULL DEFAULT 'active',
  shift_units integer NOT NULL DEFAULT 0,
  desk_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  discovered_document_keys text[] NOT NULL DEFAULT ARRAY[]::text[],
  selected_flag_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  notes jsonb NOT NULL DEFAULT '{}'::jsonb,
  visitor_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision text,
  justification text,
  result_summary jsonb,
  score integer,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.contract_case_actions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES public.contract_case_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contract_case_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.contract_case_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES public.contract_cases(id) ON DELETE CASCADE,
  outcome_key text NOT NULL,
  outcome_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS private.contract_case_solutions (
  case_id uuid NOT NULL REFERENCES public.contract_cases(id) ON DELETE CASCADE,
  case_version integer NOT NULL,
  acceptable_decisions text[] NOT NULL,
  best_decision text NOT NULL,
  required_flag_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  supporting_flag_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  penalty_flag_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  critical_flag_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  scoring_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  persistent_outcomes jsonb NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY(case_id, case_version)
);

ALTER TABLE public.contract_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_case_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_case_visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_case_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_case_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_case_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_case_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.contract_case_solutions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Published contract cases are readable" ON public.contract_cases;
CREATE POLICY "Published contract cases are readable"
ON public.contract_cases FOR SELECT
TO authenticated
USING (is_published = true);

DROP POLICY IF EXISTS "Published contract documents are readable" ON public.contract_case_documents;
CREATE POLICY "Published contract documents are readable"
ON public.contract_case_documents FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.contract_cases cc
  WHERE cc.id = case_id AND cc.is_published = true
));

DROP POLICY IF EXISTS "Published contract visitors are readable" ON public.contract_case_visitors;
CREATE POLICY "Published contract visitors are readable"
ON public.contract_case_visitors FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.contract_cases cc
  WHERE cc.id = case_id AND cc.is_published = true
));

DROP POLICY IF EXISTS "Published contract events are readable" ON public.contract_case_events;
CREATE POLICY "Published contract events are readable"
ON public.contract_case_events FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.contract_cases cc
  WHERE cc.id = case_id AND cc.is_published = true
));

DROP POLICY IF EXISTS "Users create own contract runs" ON public.contract_case_runs;
CREATE POLICY "Users create own contract runs"
ON public.contract_case_runs FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users read own contract runs" ON public.contract_case_runs;
CREATE POLICY "Users read own contract runs"
ON public.contract_case_runs FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own incomplete contract runs" ON public.contract_case_runs;
CREATE POLICY "Users update own incomplete contract runs"
ON public.contract_case_runs FOR UPDATE
TO authenticated
USING (user_id = auth.uid() AND status <> 'completed')
WITH CHECK (user_id = auth.uid() AND status <> 'completed');

DROP POLICY IF EXISTS "Users create own contract actions" ON public.contract_case_actions;
CREATE POLICY "Users create own contract actions"
ON public.contract_case_actions FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid() AND EXISTS (
  SELECT 1 FROM public.contract_case_runs r
  WHERE r.id = run_id AND r.user_id = auth.uid()
));

DROP POLICY IF EXISTS "Users read own contract actions" ON public.contract_case_actions;
CREATE POLICY "Users read own contract actions"
ON public.contract_case_actions FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users read own contract outcomes" ON public.contract_case_outcomes;
CREATE POLICY "Users read own contract outcomes"
ON public.contract_case_outcomes FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users create own contract outcomes" ON public.contract_case_outcomes;
CREATE POLICY "Users create own contract outcomes"
ON public.contract_case_outcomes FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

REVOKE ALL ON private.contract_case_solutions FROM anon, authenticated;

INSERT INTO public.contract_cases (id, slug, title, briefing, client_name, client_type, job_type, urgency, difficulty, estimated_minutes, version, public_metadata, is_published)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'surveyors-satchel', 'The Surveyor''s Satchel', 'Recover a surveyor satchel while correcting floor and ownership scope.', 'Brindle & Moss Survey Company', 'Survey firm', 'Missing-person property recovery', 'Routine', 1, 12, 1, '{"tutorial":true}', true),
  ('22222222-2222-4222-8222-222222222222', 'tallow-steps', 'Breach at the Tallow Steps', 'Contain fire-resistant scavengers while separating emergency authority from relic rights.', 'Mera Quill', 'Disputed heir', 'Emergency containment', 'Emergency', 2, 16, 1, '{"emergency":true}', true),
  ('33333333-3333-4333-8333-333333333333', 'quiet-reliquary', 'The Quiet Reliquary', 'Review a pressured reliquary retrieval with conflicting inscription copies.', 'Collector Sann Vey', 'Private collector', 'Relic retrieval authorization', 'High', 3, 20, 1, '{"investigationThread":true}', true)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  briefing = EXCLUDED.briefing,
  client_name = EXCLUDED.client_name,
  client_type = EXCLUDED.client_type,
  job_type = EXCLUDED.job_type,
  urgency = EXCLUDED.urgency,
  difficulty = EXCLUDED.difficulty,
  estimated_minutes = EXCLUDED.estimated_minutes,
  version = EXCLUDED.version,
  public_metadata = EXCLUDED.public_metadata,
  is_published = EXCLUDED.is_published,
  updated_at = now();

INSERT INTO private.contract_case_solutions (
  case_id,
  case_version,
  acceptable_decisions,
  best_decision,
  required_flag_ids,
  supporting_flag_ids,
  penalty_flag_ids,
  critical_flag_ids,
  scoring_rules,
  result_rules,
  persistent_outcomes
)
VALUES
  (
    '11111111-1111-4111-8111-111111111111',
    1,
    ARRAY['approve_with_amendments', 'request_more_evidence'],
    'approve_with_amendments',
    ARRAY['satchel-request-floor', 'satchel-employment-floor', 'satchel-request-contents', 'satchel-item-personal'],
    ARRAY['satchel-reg-floor-five', 'satchel-hazard-grade'],
    ARRAY['satchel-reg-floor-four'],
    ARRAY['satchel-request-contents'],
    '{"categories":["legalAccuracy","hazardRecognition","evidenceQuality","clientProtection","underHaulProtection","professionalConduct","efficiency"]}',
    '{"caughtFacts":["Floor Four conflicts with the Floor Five assignment.","Company property and personal contents need separate handling."],"missedFacts":["The request claims everything inside the satchel."],"consequences":["A recovery crew is authorized for Floor Five with ownership amendments attached."],"clues":[],"professionalNote":"Amended approval protects the worker, the client, and UnderHaul."}',
    '[]'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    1,
    ARRAY['emergency_provisional', 'escalate_specialist'],
    'emergency_provisional',
    ARRAY['tallow-inheritance-disputed', 'tallow-relic-rights', 'tallow-emergency-authority', 'tallow-fleeing-deeper'],
    ARRAY['tallow-home-risk', 'tallow-creature-grade'],
    ARRAY['tallow-owner-deceased'],
    ARRAY['tallow-fleeing-deeper'],
    '{"categories":["legalAccuracy","hazardRecognition","evidenceQuality","clientProtection","underHaulProtection","professionalConduct","efficiency"]}',
    '{"caughtFacts":["Ownership is disputed but emergency containment is allowed.","Relic rights must be excluded.","The skitterers are fleeing a deeper threat."],"missedFacts":["The deeper-floor pressure should be escalated."],"consequences":["Containment and rescue proceed immediately. Relic recovery is barred pending ownership review."],"clues":["Deeper-floor pressure noted for a specialist queue."],"professionalNote":"Emergency authority was narrowed correctly."}',
    '[{"key":"tallow_deeper_threat","data":{"severity":"watch"}}]'
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    1,
    ARRAY['deny', 'escalate_specialist'],
    'escalate_specialist',
    ARRAY['reliquary-rival-claim', 'reliquary-old-inscription', 'reliquary-new-inscription', 'reliquary-certification-valid'],
    ARRAY['reliquary-deadline', 'reliquary-repaired-seal', 'reliquary-broker-yorren'],
    ARRAY['reliquary-exclusive-claim'],
    ARRAY['reliquary-new-inscription'],
    '{"categories":["legalAccuracy","hazardRecognition","evidenceQuality","clientProtection","underHaulProtection","professionalConduct","efficiency"]}',
    '{"caughtFacts":["The collector lacks exclusive rights.","The inscription changed from closed to open.","The newer copy is certified, which makes the discrepancy more serious."],"missedFacts":["The broker ledger includes a Yorren Vale connection."],"consequences":["Immediate retrieval is denied and an Arcane Surveyor receives the inscription packet."],"clues":["Vale & Rusk broker records mention Yorren Vale."],"professionalNote":"The report records the changed-word mystery without explaining its cause."}',
    '[{"key":"yorren_broker_thread","data":{"source":"quiet_reliquary"}}]'
  )
ON CONFLICT (case_id, case_version) DO UPDATE SET
  acceptable_decisions = EXCLUDED.acceptable_decisions,
  best_decision = EXCLUDED.best_decision,
  required_flag_ids = EXCLUDED.required_flag_ids,
  supporting_flag_ids = EXCLUDED.supporting_flag_ids,
  penalty_flag_ids = EXCLUDED.penalty_flag_ids,
  critical_flag_ids = EXCLUDED.critical_flag_ids,
  scoring_rules = EXCLUDED.scoring_rules,
  result_rules = EXCLUDED.result_rules,
  persistent_outcomes = EXCLUDED.persistent_outcomes;

CREATE OR REPLACE FUNCTION public.submit_contract_case(
  p_run_id uuid,
  p_decision text,
  p_flag_ids text[],
  p_justification text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_run public.contract_case_runs%ROWTYPE;
  v_solution private.contract_case_solutions%ROWTYPE;
  v_required_count integer;
  v_required_hit_count integer;
  v_supporting_hit_count integer;
  v_penalty_count integer;
  v_decision_points integer;
  v_total integer;
  v_category jsonb;
  v_result jsonb;
  v_outcome jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_run
  FROM public.contract_case_runs
  WHERE id = p_run_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Run not found';
  END IF;

  IF v_run.status = 'completed' THEN
    RAISE EXCEPTION 'Run already completed';
  END IF;

  SELECT * INTO v_solution
  FROM private.contract_case_solutions
  WHERE case_id = v_run.case_id AND case_version = v_run.case_version;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solution not found';
  END IF;

  IF NOT (p_decision = ANY(v_solution.acceptable_decisions)) THEN
    v_decision_points := 10;
  ELSIF p_decision = v_solution.best_decision THEN
    v_decision_points := 30;
  ELSE
    v_decision_points := 22;
  END IF;

  SELECT count(*) INTO v_required_count FROM unnest(v_solution.required_flag_ids);
  SELECT count(*) INTO v_required_hit_count
  FROM unnest(v_solution.required_flag_ids) required(flag_id)
  WHERE required.flag_id = ANY(p_flag_ids);

  SELECT count(*) INTO v_supporting_hit_count
  FROM unnest(v_solution.supporting_flag_ids) supporting(flag_id)
  WHERE supporting.flag_id = ANY(p_flag_ids);

  SELECT count(*) INTO v_penalty_count
  FROM unnest(v_solution.penalty_flag_ids) penalty(flag_id)
  WHERE penalty.flag_id = ANY(p_flag_ids);

  v_total := LEAST(100, GREATEST(0,
    v_decision_points
    + CASE WHEN v_required_count = 0 THEN 30 ELSE floor((v_required_hit_count::numeric / v_required_count::numeric) * 34)::integer END
    + LEAST(16, v_supporting_hit_count * 4)
    + 12
    + 8
    - (v_penalty_count * 5)
  ));

  v_category := jsonb_build_object(
    'legalAccuracy', LEAST(20, v_decision_points),
    'hazardRecognition', LEAST(20, 10 + v_supporting_hit_count * 3),
    'evidenceQuality', LEAST(20, 6 + v_required_hit_count * 4),
    'clientProtection', 12,
    'underHaulProtection', LEAST(20, 10 + v_required_hit_count * 2),
    'professionalConduct', 12,
    'efficiency', CASE WHEN v_run.shift_units <= 3 THEN 8 ELSE 5 END
  );

  v_result := jsonb_build_object(
    'decision', p_decision,
    'categoryScores', v_category,
    'totalScore', v_total,
    'caughtFacts', COALESCE(v_solution.result_rules -> 'caughtFacts', '[]'::jsonb),
    'missedFacts', COALESCE(v_solution.result_rules -> 'missedFacts', '[]'::jsonb),
    'consequences', COALESCE(v_solution.result_rules -> 'consequences', '[]'::jsonb),
    'clues', COALESCE(v_solution.result_rules -> 'clues', '[]'::jsonb),
    'professionalNote', COALESCE(v_solution.result_rules ->> 'professionalNote', 'Report filed.')
  );

  UPDATE public.contract_case_runs
  SET
    status = 'completed',
    selected_flag_ids = p_flag_ids,
    decision = p_decision,
    justification = p_justification,
    result_summary = v_result,
    score = v_total,
    completed_at = now(),
    updated_at = now()
  WHERE id = p_run_id AND user_id = v_user_id;

  FOR v_outcome IN SELECT * FROM jsonb_array_elements(v_solution.persistent_outcomes)
  LOOP
    INSERT INTO public.contract_case_outcomes (run_id, user_id, case_id, outcome_key, outcome_data)
    VALUES (p_run_id, v_user_id, v_run.case_id, v_outcome ->> 'key', COALESCE(v_outcome -> 'data', '{}'::jsonb));
  END LOOP;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_contract_case(uuid, text, text[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_contract_case(uuid, text, text[], text) TO authenticated;
