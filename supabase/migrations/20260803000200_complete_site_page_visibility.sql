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
      'arcana',
      'underhaul-contracts',
      'arcane-locks',
      'broken-seals',
      'campaign-objectives',
      'event',
      'skill-checks',
      'news'
    )
  );

INSERT INTO public.site_pages (page_key, is_enabled)
VALUES
  ('home', true),
  ('about', true),
  ('characters', true),
  ('citizens', true),
  ('guilds', true),
  ('schedule', true),
  ('games', true),
  ('arcana', true),
  ('underhaul-contracts', true),
  ('arcane-locks', true),
  ('broken-seals', true),
  ('campaign-objectives', true),
  ('event', true),
  ('skill-checks', true),
  ('news', true)
ON CONFLICT (page_key) DO NOTHING;
