-- SW-40 proof migration: verifies deploy-time migrations apply automatically.
-- Intentionally zero-effect: raises a notice only, changes no schema or data.
DO $$
BEGIN
  RAISE NOTICE 'SW-40 auto-migration proof: deploy-time runner reached this file';
END $$;
