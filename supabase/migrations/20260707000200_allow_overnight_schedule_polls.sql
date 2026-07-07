/*
  # Allow overnight scheduling poll windows

  A poll from 6:00 PM to 1:00 AM should be treated as an evening window that
  continues into the following morning, so end_minutes may be less than or equal
  to start_minutes.
*/

DO $$
DECLARE
  constraint_record record;
BEGIN
  FOR constraint_record IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'schedule_polls'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%end_minutes > start_minutes%'
  LOOP
    EXECUTE format('ALTER TABLE schedule_polls DROP CONSTRAINT %I', constraint_record.conname);
  END LOOP;
END $$;
