import React, { useState } from 'react';
import { Calendar, User, Tag, MessageCircle, Heart, Share2, Newspaper, Trophy, Users, Sword } from 'lucide-react';

const NewsPage: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState('All');

  const categories = ['All', 'Announcements', 'Events', 'Updates', 'Community'];

  const mockNews = [
    {
      id: 1,
      title: "The Sundering Crisis: New Campaign Arc Begins",
      excerpt: "A catastrophic magical event threatens to tear reality apart. All guilds are called to investigate strange rifts appearing across the realm.",
      content: "The Great Sundering has begun, and reality itself hangs in the balance. Strange rifts have been spotted across all major regions, spewing forth otherworldly creatures and warping the very fabric of magic. Guild leaders are urged to organize immediate response teams to investigate these phenomena. Our scholars believe this may be connected to the ancient prophecies found in the recently discovered Library of Aethros. Time is of the essence - every moment we delay, the rifts grow stronger.",
      category: "Announcements",
      author: "Magnus Ironforge",
      date: "2 hours ago",
      image: "https://images.pexels.com/photos/1112048/pexels-photo-1112048.jpeg?auto=compress&cs=tinysrgb&w=400&h=250&fit=crop",
      likes: 47,
      comments: 23,
      tags: ["Campaign", "Major Event", "All Guilds"]
    },
    {
      id: 2,
      title: "Guild Tournament Championship Results",
      excerpt: "Shadowbane Company claims victory in the annual Guild Championship, earning the Platinum rank and exclusive rewards.",
      content: "After three weeks of intense competition, Shadowbane Company has emerged victorious in our annual Guild Championship tournament. Led by their exceptional coordination and strategic prowess, they defeated 15 other guilds in the final brackets. As champions, they receive the coveted Platinum rank, exclusive access to the Dragonheart Sanctum, and special championship regalia for all members. Congratulations to all participants - the competition was fierce and the stories legendary!",
      category: "Events",
      author: "Lyra Moonwhisper",
      date: "1 day ago",
      image: "https://images.pexels.com/photos/163036/mario-luigi-yoschi-figures-163036.jpeg?auto=compress&cs=tinysrgb&w=400&h=250&fit=crop",
      likes: 89,
      comments: 34,
      tags: ["Tournament", "Guilds", "Competition"]
    },
    {
      id: 3,
      title: "Server Update 2.4: Enhanced Character Tools",
      excerpt: "New features for character management, improved FoundryVTT integration, and quality of life improvements now live.",
      content: "We're excited to announce Server Update 2.4 is now live! This update brings significant improvements to character management, including enhanced FoundryVTT file synchronization, automatic backup systems, and a new character comparison tool. We've also added guild badge tracking, improved social features, and fixed several bugs reported by the community. Check out the full changelog in the community announcements.",
      category: "Updates",
      author: "Thaldrin Stormcaller",
      date: "3 days ago",
      image: "https://images.pexels.com/photos/1181359/pexels-photo-1181359.jpeg?auto=compress&cs=tinysrgb&w=400&h=250&fit=crop",
      likes: 56,
      comments: 18,
      tags: ["Update", "Features", "Bug Fixes"]
    },
    {
      id: 4,
      title: "Community Spotlight: The Wild Hunt's Conservation Efforts",
      excerpt: "How one guild's dedication to nature preservation has shaped an entire region of our world.",
      content: "This month's community spotlight focuses on The Wild Hunt, whose consistent environmental protection efforts have transformed the Whispering Woods into a thriving ecosystem. Through their 'Cleanse the Corruption' initiative, they've removed three major sources of magical pollution, restored habitats for rare creatures, and established protected sanctuaries. Their work has not only enhanced the region's biodiversity but also unlocked new quest opportunities for all players. Guild leader Theron Wildstrike shares: 'We believe that protecting nature isn't just roleplay - it's about creating a better world for all of us to adventure in.'",
      category: "Community",
      author: "Community Team",
      date: "5 days ago",
      image: "https://images.pexels.com/photos/1005417/pexels-photo-1005417.jpeg?auto=compress&cs=tinysrgb&w=400&h=250&fit=crop",
      likes: 73,
      comments: 29,
      tags: ["Spotlight", "Conservation", "The Wild Hunt"]
    },
    {
      id: 5,
      title: "Upcoming: Midsummer Festival Event",
      excerpt: "Join us for a week-long celebration featuring special quests, unique rewards, and community activities starting June 21st.",
      content: "Get ready for our annual Midsummer Festival! From June 21st to 28th, the realm will come alive with celebration. Special event quests will be available across all regions, offering unique cosmetic rewards and limited-time titles. The festival will feature guild competitions, storytelling contests, costume contests, and the traditional Bonfire Blessing ceremony. Don't miss the Grand Feast on June 24th, where all players can come together for food, music, and merriment. Mark your calendars and prepare your finest festival attire!",
      category: "Events",
      author: "Event Coordination Team",
      date: "1 week ago",
      image: "https://images.pexels.com/photos/1684187/pexels-photo-1684187.jpeg?auto=compress&cs=tinysrgb&w=400&h=250&fit=crop",
      likes: 134,
      comments: 45,
      tags: ["Festival", "Event", "Celebration"]
    }
  ];

  const filteredNews = selectedCategory === 'All' 
    ? mockNews 
    : mockNews.filter(item => item.category === selectedCategory);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Announcements': return <Newspaper className="w-4 h-4" />;
      case 'Events': return <Calendar className="w-4 h-4" />;
      case 'Updates': return <Sword className="w-4 h-4" />;
      case 'Community': return <Users className="w-4 h-4" />;
      default: return <Newspaper className="w-4 h-4" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Announcements': return 'text-red-400 bg-red-400/20';
      case 'Events': return 'text-purple-400 bg-purple-400/20';
      case 'Updates': return 'text-blue-400 bg-blue-400/20';
      case 'Community': return 'text-green-400 bg-green-400/20';
      default: return 'text-gray-400 bg-gray-400/20';
    }
  };

  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <Newspaper className="w-16 h-16 text-yellow-400 mx-auto mb-6" />
          <h1 className="font-fantasy text-4xl md:text-6xl font-bold text-white mb-6">
            News & Events
          </h1>
          <p className="text-xl text-gray-300 max-w-3xl mx-auto">
            Stay updated with the latest happenings in our world, from major story developments 
            to community events and server updates.
          </p>
        </div>

        {/* Category Filter */}
        <div className="flex flex-wrap justify-center gap-4 mb-8">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all ${
                selectedCategory === category
                  ? 'bg-yellow-500 text-midnight-900'
                  : 'bg-fantasy-700/50 text-gray-300 hover:bg-fantasy-600/50 hover:text-white'
              }`}
            >
              {getCategoryIcon(category)}
              <span>{category}</span>
            </button>
          ))}
        </div>

        {/* Featured Article */}
        {filteredNews.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-white mb-6">Featured</h2>
            <div className="bg-fantasy-900/30 border border-fantasy-700/30 rounded-xl overflow-hidden hover:bg-fantasy-800/30 transition-all">
              <div className="md:flex">
                <div className="md:w-1/3">
                  <img
                    src={filteredNews[0].image}
                    alt={filteredNews[0].title}
                    className="w-full h-48 md:h-full object-cover"
                  />
                </div>
                <div className="md:w-2/3 p-6">
                  <div className="flex items-center space-x-4 mb-4">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium flex items-center space-x-1 ${getCategoryColor(filteredNews[0].category)}`}>
                      {getCategoryIcon(filteredNews[0].category)}
                      <span>{filteredNews[0].category}</span>
                    </span>
                    <div className="flex items-center space-x-2 text-gray-400 text-sm">
                      <User className="w-4 h-4" />
                      <span>{filteredNews[0].author}</span>
                    </div>
                    <div className="flex items-center space-x-2 text-gray-400 text-sm">
                      <Calendar className="w-4 h-4" />
                      <span>{filteredNews[0].date}</span>
                    </div>
                  </div>
                  
                  <h3 className="font-fantasy text-2xl md:text-3xl font-bold text-white mb-4">
                    {filteredNews[0].title}
                  </h3>
                  
                  <p className="text-gray-300 mb-4 leading-relaxed">
                    {filteredNews[0].content}
                  </p>

                  <div className="flex flex-wrap gap-2 mb-4">
                    {filteredNews[0].tags.map((tag, index) => (
                      <span
                        key={index}
                        className="px-2 py-1 bg-fantasy-700/50 text-yellow-400 text-sm rounded-full flex items-center space-x-1"
                      >
                        <Tag className="w-3 h-3" />
                        <span>{tag}</span>
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-6">
                      <div className="flex items-center space-x-2 text-gray-400">
                        <Heart className="w-4 h-4" />
                        <span>{filteredNews[0].likes}</span>
                      </div>
                      <div className="flex items-center space-x-2 text-gray-400">
                        <MessageCircle className="w-4 h-4" />
                        <span>{filteredNews[0].comments}</span>
                      </div>
                    </div>
                    <button className="flex items-center space-x-2 text-gray-400 hover:text-yellow-400 transition-colors">
                      <Share2 className="w-4 h-4" />
                      <span>Share</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* News Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredNews.slice(1).map((item) => (
            <article
              key={item.id}
              className="bg-fantasy-900/30 border border-fantasy-700/30 rounded-xl overflow-hidden hover:bg-fantasy-800/30 transition-all cursor-pointer group"
            >
              <img
                src={item.image}
                alt={item.title}
                className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300"
              />
              
              <div className="p-6">
                <div className="flex items-center justify-between mb-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center space-x-1 ${getCategoryColor(item.category)}`}>
                    {getCategoryIcon(item.category)}
                    <span>{item.category}</span>
                  </span>
                  <span className="text-gray-400 text-sm">{item.date}</span>
                </div>

                <h3 className="font-bold text-white text-lg mb-3 group-hover:text-yellow-400 transition-colors">
                  {item.title}
                </h3>

                <p className="text-gray-300 mb-4 text-sm leading-relaxed">
                  {item.excerpt}
                </p>

                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2 text-gray-400 text-sm">
                    <User className="w-4 h-4" />
                    <span>{item.author}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1 mb-4">
                  {item.tags.slice(0, 2).map((tag, index) => (
                    <span
                      key={index}
                      className="px-2 py-1 bg-fantasy-700/30 text-yellow-400 text-xs rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-1 text-gray-400 text-sm">
                      <Heart className="w-4 h-4 hover:text-red-400 cursor-pointer transition-colors" />
                      <span>{item.likes}</span>
                    </div>
                    <div className="flex items-center space-x-1 text-gray-400 text-sm">
                      <MessageCircle className="w-4 h-4 hover:text-blue-400 cursor-pointer transition-colors" />
                      <span>{item.comments}</span>
                    </div>
                  </div>
                  <button className="text-gray-400 hover:text-yellow-400 transition-colors">
                    <Share2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>

        {/* Newsletter Signup */}
        <div className="mt-16 bg-gradient-to-r from-fantasy-800/30 to-midnight-800/30 rounded-2xl p-8 text-center">
          <Trophy className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
          <h2 className="font-fantasy text-2xl font-bold text-white mb-4">
            Never Miss an Update
          </h2>
          <p className="text-gray-300 mb-6 max-w-2xl mx-auto">
            Stay informed about the latest news, events, and developments in our world. 
            Check back here for updates and community announcements.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto">
            <input
              type="email"
              placeholder="Enter your email"
              className="flex-1 px-4 py-3 bg-fantasy-900/50 border border-fantasy-700/30 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
            />
            <button className="px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-midnight-900 font-bold rounded-lg transition-all transform hover:scale-105">
              Subscribe
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewsPage;
