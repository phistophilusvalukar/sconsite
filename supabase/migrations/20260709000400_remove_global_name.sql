/*
  Remove duplicate user display-name storage.

  The app now treats users.username as the editable display name. Preserve any
  global_name value only for rows that somehow have a blank username, then drop
  the redundant column.
*/

UPDATE users
SET username = global_name
WHERE global_name IS NOT NULL
  AND btrim(global_name) <> ''
  AND btrim(username) = '';

ALTER TABLE users
  DROP COLUMN IF EXISTS global_name;
