DO $$
BEGIN
  ALTER TYPE attendance_status ADD VALUE IF NOT EXISTS 'checked_in';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE attendance_status ADD VALUE IF NOT EXISTS 'no_show';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
