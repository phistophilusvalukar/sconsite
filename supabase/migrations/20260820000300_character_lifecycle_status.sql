/*
  # Character lifecycle status

  Active characters can participate everywhere. Retired characters retain profiles
  and relationships but leave active-play rosters. Dead characters are forced to a
  public, read-only memorial profile and are excluded from relationships and play.
*/

ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS character_status text NOT NULL DEFAULT 'active';

ALTER TABLE public.characters
  DROP CONSTRAINT IF EXISTS characters_character_status_check;
ALTER TABLE public.characters
  ADD CONSTRAINT characters_character_status_check
  CHECK (character_status IN ('active', 'retired', 'dead'));

UPDATE public.characters
SET character_status = CASE WHEN is_active THEN 'active' ELSE 'retired' END;

CREATE INDEX IF NOT EXISTS characters_status_idx ON public.characters(character_status);
DROP INDEX IF EXISTS public.idx_characters_public_profiles;
CREATE INDEX idx_characters_public_profiles
  ON public.characters(id)
  WHERE profile_is_public = true;

-- Status is a protected canonical field. Character owners retain write access to
-- their ordinary character columns, while lifecycle changes use the admin command.
REVOKE INSERT, UPDATE ON public.characters FROM authenticated;
DO $$
DECLARE
  insert_columns text;
  update_columns text;
BEGIN
  SELECT string_agg(quote_ident(columns.column_name), ', ' ORDER BY columns.ordinal_position)
  INTO insert_columns
  FROM information_schema.columns
  WHERE columns.table_schema = 'public'
    AND columns.table_name = 'characters'
    AND columns.column_name NOT IN ('id', 'character_status', 'is_active', 'profile_is_public');

  SELECT string_agg(quote_ident(columns.column_name), ', ' ORDER BY columns.ordinal_position)
  INTO update_columns
  FROM information_schema.columns
  WHERE columns.table_schema = 'public'
    AND columns.table_name = 'characters'
    AND columns.column_name NOT IN (
      'id', 'character_status', 'is_active', 'profile_is_public', 'created_at'
    );

  EXECUTE 'GRANT INSERT (' || insert_columns || ') ON public.characters TO authenticated';
  EXECUTE 'GRANT UPDATE (' || update_columns || ') ON public.characters TO authenticated';
END;
$$;

DROP POLICY IF EXISTS "Users can read active character summaries" ON public.characters;
CREATE POLICY "Users can read active and retired character summaries"
  ON public.characters FOR SELECT TO authenticated
  USING (character_status IN ('active', 'retired') OR user_id = auth.uid()::text);

DROP POLICY IF EXISTS "Owners read pending and public reads confirmed relationships" ON public.character_relationships;
CREATE POLICY "Owners read pending and public reads confirmed relationships"
  ON public.character_relationships FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.characters
      WHERE characters.id IN (
        character_relationships.source_character_id,
        character_relationships.target_character_id
      )
        AND characters.user_id = auth.uid()::text
    )
    OR (
      character_relationships.confirmed_at IS NOT NULL
      AND character_relationships.source_approved = true
      AND character_relationships.target_approved = true
      AND EXISTS (
        SELECT 1 FROM public.characters source_character
        WHERE source_character.id = character_relationships.source_character_id
          AND source_character.character_status IN ('active', 'retired')
      )
      AND EXISTS (
        SELECT 1 FROM public.characters target_character
        WHERE target_character.id = character_relationships.target_character_id
          AND target_character.character_status IN ('active', 'retired')
      )
    )
  );

CREATE OR REPLACE FUNCTION public.guard_character_profile_visibility_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_visibility_changed boolean;
BEGIN
  IF NEW.character_status = 'dead' AND NEW.profile_is_public = false THEN
    RAISE EXCEPTION 'Dead characters must retain a public memorial profile'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_visibility_changed := NEW.profile_is_public;
  ELSE
    v_visibility_changed := NEW.profile_is_public IS DISTINCT FROM OLD.profile_is_public;
  END IF;

  IF v_visibility_changed
     AND COALESCE(current_setting('app.character_profile_visibility_write', true), '') <> 'allowed' THEN
    RAISE EXCEPTION 'Character profile visibility must be changed through the protected command'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- Remove existing non-active characters from pending game and guild applications.
DELETE FROM public.game_applications application
WHERE NOT EXISTS (
  SELECT 1
  FROM unnest(application.character_ids) character_id
  JOIN public.characters character ON character.id = character_id
  WHERE character.character_status = 'active'
    AND character.user_id = application.user_id
);

