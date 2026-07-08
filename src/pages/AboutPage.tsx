import React from 'react';
import { Shield, Users, Scroll, MessageCircle, ArrowRight, Star, Crown, Sword } from 'lucide-react';

const AboutPage: React.FC = () => {
  const teamMembers = [
    {
      name: "Magnus Ironforge",
      role: "Server Administrator",
      description: "Veteran GM with 15+ years of tabletop experience. Architect of our world's lore.",
      avatar: "/npc-placeholder.png"
    },
    {
      name: "Lyra Moonwhisper",
      role: "Community Manager",
      description: "Ensures our community remains welcoming and engaging for all adventurers.",
      avatar: "/npc-placeholder.png"
    },
    {
      name: "Thaldrin Stormcaller",
      role: "Technical Lead",
      description: "Maintains our FoundryVTT integration and develops custom tools for our server.",
      avatar: "/npc-placeholder.png"
    }
  ];

  const values = [
    {
      icon: Users,
      title: "Community First",
      description: "We prioritize creating an inclusive, supportive environment where every player can thrive and contribute to our shared stories."
    },
    {
      icon: Crown,
      title: "Quality Roleplay",
      description: "We encourage deep character development and meaningful interactions that create lasting memories and friendships."
    },
    {
      icon: Sword,
      title: "Epic Adventures",
      description: "Our GMs craft engaging, challenging content that respects player agency while delivering unforgettable experiences."
    },
    {
      icon: Star,
      title: "Fair Play",
      description: "We maintain consistent rules and transparent systems that ensure everyone has an equal opportunity to succeed."
    }
  ];

  return (
    <div className="min-h-screen py-12">
      {/* Hero Section */}
      <section className="px-4 sm:px-6 lg:px-8 mb-20">
        <div className="max-w-4xl mx-auto text-center">
          <Shield className="w-16 h-16 text-yellow-400 mx-auto mb-6" />
          <h1 className="font-fantasy text-4xl md:text-6xl font-bold text-white mb-6">
            Our Story
          </h1>
          <p className="text-xl text-gray-300 leading-relaxed">
            Born from a passion for collaborative storytelling and the rich world of Pathfinder 2e, 
            our server has grown into a thriving community of dedicated adventurers, creative minds, 
            and lifelong friends.
          </p>
        </div>
      </section>

      {/* Mission Section */}
      <section className="px-4 sm:px-6 lg:px-8 mb-20">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="font-fantasy text-3xl md:text-4xl font-bold text-white mb-6">
                Our Mission
              </h2>
              <p className="text-lg text-gray-300 mb-6 leading-relaxed">
                We believe that the best adventures happen when players feel empowered to shape 
                the world around them. Our Westmarch-style server provides a persistent, 
                living world where every action has consequences and every character's story matters.
              </p>
              <p className="text-lg text-gray-300 mb-8 leading-relaxed">
                Through innovative use of technology, careful world-building, and a commitment 
                to inclusive gameplay, we've created a space where both newcomers and veterans 
                can find their place in our ever-evolving narrative.
              </p>
              <a
                href="/profile"
                className="inline-flex items-center space-x-2 px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-midnight-900 font-bold rounded-lg transition-all transform hover:scale-105"
              >
                <MessageCircle className="w-5 h-5" />
                <span>Create Your Profile</span>
                <ArrowRight className="w-5 h-5" />
              </a>
            </div>
            <div className="bg-fantasy-900/30 border border-fantasy-700/30 rounded-xl p-8">
              <div className="grid grid-cols-2 gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-yellow-400 mb-2">3+</div>
                  <div className="text-gray-300">Years Running</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-yellow-400 mb-2">500+</div>
                  <div className="text-gray-300">Active Members</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-yellow-400 mb-2">50+</div>
                  <div className="text-gray-300">Active GMs</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-yellow-400 mb-2">1000+</div>
                  <div className="text-gray-300">Sessions Run</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="px-4 sm:px-6 lg:px-8 mb-20 bg-midnight-900/50 py-16">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-fantasy text-3xl md:text-4xl font-bold text-white mb-6">
              Our Values
            </h2>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              These principles guide everything we do and help us maintain the high-quality 
              experience our community has come to love.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {values.map((value, index) => {
              const Icon = value.icon;
              return (
                <div
                  key={index}
                  className="bg-fantasy-900/30 border border-fantasy-700/30 rounded-xl p-6 hover:bg-fantasy-800/30 transition-all"
                >
                  <Icon className="w-12 h-12 text-yellow-400 mb-4" />
                  <h3 className="text-xl font-bold text-white mb-3">{value.title}</h3>
                  <p className="text-gray-300 leading-relaxed">{value.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section className="px-4 sm:px-6 lg:px-8 mb-20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-fantasy text-3xl md:text-4xl font-bold text-white mb-6">
              Meet Our Team
            </h2>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto">
              Our dedicated staff work tirelessly to ensure every player has an amazing experience 
              in our world.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {teamMembers.map((member, index) => (
              <div
                key={index}
                className="bg-fantasy-900/30 border border-fantasy-700/30 rounded-xl p-6 text-center hover:bg-fantasy-800/30 transition-all"
              >
                <img
                  src={member.avatar}
                  alt={member.name}
                  className="w-24 h-24 rounded-full mx-auto mb-4 border-2 border-yellow-400"
                />
                <h3 className="text-xl font-bold text-white mb-2">{member.name}</h3>
                <p className="text-yellow-400 font-semibold mb-3">{member.role}</p>
                <p className="text-gray-300 leading-relaxed">{member.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* World Lore Section */}
      <section className="px-4 sm:px-6 lg:px-8 mb-20">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="bg-fantasy-900/30 border border-fantasy-700/30 rounded-xl p-8">
              <Scroll className="w-12 h-12 text-yellow-400 mb-6" />
              <h3 className="font-fantasy text-2xl font-bold text-white mb-4">
                The Shattered Realms
              </h3>
              <p className="text-gray-300 leading-relaxed mb-4">
                Our world exists in the aftermath of the Great Sundering, where ancient magics 
                tore reality itself asunder. Islands of stability float in seas of chaos, 
                connected by mysterious ley lines and guarded by powerful factions.
              </p>
              <p className="text-gray-300 leading-relaxed">
                In this fractured reality, heroes are desperately needed to explore the unknown, 
                forge alliances between distant settlements, and uncover the secrets that might 
                one day heal the world.
              </p>
            </div>
            <div>
              <h2 className="font-fantasy text-3xl md:text-4xl font-bold text-white mb-6">
                A Living World
              </h2>
              <p className="text-lg text-gray-300 mb-6 leading-relaxed">
                Every session impacts our shared world. Political alliances shift, new settlements 
                are founded, ancient evils are awakened or defeated, and the very landscape changes 
                based on player actions.
              </p>
              <p className="text-lg text-gray-300 mb-8 leading-relaxed">
                Our extensive lore documents, player-driven storylines, and interconnected campaign 
                arcs ensure that your character's actions have lasting meaning in our world.
              </p>
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <Star className="w-5 h-5 text-yellow-400" />
                  <span className="text-gray-300">Player actions shape world events</span>
                </div>
                <div className="flex items-center space-x-3">
                  <Star className="w-5 h-5 text-yellow-400" />
                  <span className="text-gray-300">Rich, interconnected storylines</span>
                </div>
                <div className="flex items-center space-x-3">
                  <Star className="w-5 h-5 text-yellow-400" />
                  <span className="text-gray-300">Persistent character relationships</span>
                </div>
                <div className="flex items-center space-x-3">
                  <Star className="w-5 h-5 text-yellow-400" />
                  <span className="text-gray-300">Dynamic political landscape</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center bg-gradient-to-r from-fantasy-800/30 to-midnight-800/30 rounded-2xl p-12">
          <h2 className="font-fantasy text-3xl md:text-4xl font-bold text-white mb-6">
            Join Our Community
          </h2>
          <p className="text-xl text-gray-300 mb-8 leading-relaxed">
            Ready to become part of something bigger? Create a profile to meet other players, manage your characters, and start planning your first adventure.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="/profile"
              className="inline-flex items-center space-x-2 px-8 py-4 bg-yellow-500 hover:bg-yellow-400 text-midnight-900 font-bold rounded-lg transition-all transform hover:scale-105"
            >
              <MessageCircle className="w-5 h-5" />
              <span>Get Started</span>
            </a>
            <a
              href="/characters"
              className="inline-flex items-center space-x-2 px-8 py-4 border-2 border-yellow-400 text-yellow-400 hover:bg-yellow-400 hover:text-midnight-900 font-bold rounded-lg transition-all"
            >
              <Shield className="w-5 h-5" />
              <span>Create Character</span>
            </a>
          </div>
        </div>
      </section>
    </div>
  );
};

export default AboutPage;
