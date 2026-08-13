/*
  # Custom guild section headings

  Guildmasters can rename the small labels and main headings used throughout
  their guild page. The existing wording remains the default for every guild.
  The v2 command wraps the authoritative profile command so all customization
  changes remain atomic and server validated.
*/

ALTER TABLE guilds
  ADD COLUMN IF NOT EXISTS section_headings jsonb NOT NULL DEFAULT '{
    "charterLabel":"Our charter",
    "charterTitle":"About the guild",
    "requirementsLabel":"Joining the order",
    "requirementsTitle":"Requirements",
    "headquartersLabel":"Headquarters",
    "rosterLabel":"People of the banner",
    "rosterTitle":"The roster",
    "messageBoardLabel":"Pinned by the guildmaster",
    "messageBoardTitle":"Message board",
    "checkInLabel":"Daily guild check-in",
    "checkInTitle":"Make your mark",
    "guestbookLabel":"At the headquarters door",
    "guestbookTitle":"Guild guestbook",
    "leaderLabel":"Guild leadership",
    "membershipLabel":"Your membership",
    "membershipTitle":"Your characters",
    "petitionLabel":"Join the story",
    "petitionTitle":"Petition the guild",
    "foundersLabel":"Founding roster",
    "foundersTitle":"Invite founders",
    "applicationsLabel":"Guildmaster''s desk",
    "applicationsTitle":"Applications"
  }'::jsonb;

CREATE OR REPLACE FUNCTION update_guild_profile_v2_command(p_guild_id uuid, p_profile jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_headings jsonb := COALESCE(p_profile->'sectionHeadings', '{}'::jsonb);
  v_updated boolean;
BEGIN
  IF jsonb_typeof(v_headings) <> 'object'
     OR (SELECT count(*) FROM jsonb_each(v_headings) WHERE key NOT IN (
       'charterLabel', 'charterTitle', 'requirementsLabel', 'requirementsTitle',
       'headquartersLabel', 'rosterLabel', 'rosterTitle', 'messageBoardLabel',
       'messageBoardTitle', 'checkInLabel', 'checkInTitle', 'guestbookLabel',
       'guestbookTitle', 'leaderLabel', 'membershipLabel', 'membershipTitle',
       'petitionLabel', 'petitionTitle', 'foundersLabel', 'foundersTitle',
       'applicationsLabel', 'applicationsTitle'
     )) > 0
     OR (SELECT count(*) FROM jsonb_each(v_headings) WHERE jsonb_typeof(value) <> 'string') > 0
     OR (SELECT count(*) FROM jsonb_each_text(v_headings) WHERE length(trim(value)) > 80) > 0 THEN
    RAISE EXCEPTION 'Invalid guild section headings';
  END IF;

  v_updated := update_guild_profile_command(p_guild_id, p_profile);

  UPDATE guilds
  SET section_headings = jsonb_build_object(
        'charterLabel', trim(COALESCE(v_headings->>'charterLabel', 'Our charter')),
        'charterTitle', trim(COALESCE(v_headings->>'charterTitle', 'About the guild')),
        'requirementsLabel', trim(COALESCE(v_headings->>'requirementsLabel', 'Joining the order')),
        'requirementsTitle', trim(COALESCE(v_headings->>'requirementsTitle', 'Requirements')),
        'headquartersLabel', trim(COALESCE(v_headings->>'headquartersLabel', 'Headquarters')),
        'rosterLabel', trim(COALESCE(v_headings->>'rosterLabel', 'People of the banner')),
        'rosterTitle', trim(COALESCE(v_headings->>'rosterTitle', 'The roster')),
        'messageBoardLabel', trim(COALESCE(v_headings->>'messageBoardLabel', 'Pinned by the guildmaster')),
        'messageBoardTitle', trim(COALESCE(v_headings->>'messageBoardTitle', 'Message board')),
        'checkInLabel', trim(COALESCE(v_headings->>'checkInLabel', 'Daily guild check-in')),
        'checkInTitle', trim(COALESCE(v_headings->>'checkInTitle', 'Make your mark')),
        'guestbookLabel', trim(COALESCE(v_headings->>'guestbookLabel', 'At the headquarters door')),
        'guestbookTitle', trim(COALESCE(v_headings->>'guestbookTitle', 'Guild guestbook')),
        'leaderLabel', trim(COALESCE(v_headings->>'leaderLabel', 'Guild leadership')),
        'membershipLabel', trim(COALESCE(v_headings->>'membershipLabel', 'Your membership')),
        'membershipTitle', trim(COALESCE(v_headings->>'membershipTitle', 'Your characters')),
        'petitionLabel', trim(COALESCE(v_headings->>'petitionLabel', 'Join the story')),
        'petitionTitle', trim(COALESCE(v_headings->>'petitionTitle', 'Petition the guild')),
        'foundersLabel', trim(COALESCE(v_headings->>'foundersLabel', 'Founding roster')),
        'foundersTitle', trim(COALESCE(v_headings->>'foundersTitle', 'Invite founders')),
        'applicationsLabel', trim(COALESCE(v_headings->>'applicationsLabel', 'Guildmaster''s desk')),
        'applicationsTitle', trim(COALESCE(v_headings->>'applicationsTitle', 'Applications'))
      ),
      updated_at = now()
  WHERE id = p_guild_id;

  RETURN v_updated AND FOUND;
END;
$$;

REVOKE ALL ON FUNCTION update_guild_profile_v2_command(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_guild_profile_v2_command(uuid, jsonb) TO authenticated;
