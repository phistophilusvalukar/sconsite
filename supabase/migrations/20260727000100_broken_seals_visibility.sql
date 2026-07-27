ALTER TABLE public.site_pages
  DROP CONSTRAINT IF EXISTS site_pages_known_page_key;

ALTER TABLE public.site_pages
  ADD CONSTRAINT site_pages_known_page_key CHECK (
    page_key IN (
      'home',
      'about',
      'characters',
      'citizens',
      'guilds',
      'schedule',
      'games',
      'underhaul-contracts',
      'arcane-locks',
      'broken-seals',
      'event',
      'skill-checks',
      'news'
    )
  );

INSERT INTO public.site_pages (page_key, is_enabled)
VALUES
  ('arcane-locks', true),
  ('broken-seals', true)
ON CONFLICT (page_key) DO NOTHING;
