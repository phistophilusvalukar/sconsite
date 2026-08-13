import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, Menu, X } from 'lucide-react';
import { adminPage, sitePages, type SitePageDefinition, type SitePageKey } from '../config/sitePages';
import { useAuth } from '../context/useAuth';
import { usePageVisibility } from '../context/usePageVisibility';
import GoogleLogin from './GoogleLogin';

type PreloadableRoute = '/' | '/about' | '/lore' | '/characters' | '/citizens' | '/guilds' | '/schedule' | '/games' | '/arcana' | '/underhaul/contracts' | '/arcane-locks' | '/broken-seals' | '/citadel-tactics' | '/tactical-puzzles' | '/campaign-objectives' | '/event' | '/skill-checks' | '/news' | '/profile' | '/admin';

const routePreloaders: Record<PreloadableRoute, () => Promise<unknown>> = {
  '/': () => import('../pages/HomePage'),
  '/about': () => import('../pages/AboutPage'),
  '/lore': () => import('../pages/LorePage'),
  '/characters': () => import('../pages/CharacterPage'),
  '/citizens': () => import('../pages/CitizenRegistryPage'),
  '/guilds': () => import('../pages/GuildsPage'),
  '/schedule': () => import('../pages/SchedulePage'),
  '/games': () => import('../pages/GamesPage'),
  '/arcana': () => import('../pages/CardGamePage'),
  '/underhaul/contracts': () => import('../features/contracts/routes/ContractsOfficePage'),
  '/arcane-locks': () => import('../features/arcane-locks/routes/ArcaneLocksPage'),
  '/broken-seals': () => import('../features/broken-seals/routes/BrokenSealsPage'),
  '/citadel-tactics': () => import('../features/hellknight-autobattler/routes/HellknightAutobattlerPage'),
  '/tactical-puzzles': () => import('../features/tactical-puzzles/routes/TacticalPuzzlesPage'),
  '/campaign-objectives': () => import('../features/campaign-objectives/routes/CampaignObjectivesPage'),
  '/event': () => import('../pages/EventPage'),
  '/skill-checks': () => import('../pages/SkillChecksPage'),
  '/news': () => import('../pages/NewsPage'),
  '/profile': () => import('../pages/ProfilePage'),
  '/admin': () => import('../pages/AdminPage')
};

const preloadedRoutes = new Set<string>();

function preloadRoute(href: PreloadableRoute) {
  if (preloadedRoutes.has(href)) return;
  preloadedRoutes.add(href);
  routePreloaders[href]().catch(() => preloadedRoutes.delete(href));
}

type NavigationGroup = { name: string; pageKeys: SitePageKey[] };
type NavigationItem = Pick<SitePageDefinition, 'name' | 'href' | 'icon'>;

const navigationGroups: NavigationGroup[] = [
  { name: 'Discover', pageKeys: ['home', 'about', 'lore', 'news'] },
  { name: 'People', pageKeys: ['characters', 'guilds', 'citizens'] },
  { name: 'Play', pageKeys: ['schedule', 'games'] },
  { name: 'Arcades', pageKeys: ['arcana', 'underhaul-contracts', 'arcane-locks', 'broken-seals', 'citadel-tactics'] },
  { name: 'Tactics', pageKeys: ['tactical-puzzles'] },
  { name: 'Tools', pageKeys: ['skill-checks', 'campaign-objectives', 'event'] }
];

