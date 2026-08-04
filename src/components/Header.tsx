import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, Menu, X } from 'lucide-react';
import { adminPage, sitePages, type SitePageDefinition, type SitePageKey } from '../config/sitePages';
import { useAuth } from '../context/useAuth';
import { usePageVisibility } from '../context/usePageVisibility';
import GoogleLogin from './GoogleLogin';

type PreloadableRoute = '/' | '/about' | '/characters' | '/citizens' | '/guilds' | '/schedule' | '/games' | '/arcana' | '/underhaul/contracts' | '/arcane-locks' | '/broken-seals' | '/citadel-tactics' | '/campaign-objectives' | '/event' | '/skill-checks' | '/news' | '/profile' | '/admin';

const routePreloaders: Record<PreloadableRoute, () => Promise<unknown>> = {
  '/': () => import('../pages/HomePage'),
  '/about': () => import('../pages/AboutPage'),
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
  routePreloaders[href]().catch(() => {
    preloadedRoutes.delete(href);
  });
}

type NavigationGroup = {
  name: string;
  pageKeys: SitePageKey[];
};

type NavigationItem = Pick<SitePageDefinition, 'name' | 'href' | 'icon'>;

const navigationGroups: NavigationGroup[] = [
  { name: 'Discover', pageKeys: ['home', 'about', 'news'] },
  { name: 'People', pageKeys: ['characters', 'guilds', 'citizens'] },
  { name: 'Play', pageKeys: ['schedule', 'games'] },
  { name: 'Arcades', pageKeys: ['arcana', 'underhaul-contracts', 'arcane-locks', 'broken-seals', 'citadel-tactics'] },
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
    <header className="bg-midnight-900/90 backdrop-blur-sm border-b border-fantasy-800/50 sticky top-0 z-50">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex items-center space-x-2">
              <BrandIcon className="w-8 h-8 text-yellow-400" />
              <span className="font-fantasy text-xl font-bold text-white">
                Westmarch
              </span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden 2xl:flex items-center space-x-1">
            {groupedNavigation.map((group) => {
              const isActiveGroup = group.items.some(item => isNavigationActive(item.href, location.pathname));
              return (
                <div
                  className="relative group"
                  key={group.name}
                  onFocus={() => preloadRoutes(group.items)}
                  onMouseEnter={() => preloadRoutes(group.items)}
                  onTouchStart={() => preloadRoutes(group.items)}
                >
                  <button
                    type="button"
                    className={`flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActiveGroup
                        ? 'text-yellow-400 bg-fantasy-800/30'
                        : 'text-gray-300 hover:text-yellow-400 hover:bg-fantasy-800/20'
                    }`}
                    aria-haspopup="menu"
                  >
                    <span>{group.name}</span>
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <div className="invisible absolute left-0 top-full z-50 mt-2 min-w-56 rounded-md border border-fantasy-700/70 bg-midnight-900/95 p-2 opacity-0 shadow-xl shadow-black/30 backdrop-blur-sm transition-all group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                    {group.items.map((item) => (
                      <NavigationMenuLink
                        key={item.name}
                        item={item}
                        pathname={location.pathname}
                      />
                    ))}
                  </div>
                </div>
              );
            })}

            {adminNavigation.map((item) => {
              const Icon = item.icon;
              const isActive = isNavigationActive(item.href, location.pathname);
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onFocus={() => preloadRoute(item.href as PreloadableRoute)}
                  onMouseEnter={() => preloadRoute(item.href as PreloadableRoute)}
                  onTouchStart={() => preloadRoute(item.href as PreloadableRoute)}
                  className={`flex items-center space-x-1 px-2 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'text-yellow-400 bg-fantasy-800/30'
                      : 'text-gray-300 hover:text-yellow-400 hover:bg-fantasy-800/20'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
            
            {isAuthenticated ? (
              <Link
                to="/profile"
                onFocus={() => preloadRoute('/profile')}
                onMouseEnter={() => preloadRoute('/profile')}
                onTouchStart={() => preloadRoute('/profile')}
                className="flex items-center space-x-2 px-3 py-2 bg-fantasy-700 hover:bg-fantasy-600 text-white rounded-md transition-colors"
              >
                <img
                  src={user?.avatar || '/npc-placeholder.png'}
                  alt="Profile"
                  className="w-6 h-6 rounded-full"
                />
                <span>{user?.username}</span>
              </Link>
            ) : (
              <GoogleLogin />
            )}
          </div>

          {/* Mobile menu button */}
          <div className="2xl:hidden flex items-center">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-gray-300 hover:text-white p-2"
            >
              {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="2xl:hidden">
            <div className="px-2 pt-2 pb-3 space-y-1 border-t border-fantasy-800/50">
              {groupedNavigation.map((group) => {
                return (
                  <div key={group.name} className="py-2">
                    <div className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      {group.name}
                    </div>
                    <div className="space-y-1">
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        const isActive = isNavigationActive(item.href, location.pathname);
                        return (
                          <Link
                            key={item.name}
                            to={item.href}
                            onFocus={() => preloadRoute(item.href as PreloadableRoute)}
                            onTouchStart={() => preloadRoute(item.href as PreloadableRoute)}
                            className={`flex items-center space-x-2 px-3 py-2 rounded-md text-base font-medium transition-colors ${
                              isActive
                                ? 'text-yellow-400 bg-fantasy-800/30'
                                : 'text-gray-300 hover:text-yellow-400 hover:bg-fantasy-800/20'
                            }`}
                            onClick={() => setIsMenuOpen(false)}
                          >
                            <Icon className="w-5 h-5" />
                            <span>{item.name}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {adminNavigation.map((item) => {
                const Icon = item.icon;
                const isActive = isNavigationActive(item.href, location.pathname);
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onFocus={() => preloadRoute(item.href as PreloadableRoute)}
                    onTouchStart={() => preloadRoute(item.href as PreloadableRoute)}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-md text-base font-medium transition-colors ${
                      isActive
                        ? 'text-yellow-400 bg-fantasy-800/30'
                        : 'text-gray-300 hover:text-yellow-400 hover:bg-fantasy-800/20'
                    }`}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
              <div className="pt-4 border-t border-fantasy-800/50">
                {isAuthenticated ? (
                  <Link
                    to="/profile"
                    onFocus={() => preloadRoute('/profile')}
                    onTouchStart={() => preloadRoute('/profile')}
                    className="flex items-center space-x-2 px-3 py-2 text-base font-medium text-gray-300 hover:text-yellow-400"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <img
                      src={user?.avatar || '/npc-placeholder.png'}
                      alt="Profile"
                      className="w-6 h-6 rounded-full"
                    />
                    <span>{user?.username}</span>
                  </Link>
                ) : (
                  <div className="px-3">
                    <GoogleLogin />
                  </div>
                )}
              </div>
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
    <Link
      to={item.href}
      onFocus={() => preloadRoute(item.href as PreloadableRoute)}
      onMouseEnter={() => preloadRoute(item.href as PreloadableRoute)}
      onTouchStart={() => preloadRoute(item.href as PreloadableRoute)}
      className={`flex items-center space-x-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        isActive
          ? 'text-yellow-400 bg-fantasy-800/40'
          : 'text-gray-300 hover:text-yellow-400 hover:bg-fantasy-800/25'
      }`}
      role="menuitem"
    >
      <Icon className="w-4 h-4" />
      <span>{item.name}</span>
    </Link>
  );
}

function isNavigationActive(href: string, pathname: string) {
  if (href === '/') return pathname === '/';
  if (href === '/skill-checks') return pathname.startsWith('/skill-checks') || pathname.startsWith('/lock-challenge');
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default Header;