UPDATE public.game_applications application
SET character_ids = ARRAY(
      SELECT character_id
      FROM unnest(application.character_ids) character_id
      JOIN public.characters character ON character.id = character_id
      WHERE character.character_status = 'active'
        AND character.user_id = application.user_id
    ),
    locked_character_id = CASE
      WHEN EXISTS (
        SELECT 1 FROM public.characters character
        WHERE character.id = application.locked_character_id
          AND character.character_status = 'active'
      ) THEN application.locked_character_id
      ELSE NULL
    END,
    updated_at = now()
WHERE EXISTS (
  SELECT 1
  FROM unnest(application.character_ids) character_id
  LEFT JOIN public.characters character ON character.id = character_id
  WHERE character.id IS NULL
     OR character.character_status <> 'active'
     OR character.user_id <> application.user_id
);

UPDATE public.guild_applications application
SET status = 'Withdrawn', updated_at = now()
FROM public.characters character
WHERE application.character_id = character.id
  AND application.status = 'Pending'
  AND character.character_status <> 'active';

CREATE OR REPLACE FUNCTION public.enforce_active_game_application_characters()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF cardinality(NEW.character_ids) = 0 OR EXISTS (
    SELECT 1
    FROM unnest(NEW.character_ids) character_id
    LEFT JOIN public.characters character ON character.id = character_id
    WHERE character.id IS NULL
       OR character.user_id <> NEW.user_id
       OR character.character_status <> 'active'
  ) THEN
    RAISE EXCEPTION 'Game applications may only use active characters owned by the applicant';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_active_game_application_characters_trigger ON public.game_applications;
CREATE TRIGGER enforce_active_game_application_characters_trigger
  BEFORE INSERT OR UPDATE OF character_ids, user_id ON public.game_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_active_game_application_characters();

CREATE OR REPLACE FUNCTION public.enforce_active_guild_character()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.character_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.characters character
    WHERE character.id = NEW.character_id
      AND character.user_id = NEW.user_id
      AND character.character_status = 'active'
  ) THEN
    RAISE EXCEPTION 'Guild applications and memberships require an active character owned by the user';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_active_guild_application_character_trigger ON public.guild_applications;
CREATE TRIGGER enforce_active_guild_application_character_trigger
  BEFORE INSERT OR UPDATE OF character_id, user_id ON public.guild_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_active_guild_character();

DROP TRIGGER IF EXISTS enforce_active_guild_membership_character_trigger ON public.guild_memberships;
CREATE TRIGGER enforce_active_guild_membership_character_trigger
  BEFORE INSERT OR UPDATE OF character_id, user_id ON public.guild_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_active_guild_character();

