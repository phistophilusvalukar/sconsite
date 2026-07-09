/*
  # Game application visibility

  Makes game rosters and applications visible to all authenticated players while
  keeping application processing restricted to the GM.
*/

DROP POLICY IF EXISTS "Users can read game applications" ON game_applications;

CREATE POLICY "Users can read game applications"
  ON game_applications FOR SELECT TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION enforce_game_application_status_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF EXISTS (
      SELECT 1
      FROM games
      WHERE games.id = NEW.game_id
      AND games.gm_id = auth.uid()::text
    ) THEN
      RETURN NEW;
    END IF;

    IF NEW.user_id = auth.uid()::text AND NEW.status IN ('Applied', 'Withdrawn') THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Only the GM can process applications';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_game_application_status_permissions_trigger ON game_applications;

CREATE TRIGGER enforce_game_application_status_permissions_trigger
  BEFORE UPDATE ON game_applications
  FOR EACH ROW
  EXECUTE FUNCTION enforce_game_application_status_permissions();
