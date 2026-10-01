-- Format 16 adds the independent portfolio collection to the backup envelope.
-- The covered commercial sources and their history protocol remain identical.
-- Extend only the supported envelope version; preserve the existing restore body,
-- authority checks, lineage rules and function grants. Fail on unexpected drift.
DO $migration$
DECLARE
  definition text;
  old_guard text := $guard$!~ '^(1|2|3|4|5|6|7|8|9|10|11|12|13|14|15)$'$guard$;
  new_guard text := $guard$!~ '^(1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16)$'$guard$;
BEGIN
  definition := pg_get_functiondef('public.restore_commercial_history(jsonb)'::regprocedure);
  IF strpos(definition, old_guard) = 0 THEN
    RAISE EXCEPTION 'Portfolio backup upgrade requires the verified format-15 restore function';
  END IF;
  EXECUTE replace(definition, old_guard, new_guard);
END;
$migration$;
