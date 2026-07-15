ALTER TABLE public.contract_case_runs
  ADD COLUMN IF NOT EXISTS ruling text;

ALTER TABLE public.contract_case_runs
  DROP CONSTRAINT IF EXISTS contract_case_runs_ruling_check;

ALTER TABLE public.contract_case_runs
  ADD CONSTRAINT contract_case_runs_ruling_check
  CHECK (ruling IS NULL OR ruling IN ('approve', 'deny'));

UPDATE public.contract_case_runs
SET ruling = CASE
  WHEN decision IN ('approve', 'approved') THEN 'approve'
  WHEN decision IN ('deny', 'denied', 'approve_with_amendments', 'amendments_required', 'request_more_evidence', 'specialist_review', 'escalate_specialist') THEN 'deny'
  WHEN decision IN ('emergency_authorization', 'emergency_provisional') THEN 'approve'
  ELSE ruling
END
WHERE ruling IS NULL
  AND decision IS NOT NULL
  AND status = 'completed';

UPDATE public.contract_case_runs
SET decision = NULL
WHERE status <> 'completed'
  AND decision IN ('approve_with_amendments', 'request_more_evidence', 'escalate_specialist', 'emergency_provisional', 'amendments_required', 'specialist_review', 'emergency_authorization');

ALTER TABLE private.contract_case_solutions
  ADD COLUMN IF NOT EXISTS correct_ruling text,
  ADD COLUMN IF NOT EXISTS irrelevant_flag_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS misleading_flag_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS optional_discovery_ids text[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE private.contract_case_solutions
  DROP CONSTRAINT IF EXISTS contract_case_solutions_correct_ruling_check;

ALTER TABLE private.contract_case_solutions
  ADD CONSTRAINT contract_case_solutions_correct_ruling_check
  CHECK (correct_ruling IS NULL OR correct_ruling IN ('approve', 'deny'));

UPDATE private.contract_case_solutions
SET
  correct_ruling = 'deny',
  required_flag_ids = ARRAY['satchel-request-floor', 'satchel-employment-floor', 'satchel-request-contents'],
  supporting_flag_ids = ARRAY['satchel-item-company', 'satchel-item-personal', 'satchel-reg-floor-five'],
  critical_flag_ids = ARRAY[]::text[],
  irrelevant_flag_ids = ARRAY['satchel-reg-floor-four'],
  misleading_flag_ids = ARRAY[]::text[],
  optional_discovery_ids = ARRAY[]::text[],
  scoring_rules = '{"rulingAccuracy":40,"criticalEvidence":15,"supportingEvidence":20,"incorrectFlags":-2,"optionalDiscoveries":5,"efficiency":10}'::jsonb,
  result_rules = '{
    "resultTitleCorrectComplete":"Correct ruling, complete investigation",
    "resultTitleCorrectPartial":"Correct ruling, partial investigation",
    "resultTitleIncorrect":"Incorrect ruling, important evidence found",
    "correctComplete":"You correctly denied the request. The listed search floor conflicted with the surveyor assignment record, and the ownership clause improperly included personal belongings.",
    "correctPartial":"You correctly denied the request, though some supporting property evidence was missed.",
    "incorrect":"UnderHaul proceeded under paperwork that did not authorize the job as written.",
    "approve":"UnderHaul dispatched a crew using the wrong floor designation. The recovery was delayed, and the client ownership claim created a dispute over personal contents.",
    "deny":"The request is returned for corrected floor information and revised property terms.",
    "foundEvidence":["Floor mismatch identified.","Invalid ownership clause identified."],
    "missedEvidence":["The surveyor retains ownership of personal contents."],
    "incorrectEvidence":[],
    "unlockedClues":[]
  }'::jsonb
WHERE case_id = '11111111-1111-4111-8111-111111111111' AND case_version = 1;

