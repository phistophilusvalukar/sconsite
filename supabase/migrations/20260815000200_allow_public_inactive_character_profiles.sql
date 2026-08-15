/*
  The earlier version of this unapplied migration attempted to rebuild the
  legacy public-profile RPC and exceeded PostgreSQL's function argument limit.
  Public pages continue to use get_public_character_profile; no replacement RPC
  is required here.
*/

NOTIFY pgrst, 'reload schema';
