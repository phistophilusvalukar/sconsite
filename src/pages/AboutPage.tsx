import React from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Shield, Ticket, Users } from 'lucide-react';

const AboutPage: React.FC = () => {
  const sections = [
    {
      icon: Shield,
      title: 'Characters',
      body: 'Create and manage Pathfinder 2e characters, including imported Foundry data where available.',
      href: '/characters',
      action: 'Manage Characters'
    },
    {
      icon: Users,
      title: 'Guilds',
      body: 'Form guilds, recruit members, review applications, and keep rosters organized.',
      href: '/guilds',
      action: 'View Guilds'
    },
    {
      icon: CalendarDays,
      title: 'Scheduling',
      body: 'Use schedule polls to find table times that work for players and GMs.',
      href: '/schedule',
      action: 'Open Schedule'
    },
    {
      icon: Ticket,
      title: 'Games',
      body: 'List upcoming adventures, apply with characters, and archive completed games.',
      href: '/games',
      action: 'Browse Games'
    }
  ];

  return (
    <div className="min-h-screen px-4 py-12 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-4xl text-center">
        <Shield className="mx-auto mb-6 h-16 w-16 text-yellow-400" />
        <h1 className="font-fantasy text-4xl font-bold text-white md:text-6xl">
          About Pathfinder Westmarch
        </h1>
        <p className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-gray-300 md:text-xl">
          This site is the campaign hub for a Pathfinder 2e Westmarch community. It keeps player profiles,
          characters, guilds, schedules, game listings, and news in one place.
        </p>
      </section>

      <section className="mx-auto mt-12 grid max-w-6xl grid-cols-1 gap-6 md:grid-cols-2">
        {sections.map((section) => {
          const Icon = section.icon;

          return (
            <article
              key={section.title}
              className="border border-fantasy-700/35 bg-fantasy-950/35 p-6"
            >
              <Icon className="mb-4 h-10 w-10 text-yellow-400" />
              <h2 className="text-2xl font-bold text-white">{section.title}</h2>
              <p className="mt-3 leading-relaxed text-gray-300">{section.body}</p>
              <Link
                to={section.href}
                className="mt-5 inline-flex items-center font-semibold text-yellow-400 transition-colors hover:text-yellow-300"
              >
                {section.action}
              </Link>
            </article>
          );
        })}
      </section>

      <section className="mx-auto mt-12 max-w-4xl border border-fantasy-700/35 bg-midnight-950/45 p-6 text-center">
        <h2 className="font-fantasy text-3xl font-bold text-white">Getting Started</h2>
        <p className="mx-auto mt-4 max-w-2xl leading-relaxed text-gray-300">
          Sign in, create your profile, add a character, then use the guild, schedule, and games pages to join
          the community activity already tracked in the database.
        </p>
        <Link
          to="/profile"
          className="mt-6 inline-flex items-center bg-yellow-500 px-6 py-3 font-bold text-midnight-950 transition-colors hover:bg-yellow-400"
        >
          Open Profile
        </Link>
      </section>
    </div>
  );
};

export default AboutPage;
