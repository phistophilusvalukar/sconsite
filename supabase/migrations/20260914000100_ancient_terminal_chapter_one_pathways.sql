/* Server-authoritative Chapter 1 branching and Phase 2 handoff state. */
ALTER TABLE public.ancient_terminal_progress
  ADD COLUMN IF NOT EXISTS population_block_count integer NOT NULL DEFAULT 0 CHECK (population_block_count BETWEEN 0 AND 99),
  ADD COLUMN IF NOT EXISTS recovery_read boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS operator_archive_unlocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sentry_contacted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sentry_authorized boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS portal_discovered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS portal_open boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_alive boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS horror_alive boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS quarantine_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_shutdown_at timestamptz,
  ADD COLUMN IF NOT EXISTS instability_at timestamptz,
  ADD COLUMN IF NOT EXISTS phase_two_route text CHECK (phase_two_route IN ('phase_2a', 'phase_2b', 'phase_2c')),
  ADD COLUMN IF NOT EXISTS terminal_ending text CHECK (terminal_ending IN ('horror_lockout', 'ai_shutdown', 'simulation_collapse'));

CREATE OR REPLACE FUNCTION public.resolve_ancient_terminal_deadlines(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  /* The horror escapes after the AI is removed. */
  UPDATE public.ancient_terminal_progress
  SET portal_open = false, terminal_ending = 'horror_lockout', updated_at = now()
  WHERE user_id = p_user_id
    AND phase_two_route IS NULL AND terminal_ending IS NULL AND portal_open
    AND NOT ai_alive AND horror_alive
    AND coalesce(quarantine_expires_at, '-infinity'::timestamptz) <= now();

  /* The AI ends the world after the horror is removed. */
  UPDATE public.ancient_terminal_progress
  SET portal_open = false, terminal_ending = 'ai_shutdown', updated_at = now()
  WHERE user_id = p_user_id
    AND phase_two_route IS NULL AND terminal_ending IS NULL AND portal_open
    AND ai_alive AND NOT horror_alive
    AND coalesce(ai_shutdown_at, '-infinity'::timestamptz) <= now();

  /* With both processes gone, the unmaintained simulation collapses. */
  UPDATE public.ancient_terminal_progress
  SET portal_open = false, terminal_ending = 'simulation_collapse', updated_at = now()
  WHERE user_id = p_user_id
    AND phase_two_route IS NULL AND terminal_ending IS NULL AND portal_open
    AND NOT ai_alive AND NOT horror_alive
    AND coalesce(instability_at, '-infinity'::timestamptz) <= now();

  /* If both processes remain, an expired quarantine merely closes the portal. */
  UPDATE public.ancient_terminal_progress
  SET portal_open = false, quarantine_expires_at = NULL, updated_at = now()
  WHERE user_id = p_user_id
    AND phase_two_route IS NULL AND terminal_ending IS NULL
    AND ai_alive AND horror_alive
    AND quarantine_expires_at IS NOT NULL
    AND coalesce(quarantine_expires_at, '-infinity'::timestamptz) <= now();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_ancient_terminal_progress()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id uuid := auth.uid();
  progress_row public.ancient_terminal_progress%ROWTYPE;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  INSERT INTO public.ancient_terminal_progress (user_id) VALUES (actor_id) ON CONFLICT (user_id) DO NOTHING;
  PERFORM public.resolve_ancient_terminal_deadlines(actor_id);
  SELECT * INTO progress_row FROM public.ancient_terminal_progress WHERE user_id = actor_id;

  RETURN jsonb_build_object(
    'scriptFixed', progress_row.script_fixed,
    'eldritchAwakened', progress_row.eldritch_awakened,
    'helpUpdated', progress_row.help_updated,
    'cleanerFixed', progress_row.cleaner_fixed,
    'filesRestored', progress_row.files_restored,
    'aliases', progress_row.aliases,
    'populationBlocks', progress_row.population_block_count,
    'recoveryRead', progress_row.recovery_read,
    'operatorArchiveUnlocked', progress_row.operator_archive_unlocked,
    'sentryContacted', progress_row.sentry_contacted,
    'sentryAuthorized', progress_row.sentry_authorized,
    'portalDiscovered', progress_row.portal_discovered,
    'portalOpen', progress_row.portal_open,
    'aiAlive', progress_row.ai_alive,
    'horrorAlive', progress_row.horror_alive,
    'quarantineExpiresAt', progress_row.quarantine_expires_at,
    'aiShutdownAt', progress_row.ai_shutdown_at,
    'instabilityAt', progress_row.instability_at,
    'phaseTwoRoute', progress_row.phase_two_route,
    'terminalEnding', progress_row.terminal_ending
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_ancient_terminal_progress_command(p_action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id uuid := auth.uid();
  progress_row public.ancient_terminal_progress%ROWTYPE;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  INSERT INTO public.ancient_terminal_progress (user_id) VALUES (actor_id) ON CONFLICT (user_id) DO NOTHING;
  PERFORM public.resolve_ancient_terminal_deadlines(actor_id);
  SELECT * INTO progress_row FROM public.ancient_terminal_progress WHERE user_id = actor_id FOR UPDATE;

  IF p_action IN ('record_population_block', 'read_recovery', 'contact_sentry', 'authorize_sentry', 'quarantine_horror',
      'discover_portal', 'open_portal', 'purge_ai', 'purge_horror', 'enter_portal')
    AND (progress_row.phase_two_route IS NOT NULL OR progress_row.terminal_ending IS NOT NULL) THEN
    RAISE EXCEPTION 'Chapter 1 has already ended';
  END IF;

  IF p_action = 'fix_script' THEN
    UPDATE public.ancient_terminal_progress SET script_fixed = true, updated_at = now() WHERE user_id = actor_id;
  ELSIF p_action = 'awaken_eldritch' THEN
    UPDATE public.ancient_terminal_progress SET eldritch_awakened = true, updated_at = now()
    WHERE user_id = actor_id AND script_fixed;
  ELSIF p_action = 'update_help' THEN
    UPDATE public.ancient_terminal_progress SET help_updated = true, updated_at = now() WHERE user_id = actor_id;
  ELSIF p_action = 'fix_cleaner' THEN
    UPDATE public.ancient_terminal_progress SET cleaner_fixed = true, updated_at = now() WHERE user_id = actor_id;
  ELSIF p_action = 'restore_files' THEN
    UPDATE public.ancient_terminal_progress SET files_restored = true, updated_at = now()
    WHERE user_id = actor_id AND cleaner_fixed;
  ELSIF p_action = 'record_population_block' THEN
    UPDATE public.ancient_terminal_progress
    SET population_block_count = least(99, population_block_count + 1), updated_at = now()
    WHERE user_id = actor_id AND eldritch_awakened;
    IF NOT FOUND THEN RAISE EXCEPTION 'No blocked population output has been observed'; END IF;
  ELSIF p_action = 'read_recovery' THEN
    UPDATE public.ancient_terminal_progress
    SET recovery_read = true, operator_archive_unlocked = true, updated_at = now()
    WHERE user_id = actor_id AND files_restored;
    IF NOT FOUND THEN RAISE EXCEPTION 'recovery.tot is not readable'; END IF;
    INSERT INTO public.ancient_terminal_files (user_id, path, kind, contents)
    VALUES
      (actor_id, 'home/recovered', 'directory', NULL),
      (actor_id, 'home/recovered/forgot-again.tot', 'file', E'# reminders\n\ncd goes into a folder. dir shows stuff. i keep mixing those up.\nrun ouro BEFORE the file name. not after.\n\ncleaner finally works if i remember the colon. probably.\nTODO: learn what a dictionary is.\nTODO: stop editing the only copy.\n'),
      (actor_id, 'home/recovered/things-that-work.tot', 'file', E'# things that worked at least once\n\nclock never gets blocked. people always gets blocked.\ncopy a script before fixing it. i learned this four times.\n\nthere was a voice under the clock tonight. five words, maybe six.\nit said it was inside. then the line went dead.\ni tried writing back but i do not think TYPE sends anything.\n'),
      (actor_id, 'home/recovered/old_aliases.tot', 'file', E'# shortcuts because i type everything wrong\n\nalias clock - ouro C:\\ANCIENT\\SCRIPTS\\world_init.oro getTime\nalias people - ouro C:\\ANCIENT\\SCRIPTS\\world_init.oro getPop\nalias again - history\nalias goin - ouro portal.oro open\n'),
      (actor_id, 'home/recovered/hello_inside.oro', 'file', E'# it answered once when the clock rolled over\n\nfn knock(message):\n    packet = {"to": "inside", "body": message}\n    return portal.send(packet\n'),
      (actor_id, 'home/recovered/where-it-was.tot', 'file', E'portal was in  ███\\███████\\p░r▒a▓.oro\nnot deleted. hidden when the purple cursor crossed the listing.\nprotection thing said it could reconstruct the handle if the writer was contained.\ni did not trust it enough to say yes.\n')
    ON CONFLICT (user_id, path) DO NOTHING;
  ELSIF p_action = 'contact_sentry' THEN
    UPDATE public.ancient_terminal_progress SET sentry_contacted = true, updated_at = now()
    WHERE user_id = actor_id AND population_block_count >= 3 AND recovery_read;
    IF NOT FOUND THEN RAISE EXCEPTION 'SENTRY/9 contact conditions are incomplete'; END IF;
  ELSIF p_action = 'authorize_sentry' THEN
    UPDATE public.ancient_terminal_progress SET sentry_authorized = true, updated_at = now()
    WHERE user_id = actor_id AND sentry_contacted;
    IF NOT FOUND THEN RAISE EXCEPTION 'SENTRY/9 has not made contact'; END IF;
  ELSIF p_action = 'quarantine_horror' THEN
    UPDATE public.ancient_terminal_progress
    SET quarantine_expires_at = now() + interval '5 minutes', updated_at = now()
    WHERE user_id = actor_id AND sentry_authorized AND ai_alive AND horror_alive
      AND coalesce(quarantine_expires_at, '-infinity'::timestamptz) <= now();
    IF NOT FOUND THEN RAISE EXCEPTION 'Quarantine is unavailable'; END IF;
  ELSIF p_action = 'discover_portal' THEN
    UPDATE public.ancient_terminal_progress SET portal_discovered = true, updated_at = now()
    WHERE user_id = actor_id AND operator_archive_unlocked AND horror_alive AND quarantine_expires_at > now();
    IF NOT FOUND THEN RAISE EXCEPTION 'The portal trace is still concealed'; END IF;
  ELSIF p_action = 'open_portal' THEN
    UPDATE public.ancient_terminal_progress SET portal_open = true, updated_at = now()
    WHERE user_id = actor_id AND portal_discovered AND ai_alive AND horror_alive AND quarantine_expires_at > now();
    IF NOT FOUND THEN RAISE EXCEPTION 'The portal cannot be opened'; END IF;
  ELSIF p_action = 'purge_ai' THEN
    IF NOT progress_row.sentry_authorized OR NOT progress_row.ai_alive
      OR NOT progress_row.horror_alive OR coalesce(progress_row.quarantine_expires_at, '-infinity') <= now() THEN
      RAISE EXCEPTION 'SENTRY/9 cannot be purged now';
    END IF;
    UPDATE public.ancient_terminal_progress
    SET ai_alive = false,
        terminal_ending = CASE WHEN portal_open THEN terminal_ending ELSE 'horror_lockout' END,
        updated_at = now()
    WHERE user_id = actor_id;
  ELSIF p_action = 'purge_horror' THEN
    IF NOT progress_row.horror_alive OR coalesce(progress_row.quarantine_expires_at, '-infinity') <= now() THEN
      RAISE EXCEPTION 'The concealed process cannot be purged now';
    END IF;
    UPDATE public.ancient_terminal_progress
    SET horror_alive = false,
        terminal_ending = CASE WHEN portal_open THEN terminal_ending ELSE 'ai_shutdown' END,
        ai_shutdown_at = CASE WHEN portal_open AND ai_alive THEN now() + interval '90 seconds' ELSE ai_shutdown_at END,
        instability_at = CASE WHEN portal_open AND NOT ai_alive THEN now() + interval '2 minutes' ELSE instability_at END,
        updated_at = now()
    WHERE user_id = actor_id;
  ELSIF p_action = 'enter_portal' THEN
    IF NOT progress_row.portal_open THEN RAISE EXCEPTION 'No open portal is available'; END IF;
    UPDATE public.ancient_terminal_progress
    SET phase_two_route = CASE
          WHEN ai_alive AND NOT horror_alive AND ai_shutdown_at > now() THEN 'phase_2a'
          WHEN NOT ai_alive AND horror_alive AND quarantine_expires_at > now() THEN 'phase_2b'
          WHEN NOT ai_alive AND NOT horror_alive AND instability_at > now() THEN 'phase_2c'
          ELSE NULL
        END,
        updated_at = now()
    WHERE user_id = actor_id;
    IF NOT EXISTS (SELECT 1 FROM public.ancient_terminal_progress WHERE user_id = actor_id AND phase_two_route IS NOT NULL) THEN
      RAISE EXCEPTION 'The portal rejects entry in the current state';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unknown ancient terminal action';
  END IF;

  PERFORM public.resolve_ancient_terminal_deadlines(actor_id);
  RETURN public.get_ancient_terminal_progress();
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_ancient_terminal_deadlines(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_ancient_terminal_progress() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advance_ancient_terminal_progress_command(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ancient_terminal_progress() TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_ancient_terminal_progress_command(text) TO authenticated;
