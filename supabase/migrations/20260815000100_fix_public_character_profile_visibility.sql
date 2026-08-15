/*
  # Persist public character profile visibility reliably

  The legacy v3 profile command can finish its updates while returning false
  because its result is coupled to PostgreSQL's ambient FOUND state. The v4
  wrapper consequently skipped profile_is_public, while the client interpreted
  the false boolean as a successful RPC response.

  Verify ownership explicitly, let v3 continue to validate and write all visual
  settings, then authoritatively persist the visibility flag in the same
  transaction.
*/

CREATE OR REPLACE FUNCTION public.update_character_profile_v4_command(
  p_character_id uuid,
  p_profile jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_public boolean;
  v_row_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF jsonb_typeof(p_profile->'isPublic') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'Invalid public profile setting';
  END IF;
  v_is_public := (p_profile->>'isPublic')::boolean;

  IF NOT EXISTS (
    SELECT 1
    FROM public.characters
    WHERE id = p_character_id
      AND user_id = auth.uid()::text
  ) THEN
    RAISE EXCEPTION 'You do not own this character';
  END IF;

  -- v3 raises on invalid input. Its boolean result is not reliable because the
  -- legacy implementation returns a value derived from ambient FOUND state.
  PERFORM public.update_character_profile_v3_command(p_character_id, p_profile);

  PERFORM set_config('app.character_profile_visibility_write', 'allowed', true);
  UPDATE public.characters
  SET profile_is_public = v_is_public,
      updated_at = now()
  WHERE id = p_character_id
    AND user_id = auth.uid()::text;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  PERFORM set_config('app.character_profile_visibility_write', '', true);

  RETURN v_row_count = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.update_character_profile_v4_command(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_character_profile_v4_command(uuid, jsonb) TO authenticated;
