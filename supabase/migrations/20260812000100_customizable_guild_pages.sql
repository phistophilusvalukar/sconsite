/*
  # Customizable guild pages

  Adds visual identity, headquarters, layout, and roster naming fields. Profile
  changes and member promotions are exposed through leader-only command RPCs.
*/

ALTER TABLE guilds
  ADD COLUMN IF NOT EXISTS subtitle text DEFAULT '',
  ADD COLUMN IF NOT EXISTS emblem_url text,
  ADD COLUMN IF NOT EXISTS font_family text DEFAULT 'cinzel',
  ADD COLUMN IF NOT EXISTS font_color text DEFAULT '#f8fafc',
  ADD COLUMN IF NOT EXISTS base_color text DEFAULT '#171425',
  ADD COLUMN IF NOT EXISTS accent_color text DEFAULT '#d6a84b',
  ADD COLUMN IF NOT EXISTS layout_style text DEFAULT 'chronicle',
  ADD COLUMN IF NOT EXISTS headquarters_name text DEFAULT '',
  ADD COLUMN IF NOT EXISTS headquarters_title text DEFAULT '',
  ADD COLUMN IF NOT EXISTS headquarters_description text DEFAULT '',
  ADD COLUMN IF NOT EXISTS headquarters_image_url text,
  ADD COLUMN IF NOT EXISTS role_labels jsonb DEFAULT '{"Leader":"Guildmaster","Subleader":"Subleaders","Officer":"Officers","Member":"Members","Ally":"Allies"}'::jsonb;

UPDATE guilds
SET emblem_url = logo
WHERE emblem_url IS NULL AND logo IS NOT NULL;

ALTER TABLE guilds
  DROP CONSTRAINT IF EXISTS guilds_font_family_check,
  DROP CONSTRAINT IF EXISTS guilds_font_color_check,
  DROP CONSTRAINT IF EXISTS guilds_base_color_check,
  DROP CONSTRAINT IF EXISTS guilds_accent_color_check,
  DROP CONSTRAINT IF EXISTS guilds_layout_style_check;

