import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { adminPage, sitePages } from '../config/sitePages';
import { useAuth } from '../context/useAuth';
import { usePageVisibility } from '../context/usePageVisibility';
import GoogleLogin from './GoogleLogin';

type PreloadableRoute = '/' | '/about' | '/characters' | '/citizens' | '/guilds' | '/schedule' | '/games' | '/underhaul/contracts' | '/arcane-locks' | '/event' | '/skill-checks' | '/news' | '/profile' | '/admin';

const routePreloaders: Record<PreloadableRoute, () => Promise<unknown>> = {
  '/': () => import('../pages/HomePage'),
  '/about': () => import('../pages/AboutPage'),
  '/characters': () => import('../pages/CharacterPage'),
  '/citizens': () => import('../pages/CitizenRegistryPage'),
  '/guilds': () => import('../pages/GuildsPage'),
  '/schedule': () => import('../pages/SchedulePage'),
  '/games': () => import('../pages/GamesPage'),
  '/underhaul/contracts': () => import('../features/contracts/routes/ContractsOfficePage'),
  '/arcane-locks': () => import('../features/arcane-locks/routes/ArcaneLocksPage'),
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

const Header: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();
  const { isPageEnabled } = usePageVisibility();
  const isAdmin = Boolean(user?.isAdmin || user?.profile?.isAdmin);
  const BrandIcon = adminPage.icon;

  const navigation = sitePages.filter(page => isAdmin || isPageEnabled(page.key));
  const fullNavigation = isAdmin ? [...navigation, adminPage] : navigation;

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
          <div className="hidden md:flex items-center space-x-1">
            {fullNavigation.map((item) => {
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
          <div className="md:hidden flex items-center">
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
          <div className="md:hidden">
            <div className="px-2 pt-2 pb-3 space-y-1 border-t border-fantasy-800/50">
              {fullNavigation.map((item) => {
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

function isNavigationActive(href: string, pathname: string) {
  if (href === '/') return pathname === '/';
  if (href === '/skill-checks') return pathname.startsWith('/skill-checks') || pathname.startsWith('/lock-challenge');
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default Header;