UPDATE private.contract_case_solutions
SET
  correct_ruling = 'approve',
  required_flag_ids = ARRAY['tallow-emergency-authority', 'tallow-no-relic-rights'],
  supporting_flag_ids = ARRAY['tallow-home-risk', 'tallow-inheritance-disputed', 'tallow-creature-grade'],
  critical_flag_ids = ARRAY['tallow-fleeing-deeper'],
  irrelevant_flag_ids = ARRAY['tallow-owner-deceased'],
  misleading_flag_ids = ARRAY[]::text[],
  optional_discovery_ids = ARRAY['tallow-fleeing-deeper'],
  scoring_rules = '{"rulingAccuracy":40,"criticalEvidence":20,"supportingEvidence":15,"incorrectFlags":-2,"optionalDiscoveries":5,"efficiency":10}'::jsonb,
  result_rules = '{
    "resultTitleCorrectComplete":"Correct ruling, complete investigation",
    "resultTitleCorrectPartial":"Correct ruling, partial investigation",
    "resultTitleIncorrect":"Incorrect ruling, major emergency authority missed",
    "correctComplete":"You correctly approved the limited emergency containment request and recorded the deeper-floor warning.",
    "correctPartial":"You correctly approved emergency containment, though some supporting risk evidence was missed.",
    "incorrect":"The ruling blocked a legally limited emergency response that UnderHaul could perform as written.",
    "approve":"Containment and rescue proceed immediately. Relic recovery remains outside the job.",
    "deny":"Residents wait while paperwork is returned, even though the submitted emergency request was narrow enough to authorize containment.",
    "foundEvidence":["Emergency containment authority confirmed.","The request excludes relic recovery.","Deeper-floor pressure recorded."],
    "missedEvidence":["The creatures were fleeing something deeper."],
    "incorrectEvidence":[],
    "unlockedClues":["Deeper-floor pressure noted for a specialist queue."]
  }'::jsonb,
  persistent_outcomes = '[{"key":"tallow_deeper_threat","data":{"severity":"watch"}}]'::jsonb
WHERE case_id = '22222222-2222-4222-8222-222222222222' AND case_version = 1;

UPDATE private.contract_case_solutions
SET
  correct_ruling = 'deny',
  required_flag_ids = ARRAY['reliquary-rival-claim', 'reliquary-old-inscription', 'reliquary-new-inscription'],
  supporting_flag_ids = ARRAY['reliquary-deadline', 'reliquary-certification-valid', 'reliquary-repaired-seal'],
  critical_flag_ids = ARRAY['reliquary-new-inscription'],
  irrelevant_flag_ids = ARRAY['reliquary-low-value'],
  misleading_flag_ids = ARRAY['reliquary-exclusive-claim'],
  optional_discovery_ids = ARRAY['reliquary-broker-yorren'],
  scoring_rules = '{"rulingAccuracy":40,"criticalEvidence":20,"supportingEvidence":15,"incorrectFlags":-2,"optionalDiscoveries":5,"efficiency":10}'::jsonb,
  result_rules = '{
    "resultTitleCorrectComplete":"Correct ruling, complete investigation",
    "resultTitleCorrectPartial":"Correct ruling, partial investigation",
    "resultTitleIncorrect":"Incorrect ruling, major seal hazard missed",
    "correctComplete":"You correctly denied the reliquary request and identified the inscription conflict that makes the certified copy dangerous.",
    "correctPartial":"You correctly denied the reliquary request, though some supporting pressure signs were missed.",
    "incorrect":"The ruling allowed UnderHaul to proceed under a request with unresolved claim and seal hazards.",
    "approve":"UnderHaul disturbs a seal with conflicting certified wording before specialist review. The rival license dispute escalates immediately.",
    "deny":"Immediate retrieval is denied. The inscription packet is sent for Arcane Surveyor review before anyone disturbs the seal.",
    "foundEvidence":["Rival license prevents exclusive retrieval.","The inscription changed from closed to open.","The certified copy makes the discrepancy serious."],
    "missedEvidence":["The broker ledger includes a Yorren Vale connection."],
    "incorrectEvidence":[],
    "unlockedClues":["Vale & Rusk broker records mention Yorren Vale."]
  }'::jsonb,
  persistent_outcomes = '[{"key":"yorren_broker_thread","data":{"source":"quiet_reliquary"}}]'::jsonb
WHERE case_id = '33333333-3333-4333-8333-333333333333' AND case_version = 1;