CREATE OR REPLACE FUNCTION public.set_db_admin_character_status_command(
  p_password text,
  p_character_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  character_name text;
BEGIN
  PERFORM public.require_db_admin_password(p_password);
  IF p_status NOT IN ('active', 'retired', 'dead') THEN
    RAISE EXCEPTION 'Invalid character status';
  END IF;

  PERFORM set_config('app.character_profile_visibility_write', 'allowed', true);
  UPDATE public.characters
  SET character_status = p_status,
      is_active = p_status = 'active',
      profile_is_public = CASE WHEN p_status = 'dead' THEN true ELSE profile_is_public END,
      updated_at = now()
  WHERE id = p_character_id
  RETURNING name INTO character_name;
  PERFORM set_config('app.character_profile_visibility_write', '', true);
  IF character_name IS NULL THEN RAISE EXCEPTION 'Character not found'; END IF;

  IF p_status <> 'active' THEN
    DELETE FROM public.game_applications application
    WHERE p_character_id = ANY(application.character_ids)
      AND NOT EXISTS (
        SELECT 1 FROM unnest(application.character_ids) character_id
        WHERE character_id <> p_character_id
      );
    UPDATE public.game_applications
    SET character_ids = array_remove(character_ids, p_character_id),
        locked_character_id = CASE WHEN locked_character_id = p_character_id THEN NULL ELSE locked_character_id END,
        updated_at = now()
    WHERE p_character_id = ANY(character_ids);

    UPDATE public.guild_applications
    SET status = 'Withdrawn', updated_at = now()
    WHERE character_id = p_character_id AND status = 'Pending';
  END IF;

  INSERT INTO public.db_admin_audit_log (actor_id, action, entity_type, entity_id, details)
  VALUES (auth.uid()::text, 'set_status', 'character', p_character_id::text, jsonb_build_object(
    'name', character_name,
    'status', p_status
  ));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_db_admin_snapshot_command(p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.require_db_admin_password(p_password);
  RETURN jsonb_build_object(
    'users', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'userId', users.auth_user_id, 'username', users.username, 'email', users.email,
        'avatar', COALESCE(NULLIF(users.avatar, ''), '/npc-placeholder.png'),
        'isAdmin', users.is_admin, 'isLoremaster', users.is_loremaster,
        'isBanned', users.is_banned, 'bannedAt', users.banned_at
      ) ORDER BY users.username), '[]'::jsonb) FROM public.users
    ),
    'characters', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', characters.id, 'name', characters.name, 'className', characters.class,
        'level', COALESCE(characters.level, 1), 'ownerId', characters.user_id,
        'ownerName', COALESCE(users.username, 'Unknown user'),
        'status', characters.character_status
      ) ORDER BY characters.name), '[]'::jsonb)
      FROM public.characters LEFT JOIN public.users ON users.auth_user_id = characters.user_id
    ),
    'guilds', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', guilds.id, 'name', guilds.name, 'leaderId', guilds.leader_id,
        'leaderName', COALESCE(users.username, 'Unknown user'),
        'memberCount', COALESCE(guilds.member_count, 0)
      ) ORDER BY guilds.name), '[]'::jsonb)
      FROM public.guilds LEFT JOIN public.users ON users.auth_user_id = guilds.leader_id
    ),
    'loreEntries', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', lore_entries.id, 'title', lore_entries.title,
        'status', lore_entries.status, 'authorName', lore_entries.author_name
      ) ORDER BY lore_entries.title), '[]'::jsonb) FROM public.lore_entries
    )
  );
END;
$$;

ALTER FUNCTION public.get_public_character_profile(uuid)
  RENAME TO get_public_character_profile_without_lifecycle_status;

CREATE FUNCTION public.get_public_character_profile(p_character_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT CASE
    WHEN base.payload IS NULL THEN NULL
    ELSE jsonb_set(
      jsonb_set(
        jsonb_set(base.payload, '{character,character_status}', to_jsonb(character.character_status), true),
        '{relationships}', relationship_data.relationships, true
      ),
      '{relatedCharacterNames}', relationship_data.related_names, true
    )
  END
  FROM public.characters character
  CROSS JOIN LATERAL (
    SELECT public.get_public_character_profile_without_lifecycle_status(character.id) AS payload
  ) base
  CROSS JOIN LATERAL (
    SELECT
      CASE WHEN character.character_status = 'dead'
        OR NOT COALESCE((character.profile_section_visibility->>'relationships')::boolean, true)
      THEN '[]'::jsonb
      ELSE COALESCE(jsonb_agg(jsonb_build_object(
        'id', relationship.id,
        'sourceCharacterId', relationship.source_character_id,
        'targetCharacterId', relationship.target_character_id,
        'name', relationship.relationship_name,
        'tag', relationship.relationship_tag,
        'sentiment', relationship.sentiment_value,
        'sourceApproved', true,
        'targetApproved', true,
        'confirmedAt', relationship.confirmed_at,
        'createdAt', relationship.created_at,
        'updatedAt', relationship.updated_at
      ) ORDER BY relationship.created_at), '[]'::jsonb) END AS relationships,
      CASE WHEN character.character_status = 'dead'
        OR NOT COALESCE((character.profile_section_visibility->>'relationships')::boolean, true)
      THEN '{}'::jsonb
      ELSE COALESCE(jsonb_object_agg(related.id::text, related.name)
        FILTER (WHERE related.id IS NOT NULL), '{}'::jsonb) END AS related_names
    FROM public.character_relationships relationship
    JOIN public.characters related ON related.id = CASE
      WHEN relationship.source_character_id = character.id THEN relationship.target_character_id
      ELSE relationship.source_character_id
    END
    WHERE character.id IN (relationship.source_character_id, relationship.target_character_id)
      AND relationship.confirmed_at IS NOT NULL
      AND relationship.source_approved = true
      AND relationship.target_approved = true
      AND related.profile_is_public = true
      AND related.character_status IN ('active', 'retired')
  ) relationship_data;
$$;

REVOKE ALL ON FUNCTION public.set_db_admin_character_status_command(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_db_admin_character_status_command(text, uuid, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.get_public_character_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_character_profile(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
