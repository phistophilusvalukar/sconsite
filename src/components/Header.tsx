import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Shield, Menu, X, Users, Scroll, Newspaper, User, ClipboardList, CalendarDays, Ticket, Wrench, Sun } from 'lucide-react';
import { useAuth } from '../context/useAuth';
import GoogleLogin from './GoogleLogin';

type PreloadableRoute = '/' | '/about' | '/characters' | '/citizens' | '/guilds' | '/schedule' | '/games' | '/event' | '/skill-checks' | '/news' | '/profile';

const routePreloaders: Record<PreloadableRoute, () => Promise<unknown>> = {
  '/': () => import('../pages/HomePage'),
  '/about': () => import('../pages/AboutPage'),
  '/characters': () => import('../pages/CharacterPage'),
  '/citizens': () => import('../pages/CitizenRegistryPage'),
  '/guilds': () => import('../pages/GuildsPage'),
  '/schedule': () => import('../pages/SchedulePage'),
  '/games': () => import('../pages/GamesPage'),
  '/event': () => import('../pages/EventPage'),
  '/skill-checks': () => import('../pages/SkillChecksPage'),
  '/news': () => import('../pages/NewsPage'),
  '/profile': () => import('../pages/ProfilePage')
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

  const navigation = [
    { name: 'Home', href: '/', icon: Shield },
    { name: 'About', href: '/about', icon: Scroll },
    { name: 'Characters', href: '/characters', icon: User },
    { name: 'Registry', href: '/citizens', icon: ClipboardList },
    { name: 'Guilds', href: '/guilds', icon: Users },
    { name: 'Schedule', href: '/schedule', icon: CalendarDays },
    { name: 'Games', href: '/games', icon: Ticket },
    { name: 'Event', href: '/event', icon: Sun },
    { name: 'GM Tools', href: '/skill-checks', icon: Wrench },
    { name: 'News', href: '/news', icon: Newspaper },
  ];

  return (
    <header className="bg-midnight-900/90 backdrop-blur-sm border-b border-fantasy-800/50 sticky top-0 z-50">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex items-center space-x-2">
              <Shield className="w-8 h-8 text-yellow-400" />
              <span className="font-fantasy text-xl font-bold text-white">
                Westmarch
              </span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = item.href === '/schedule'
                ? location.pathname.startsWith('/schedule')
                : item.href === '/skill-checks'
                  ? location.pathname.startsWith('/skill-checks') || location.pathname.startsWith('/lock-challenge')
                  : location.pathname === item.href;
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
              {navigation.map((item) => {
                const Icon = item.icon;
                const isActive = item.href === '/schedule'
                  ? location.pathname.startsWith('/schedule')
                  : item.href === '/skill-checks'
                    ? location.pathname.startsWith('/skill-checks') || location.pathname.startsWith('/lock-challenge')
                    : location.pathname === item.href;
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

export default Header;
