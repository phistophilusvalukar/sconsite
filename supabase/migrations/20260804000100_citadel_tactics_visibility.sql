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
      'citadel-tactics',
      'campaign-objectives',
      'event',
      'skill-checks',
      'news'
    )
  );

INSERT INTO public.site_pages (page_key, is_enabled)
VALUES ('citadel-tactics', true)
ON CONFLICT (page_key) DO NOTHING;