const Header: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();
  const { isPageEnabled } = usePageVisibility();
  const isAdmin = Boolean(user?.isAdmin || user?.profile?.isAdmin);
  const BrandIcon = adminPage.icon;

  const navigation = sitePages.filter(page => isAdmin || isPageEnabled(page.key));
  const navigationByKey = new Map(navigation.map(page => [page.key, page]));
  const groupedNavigation = navigationGroups
    .map(group => ({
      ...group,
      items: group.pageKeys
        .map(pageKey => navigationByKey.get(pageKey))
        .filter((page): page is SitePageDefinition => Boolean(page))
    }))
    .filter(group => group.items.length > 0);
  const adminNavigation: NavigationItem[] = isAdmin ? [adminPage] : [];

  return (
    <header className="site-header">
      <nav className="site-nav" aria-label="Primary navigation">
        <div className="site-nav-row">
          <Link to="/" className="site-brand" onMouseEnter={() => preloadRoute('/')}>
            <span className="site-brand-mark"><BrandIcon /></span>
            <span className="site-brand-copy"><strong>SCON</strong><small>Living world registry</small></span>
          </Link>

          <div className="site-nav-desktop">
            {groupedNavigation.map(group => {
              const isActiveGroup = group.items.some(item => isNavigationActive(item.href, location.pathname));
              return (
                <div className="site-nav-group" key={group.name} onFocus={() => preloadRoutes(group.items)} onMouseEnter={() => preloadRoutes(group.items)}>
                  <button type="button" className={`site-nav-group-trigger${isActiveGroup ? ' is-active' : ''}`} aria-haspopup="menu">
                    <span>{group.name}</span><ChevronDown />
                  </button>
                  <div className="site-nav-menu" role="menu">
                    <span className="site-nav-menu-label">{group.name}</span>
                    {group.items.map(item => <NavigationMenuLink key={item.name} item={item} pathname={location.pathname} />)}
                  </div>
                </div>
              );
            })}

            {adminNavigation.map(item => {
              const Icon = item.icon;
              return (
                <Link key={item.name} to={item.href} className={`site-nav-direct${isNavigationActive(item.href, location.pathname) ? ' is-active' : ''}`} onMouseEnter={() => preloadRoute(item.href as PreloadableRoute)}>
                  <Icon /><span>{item.name}</span>
                </Link>
              );
            })}

            {isAuthenticated ? (
              <Link to="/profile" className={`site-profile-link${location.pathname.startsWith('/profile') ? ' is-active' : ''}`} onMouseEnter={() => preloadRoute('/profile')}>
                <img src={user?.avatar || '/npc-placeholder.png'} alt="" />
                <span><small>Signed in as</small><strong>{user?.username}</strong></span>
              </Link>
            ) : <GoogleLogin />}
          </div>

          <button type="button" onClick={() => setIsMenuOpen(!isMenuOpen)} className="site-menu-toggle" aria-expanded={isMenuOpen} aria-label={isMenuOpen ? 'Close navigation' : 'Open navigation'}>
            {isMenuOpen ? <X /> : <Menu />}
          </button>
        </div>

        {isMenuOpen && (
          <div className="site-mobile-panel">
            {groupedNavigation.map(group => (
              <div className="site-mobile-group" key={group.name}>
                <p>{group.name}</p>
                <div>{group.items.map(item => <MobileNavigationLink key={item.name} item={item} pathname={location.pathname} onNavigate={() => setIsMenuOpen(false)} />)}</div>
              </div>
            ))}
            {adminNavigation.map(item => <MobileNavigationLink key={item.name} item={item} pathname={location.pathname} onNavigate={() => setIsMenuOpen(false)} />)}
            <div className="site-mobile-account">
              {isAuthenticated ? (
                <Link to="/profile" onClick={() => setIsMenuOpen(false)}>
                  <img src={user?.avatar || '/npc-placeholder.png'} alt="" /><span><small>Account</small><strong>{user?.username}</strong></span>
                </Link>
              ) : <GoogleLogin />}
            </div>
          </div>
        )}
      </nav>
    </header>
  );
};

function preloadRoutes(items: NavigationItem[]) {
  items.forEach(item => preloadRoute(item.href as PreloadableRoute));
}

function NavigationMenuLink({ item, pathname }: { item: NavigationItem; pathname: string }) {
  const Icon = item.icon;
  const isActive = isNavigationActive(item.href, pathname);
  return (
    <Link to={item.href} className={`site-nav-menu-link${isActive ? ' is-active' : ''}`} onFocus={() => preloadRoute(item.href as PreloadableRoute)} onMouseEnter={() => preloadRoute(item.href as PreloadableRoute)} role="menuitem">
      <Icon /><span>{item.name}</span>
    </Link>
  );
}

function MobileNavigationLink({ item, pathname, onNavigate }: { item: NavigationItem; pathname: string; onNavigate: () => void }) {
  const Icon = item.icon;
  return (
    <Link to={item.href} className={`site-mobile-link${isNavigationActive(item.href, pathname) ? ' is-active' : ''}`} onFocus={() => preloadRoute(item.href as PreloadableRoute)} onClick={onNavigate}>
      <Icon /><span>{item.name}</span>
    </Link>
  );
}

function isNavigationActive(href: string, pathname: string) {
  if (href === '/') return pathname === '/';
  if (href === '/skill-checks') return pathname.startsWith('/skill-checks') || pathname.startsWith('/lock-challenge');
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default Header;
