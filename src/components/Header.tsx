import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Shield, Menu, X, Users, Scroll, Newspaper, User, ClipboardList, CalendarDays } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import GoogleLogin from './GoogleLogin';

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
          <div className="hidden md:flex items-center space-x-8">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = item.href === '/schedule'
                ? location.pathname.startsWith('/schedule')
                : location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
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
                className="flex items-center space-x-2 px-4 py-2 bg-fantasy-700 hover:bg-fantasy-600 text-white rounded-md transition-colors"
              >
                <img
                  src={user?.avatar || 'https://images.pexels.com/photos/771742/pexels-photo-771742.jpeg?auto=compress&cs=tinysrgb&w=32&h=32&fit=crop'}
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
                  : location.pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
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
                    className="flex items-center space-x-2 px-3 py-2 text-base font-medium text-gray-300 hover:text-yellow-400"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <img
                      src={user?.avatar || 'https://images.pexels.com/photos/771742/pexels-photo-771742.jpeg?auto=compress&cs=tinysrgb&w=32&h=32&fit=crop'}
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
