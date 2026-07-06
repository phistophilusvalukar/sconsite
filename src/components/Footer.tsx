import React from 'react';
import { Shield, MessageCircle, Github, Heart } from 'lucide-react';

const Footer: React.FC = () => {
  return (
    <footer className="bg-midnight-950 border-t border-fantasy-800/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center space-x-2 mb-4">
              <Shield className="w-8 h-8 text-yellow-400" />
              <span className="font-fantasy text-xl font-bold text-white">
                Pathfinder Westmarch
              </span>
            </div>
            <p className="text-gray-400 mb-4 max-w-md">
              A thriving community for Pathfinder 2e adventurers. Create characters, 
              join guilds, and embark on epic quests in our persistent world.
            </p>
            <div className="flex space-x-4">
              <a
                href="/about"
                className="flex items-center space-x-2 text-gray-400 hover:text-yellow-400 transition-colors"
              >
                <MessageCircle className="w-5 h-5" />
                <span>Community</span>
              </a>
              <a
                href="https://github.com/pathfinder-westmarch"
                className="flex items-center space-x-2 text-gray-400 hover:text-yellow-400 transition-colors"
              >
                <Github className="w-5 h-5" />
                <span>GitHub</span>
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-white font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-2">
              <li>
                <a href="/characters" className="text-gray-400 hover:text-yellow-400 transition-colors">
                  My Characters
                </a>
              </li>
              <li>
                <a href="/guilds" className="text-gray-400 hover:text-yellow-400 transition-colors">
                  Guild Directory
                </a>
              </li>
              <li>
                <a href="/news" className="text-gray-400 hover:text-yellow-400 transition-colors">
                  Latest News
                </a>
              </li>
              <li>
                <a href="/about" className="text-gray-400 hover:text-yellow-400 transition-colors">
                  About Us
                </a>
              </li>
            </ul>
          </div>

          {/* Community */}
          <div>
            <h3 className="text-white font-semibold mb-4">Community</h3>
            <ul className="space-y-2">
              <li>
                <a href="#" className="text-gray-400 hover:text-yellow-400 transition-colors">
                  Player Guide
                </a>
              </li>
              <li>
                <a href="#" className="text-gray-400 hover:text-yellow-400 transition-colors">
                  House Rules
                </a>
              </li>
              <li>
                <a href="#" className="text-gray-400 hover:text-yellow-400 transition-colors">
                  Session Reports
                </a>
              </li>
              <li>
                <a href="#" className="text-gray-400 hover:text-yellow-400 transition-colors">
                  Help & Support
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-fantasy-800/50 mt-8 pt-8 flex flex-col sm:flex-row justify-between items-center">
          <p className="text-gray-400 text-sm">
            Â© 2024 Pathfinder Westmarch Server. Built with{' '}
            <Heart className="w-4 h-4 inline text-red-500" /> for the community.
          </p>
          <div className="flex space-x-4 mt-4 sm:mt-0">
            <a href="#" className="text-gray-400 hover:text-yellow-400 transition-colors text-sm">
              Privacy Policy
            </a>
            <a href="#" className="text-gray-400 hover:text-yellow-400 transition-colors text-sm">
              Terms of Service
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
