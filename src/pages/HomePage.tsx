import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, Users, Scroll, Sword, ArrowRight, Star, MessageCircle } from 'lucide-react';
import { useAuth } from '../context/useAuth';

const HomePage: React.FC = () => {
  const { isAuthenticated } = useAuth();

  const features = [
    {
      icon: Shield,
      title: 'Character Management',
      description: 'Create and manage your Pathfinder 2e characters with full FoundryVTT integration.',
      color: 'text-emerald-400'
    },
    {
      icon: Users,
      title: 'Guild System',
      description: 'Join powerful guilds, earn ranks, and unlock exclusive content and adventures.',
      color: 'text-blue-400'
    },
    {
      icon: Scroll,
      title: 'Rich Lore',
      description: 'Immerse yourself in our custom world with deep lore and ongoing storylines.',
      color: 'text-purple-400'
    },
    {
      icon: Sword,
      title: 'Epic Adventures',
      description: 'Participate in dynamic quests that shape the world and your character\'s story.',
      color: 'text-red-400'
    }
  ];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-fantasy-900/20 to-midnight-900/20"></div>
        <div className="relative max-w-7xl mx-auto text-center">
          <div className="mb-8">
            <Shield className="w-20 h-20 text-yellow-400 mx-auto mb-6" />
            <h1 className="font-fantasy text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
              Pathfinder 2e
              <br />
              <span className="text-yellow-400">Westmarch</span>
            </h1>
            <p className="text-xl md:text-2xl text-gray-300 max-w-3xl mx-auto mb-8 leading-relaxed">
              Join a thriving community of adventurers in our persistent Pathfinder 2e world. 
              Create legendary characters, forge alliances, and shape the realm's destiny.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
            {!isAuthenticated ? (
              <>
                <Link
                  to="/about"
                  className="px-8 py-4 bg-yellow-500 hover:bg-yellow-400 text-midnight-900 font-bold rounded-lg transition-all transform hover:scale-105 flex items-center space-x-2"
                >
                  <span>Get Started</span>
                  <ArrowRight className="w-5 h-5" />
                </Link>
                <a
                  href="/profile"
                  className="px-8 py-4 border-2 border-yellow-400 text-yellow-400 hover:bg-yellow-400 hover:text-midnight-900 font-bold rounded-lg transition-all flex items-center space-x-2"
                >
                  <MessageCircle className="w-5 h-5" />
                  <span>Create Profile</span>
                </a>
              </>
            ) : (
              <>
                <Link
                  to="/characters"
                  className="px-8 py-4 bg-yellow-500 hover:bg-yellow-400 text-midnight-900 font-bold rounded-lg transition-all transform hover:scale-105 flex items-center space-x-2"
                >
                  <Shield className="w-5 h-5" />
                  <span>My Characters</span>
                </Link>
                <Link
                  to="/guilds"
                  className="px-8 py-4 border-2 border-yellow-400 text-yellow-400 hover:bg-yellow-400 hover:text-midnight-900 font-bold rounded-lg transition-all flex items-center space-x-2"
                >
                  <Users className="w-5 h-5" />
                  <span>Browse Guilds</span>
                </Link>
              </>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="text-3xl font-bold text-yellow-400 mb-2">500+</div>
              <div className="text-gray-300">Active Players</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-yellow-400 mb-2">50+</div>
              <div className="text-gray-300">Active Guilds</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-yellow-400 mb-2">1000+</div>
              <div className="text-gray-300">Adventures Completed</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-midnight-900/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-fantasy text-4xl md:text-5xl font-bold text-white mb-6">
              Why Choose Our Server?
            </h2>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              Experience Pathfinder 2e like never before with our comprehensive platform
              designed for serious adventurers.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div
                  key={index}
                  className="bg-fantasy-900/30 border border-fantasy-700/30 rounded-xl p-6 hover:bg-fantasy-800/30 transition-all hover:transform hover:scale-105"
                >
                  <Icon className={`w-12 h-12 ${feature.color} mb-4`} />
                  <h3 className="text-xl font-bold text-white mb-3">{feature.title}</h3>
                  <p className="text-gray-300 leading-relaxed">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Recent Activity */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-fantasy text-4xl md:text-5xl font-bold text-white mb-6">
              Recent Adventures
            </h2>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              See what's happening in our world right now.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                title: "The Crimson Depths Explored",
                guild: "Shadowbane Company",
                description: "A daring expedition into the notorious Crimson Depths has yielded rare artifacts and ancient knowledge.",
                time: "2 hours ago",
                participants: 6
              },
              {
                title: "Dragon Cult Infiltrated",
                guild: "Order of the Silver Lance",
                description: "Members successfully infiltrated the Dragon Cult's stronghold, gathering crucial intelligence.",
                time: "5 hours ago",
                participants: 4
              },
              {
                title: "Ancient Library Discovered",
                guild: "Seekers of Truth",
                description: "Scholars have uncovered a hidden library containing pre-Earthfall texts and magical knowledge.",
                time: "1 day ago",
                participants: 8
              }
            ].map((activity, index) => (
              <div
                key={index}
                className="bg-fantasy-900/30 border border-fantasy-700/30 rounded-xl p-6 hover:bg-fantasy-800/30 transition-all"
              >
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-lg font-bold text-white">{activity.title}</h3>
                  <Star className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                </div>
                <p className="text-fantasy-300 text-sm mb-3">{activity.guild}</p>
                <p className="text-gray-300 mb-4 leading-relaxed">{activity.description}</p>
                <div className="flex justify-between items-center text-sm text-gray-400">
                  <span>{activity.participants} participants</span>
                  <span>{activity.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-fantasy-800/30 to-midnight-800/30">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="font-fantasy text-4xl md:text-5xl font-bold text-white mb-6">
            Ready to Begin Your Legend?
          </h2>
          <p className="text-xl text-gray-300 mb-8 leading-relaxed">
            Join thousands of adventurers in the most immersive Pathfinder 2e experience online.
            Your epic story starts here.
          </p>
          {!isAuthenticated && (
            <Link
              to="/about"
              className="inline-flex items-center space-x-2 px-8 py-4 bg-yellow-500 hover:bg-yellow-400 text-midnight-900 font-bold rounded-lg transition-all transform hover:scale-105 text-lg"
            >
              <Shield className="w-6 h-6" />
              <span>Start Your Adventure</span>
              <ArrowRight className="w-6 h-6" />
            </Link>
          )}
        </div>
      </section>
    </div>
  );
};

export default HomePage;
