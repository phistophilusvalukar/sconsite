/* The legacy base upsert omits page_theme, so its column default must satisfy the Arcane-only constraint. */

ALTER TABLE public.player_shops
  ALTER COLUMN page_theme SET DEFAULT 'arcane';

UPDATE public.player_shops
SET page_theme = 'arcane'
WHERE page_theme IS DISTINCT FROM 'arcane';

NOTIFY pgrst, 'reload schema';