CREATE OR REPLACE FUNCTION public.submit_contract_case_v2(
  p_run_id uuid,
  p_ruling text,
  p_flag_ids text[]
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
  v_critical_hit_count integer;
  v_incorrect_count integer;
  v_optional_count integer;
  v_correct_ruling boolean;
  v_categories jsonb;
  v_score integer;
  v_result_title text;
  v_result_summary text;
  v_result jsonb;
  v_outcome jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_ruling NOT IN ('approve', 'deny') THEN
    RAISE EXCEPTION 'Ruling must be approve or deny';
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

  IF NOT FOUND OR v_solution.correct_ruling IS NULL THEN
    RAISE EXCEPTION 'Binary solution not found';
  END IF;

  v_correct_ruling := p_ruling = v_solution.correct_ruling;

  SELECT count(*) INTO v_required_count FROM unnest(v_solution.required_flag_ids);
  SELECT count(*) INTO v_required_hit_count FROM unnest(v_solution.required_flag_ids) item(flag_id) WHERE item.flag_id = ANY(p_flag_ids);
  SELECT count(*) INTO v_supporting_hit_count FROM unnest(v_solution.supporting_flag_ids) item(flag_id) WHERE item.flag_id = ANY(p_flag_ids);
  SELECT count(*) INTO v_critical_hit_count FROM unnest(v_solution.critical_flag_ids) item(flag_id) WHERE item.flag_id = ANY(p_flag_ids);
  SELECT count(*) INTO v_incorrect_count FROM (
    SELECT unnest(v_solution.irrelevant_flag_ids) AS flag_id
    UNION ALL
    SELECT unnest(v_solution.misleading_flag_ids) AS flag_id
  ) item WHERE item.flag_id = ANY(p_flag_ids);
  SELECT count(*) INTO v_optional_count FROM unnest(v_solution.optional_discovery_ids) item(flag_id) WHERE item.flag_id = ANY(p_flag_ids);

  v_categories := jsonb_build_object(
    'rulingAccuracy', CASE WHEN v_correct_ruling THEN 40 ELSE 0 END,
    'criticalEvidence', LEAST(20, v_critical_hit_count * 10),
    'supportingEvidence', LEAST(15, v_required_hit_count * 5 + v_supporting_hit_count * 2),
    'incorrectFlags', GREATEST(-8, v_incorrect_count * -2),
    'optionalDiscoveries', LEAST(5, v_optional_count * 5),
    'efficiency', CASE WHEN v_run.shift_units <= 3 THEN 10 ELSE 6 END
  );

  v_score := GREATEST(0, LEAST(100,
    (v_categories ->> 'rulingAccuracy')::integer +
    (v_categories ->> 'criticalEvidence')::integer +
    (v_categories ->> 'supportingEvidence')::integer +
    (v_categories ->> 'incorrectFlags')::integer +
    (v_categories ->> 'optionalDiscoveries')::integer +
    (v_categories ->> 'efficiency')::integer
  ));

  v_result_title := CASE
    WHEN v_correct_ruling AND v_required_hit_count >= v_required_count THEN v_solution.result_rules ->> 'resultTitleCorrectComplete'
    WHEN v_correct_ruling THEN v_solution.result_rules ->> 'resultTitleCorrectPartial'
    ELSE v_solution.result_rules ->> 'resultTitleIncorrect'
  END;

  v_result_summary := CASE
    WHEN v_correct_ruling AND v_required_hit_count >= v_required_count THEN v_solution.result_rules ->> 'correctComplete'
    WHEN v_correct_ruling THEN v_solution.result_rules ->> 'correctPartial'
    ELSE v_solution.result_rules ->> 'incorrect'
  END;

  v_result := jsonb_build_object(
    'ruling', p_ruling,
    'correctRuling', v_correct_ruling,
    'score', v_score,
    'categories', v_categories,
    'foundEvidence', COALESCE(v_solution.result_rules -> 'foundEvidence', '[]'::jsonb),
    'missedEvidence', CASE WHEN v_required_hit_count >= v_required_count THEN '[]'::jsonb ELSE COALESCE(v_solution.result_rules -> 'missedEvidence', '[]'::jsonb) END,
    'incorrectEvidence', CASE WHEN v_incorrect_count > 0 THEN COALESCE(v_solution.result_rules -> 'incorrectEvidence', '[]'::jsonb) ELSE '[]'::jsonb END,
    'resultTitle', COALESCE(v_result_title, 'Contract report filed'),
    'resultSummary', COALESCE(v_result_summary, 'Report filed.'),
    'consequences', jsonb_build_array(COALESCE(v_solution.result_rules ->> p_ruling, 'No immediate consequence recorded.')),
    'unlockedClues', CASE WHEN v_optional_count > 0 THEN COALESCE(v_solution.result_rules -> 'unlockedClues', '[]'::jsonb) ELSE '[]'::jsonb END
  );

  UPDATE public.contract_case_runs
  SET
    status = 'completed',
    ruling = p_ruling,
    decision = p_ruling,
    selected_flag_ids = p_flag_ids,
    justification = NULL,
    result_summary = v_result,
    score = v_score,
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

REVOKE ALL ON FUNCTION public.submit_contract_case_v2(uuid, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_contract_case_v2(uuid, text, text[]) TO authenticated;
