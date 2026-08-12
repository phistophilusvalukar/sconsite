import React from 'react';
import { ArrowRight, CalendarDays, Shield, Ticket, Users } from 'lucide-react';
import { Link } from 'react-router-dom';

const AboutPage: React.FC = () => {
  const sections = [
    { number: '01', icon: Shield, title: 'Make a character', body: 'Create a Pathfinder 2e character or bring in a Foundry record, then keep their public history in one place.', href: '/characters', action: 'Open the character registry' },
    { number: '02', icon: Users, title: 'Find your people', body: 'Build a guild hall, gather beneath an existing banner, or visit another headquarters as a traveler.', href: '/guilds', action: 'Walk the guild registry' },
    { number: '03', icon: CalendarDays, title: 'Gather the table', body: 'Compare availability and turn a possible evening into a date everyone can actually keep.', href: '/schedule', action: 'Consult the schedule' },
    { number: '04', icon: Ticket, title: 'Return with a story', body: 'Apply for expeditions, manage the roster, and preserve completed adventures in the campaign archive.', href: '/games', action: 'Browse expeditions' }
  ];

  return (
    <div className="site-about">
      <header className="site-page-hero">
        <div><p className="site-kicker">The campaign concordance</p><h1>One world.<br /><em>Many hands.</em></h1></div>
        <p>This is the quiet infrastructure behind a living Pathfinder 2e Westmarch: a place for people to find one another, organize the next journey, and keep what happened from being lost.</p>
      </header>

      <div className="site-page-rule"><span /></div>

      <section className="site-about-intro">
        <p className="site-kicker">How to begin</p>
        <h2>From first character to lasting chronicle</h2>
        <p>Every tool here supports the same rhythm: arrive with an idea, find companions, make plans, and add what happened back to the shared record.</p>
      </section>

      <section className="site-about-steps">
        {sections.map(section => {
          const Icon = section.icon;
          return (
            <article key={section.title}>
              <span className="site-about-number">{section.number}</span>
              <div className="site-about-icon"><Icon /></div>
              <h3>{section.title}</h3>
              <p>{section.body}</p>
              <Link to={section.href}>{section.action} <ArrowRight /></Link>
            </article>
          );
        })}
      </section>

      <section className="site-about-cta">
        <div><p className="site-kicker">Your place in the record</p><h2>The next entry can be yours.</h2><p>Sign in, create a profile, and bring your first character into the Convergence.</p></div>
        <Link to="/profile" className="site-primary-link">Open your profile <ArrowRight /></Link>
      </section>
    </div>
  );
};

export default AboutPage;