ALTER TABLE guilds
  ADD CONSTRAINT guilds_font_family_check CHECK (font_family IN ('cinzel', 'cormorant', 'merriweather', 'inter')),
  ADD CONSTRAINT guilds_font_color_check CHECK (font_color ~ '^#[0-9A-Fa-f]{6}$'),
  ADD CONSTRAINT guilds_base_color_check CHECK (base_color ~ '^#[0-9A-Fa-f]{6}$'),
  ADD CONSTRAINT guilds_accent_color_check CHECK (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  ADD CONSTRAINT guilds_layout_style_check CHECK (layout_style IN ('chronicle', 'stronghold', 'banner'));

ALTER TABLE guild_memberships
  DROP CONSTRAINT IF EXISTS guild_memberships_role_category_check;

ALTER TABLE guild_memberships
  ADD CONSTRAINT guild_memberships_role_category_check
  CHECK (role_category IN ('Leader', 'Subleader', 'Officer', 'Member', 'Ally'));

DROP INDEX IF EXISTS idx_guild_memberships_one_core_guild_per_user;
CREATE UNIQUE INDEX idx_guild_memberships_one_core_guild_per_user
  ON guild_memberships(user_id)
  WHERE role_category IN ('Leader', 'Subleader', 'Officer', 'Member')
    AND membership_status = 'Active';

CREATE OR REPLACE FUNCTION update_guild_profile_command(p_guild_id uuid, p_profile jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_roles jsonb := COALESCE(p_profile->'roleLabels', '{}'::jsonb);
  v_font text := COALESCE(p_profile->>'fontFamily', 'cinzel');
  v_layout text := COALESCE(p_profile->>'layoutStyle', 'chronicle');
  v_font_color text := COALESCE(p_profile->>'fontColor', '#f8fafc');
  v_base_color text := COALESCE(p_profile->>'baseColor', '#171425');
  v_accent_color text := COALESCE(p_profile->>'accentColor', '#d6a84b');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM guilds WHERE id = p_guild_id AND leader_id = auth.uid()::text
  ) THEN
    RAISE EXCEPTION 'Only the guildmaster can customize this guild';
  END IF;

  IF length(trim(COALESCE(p_profile->>'name', ''))) NOT BETWEEN 2 AND 80 THEN
    RAISE EXCEPTION 'Guild name must be between 2 and 80 characters';
  END IF;

  IF v_font NOT IN ('cinzel', 'cormorant', 'merriweather', 'inter')
     OR v_layout NOT IN ('chronicle', 'stronghold', 'banner') THEN
    RAISE EXCEPTION 'Invalid guild presentation option';
  END IF;

  IF v_font_color !~ '^#[0-9A-Fa-f]{6}$'
     OR v_base_color !~ '^#[0-9A-Fa-f]{6}$'
     OR v_accent_color !~ '^#[0-9A-Fa-f]{6}$' THEN
    RAISE EXCEPTION 'Invalid guild color';
  END IF;

  IF jsonb_typeof(v_roles) <> 'object'
     OR COALESCE(length(trim(v_roles->>'Leader')), 0) NOT BETWEEN 1 AND 40
     OR COALESCE(length(trim(v_roles->>'Subleader')), 0) NOT BETWEEN 1 AND 40
     OR COALESCE(length(trim(v_roles->>'Officer')), 0) NOT BETWEEN 1 AND 40
     OR COALESCE(length(trim(v_roles->>'Member')), 0) NOT BETWEEN 1 AND 40
     OR COALESCE(length(trim(v_roles->>'Ally')), 0) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'Every roster tier needs a label';
  END IF;

  UPDATE guilds
  SET
    name = trim(p_profile->>'name'),
    subtitle = left(trim(COALESCE(p_profile->>'subtitle', '')), 140),
    description = left(trim(COALESCE(p_profile->>'description', '')), 4000),
    font_family = v_font,
    font_color = v_font_color,
    base_color = v_base_color,
    accent_color = v_accent_color,
    layout_style = v_layout,
    emblem_url = NULLIF(left(trim(COALESCE(p_profile->>'emblemUrl', '')), 2000), ''),
    headquarters_name = left(trim(COALESCE(p_profile->>'headquartersName', '')), 100),
    headquarters_title = left(trim(COALESCE(p_profile->>'headquartersTitle', '')), 140),
    headquarters_description = left(trim(COALESCE(p_profile->>'headquartersDescription', '')), 3000),
    headquarters_image_url = NULLIF(left(trim(COALESCE(p_profile->>'headquartersImageUrl', '')), 2000), ''),
    role_labels = jsonb_build_object(
      'Leader', trim(v_roles->>'Leader'),
      'Subleader', trim(v_roles->>'Subleader'),
      'Officer', trim(v_roles->>'Officer'),
      'Member', trim(v_roles->>'Member'),
      'Ally', trim(v_roles->>'Ally')
    ),
    updated_at = now()
  WHERE id = p_guild_id;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION update_guild_profile_command(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_guild_profile_command(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION update_guild_member_role_command(
  p_guild_id uuid,
  p_membership_id uuid,
  p_role_category text,
  p_role_title text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM guilds WHERE id = p_guild_id AND leader_id = auth.uid()::text
  ) THEN
    RAISE EXCEPTION 'Only the guildmaster can update roster roles';
  END IF;

  IF p_role_category NOT IN ('Subleader', 'Officer', 'Member', 'Ally') THEN
    RAISE EXCEPTION 'Invalid roster role';
  END IF;

  IF length(trim(COALESCE(p_role_title, ''))) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Role title must be between 1 and 80 characters';
  END IF;

  UPDATE guild_memberships
  SET
    role_category = p_role_category,
    role_title = trim(p_role_title),
    role = CASE WHEN p_role_category IN ('Subleader', 'Officer') THEN 'officer' ELSE 'member' END
  WHERE id = p_membership_id
    AND guild_id = p_guild_id
    AND role_category <> 'Leader';

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION update_guild_member_role_command(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_guild_member_role_command(uuid, uuid, text, text) TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('guild-assets', 'guild-assets', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Guildmasters can upload guild assets" ON storage.objects;
DROP POLICY IF EXISTS "Guildmasters can update guild assets" ON storage.objects;
DROP POLICY IF EXISTS "Guildmasters can delete guild assets" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read guild assets" ON storage.objects;

CREATE POLICY "Anyone can read guild assets"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'guild-assets');

CREATE POLICY "Guildmasters can upload guild assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'guild-assets'
    AND EXISTS (
      SELECT 1 FROM guilds
      WHERE guilds.id::text = (storage.foldername(name))[1]
        AND guilds.leader_id = auth.uid()::text
    )
  );

CREATE POLICY "Guildmasters can update guild assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'guild-assets'
    AND EXISTS (
      SELECT 1 FROM guilds
      WHERE guilds.id::text = (storage.foldername(name))[1]
        AND guilds.leader_id = auth.uid()::text
    )
  )
  WITH CHECK (
    bucket_id = 'guild-assets'
    AND EXISTS (
      SELECT 1 FROM guilds
      WHERE guilds.id::text = (storage.foldername(name))[1]
        AND guilds.leader_id = auth.uid()::text
    )
  );

CREATE POLICY "Guildmasters can delete guild assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'guild-assets'
    AND EXISTS (
      SELECT 1 FROM guilds
      WHERE guilds.id::text = (storage.foldername(name))[1]
        AND guilds.leader_id = auth.uid()::text
    )
  );
