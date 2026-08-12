import React, { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, CalendarDays, Map, Shield, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import HomepageStatsService, { HomepageStats } from '../services/homepageStatsService';

const defaultStats: HomepageStats = { activePlayers: 0, guilds: 0, adventuresCompleted: 0 };

const HomePage: React.FC = () => {
  const [stats, setStats] = useState<HomepageStats>(defaultStats);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    HomepageStatsService.getInstance().getHomepageStats()
      .then(response => {
        if (!isMounted) return;
        if (response.success && response.data) {
          setStats(response.data);
          setError(null);
        } else {
          setError(response.error || 'Unable to load the community ledger.');
        }
      })
      .catch(() => isMounted && setError('Unable to load the community ledger.'))
      .finally(() => isMounted && setIsLoading(false));
    return () => { isMounted = false; };
  }, []);

  const statItems = [
    { label: 'Active citizens', value: stats.activePlayers },
    { label: 'Guild charters', value: stats.guilds },
    { label: 'Expeditions returned', value: stats.adventuresCompleted }
  ];

  const pathways = [
    { icon: Users, label: 'Guild halls', copy: 'Find a banner and the people beneath it.', href: '/guilds' },
    { icon: CalendarDays, label: 'Adventure calendar', copy: 'See what is gathering at the table.', href: '/games' },
    { icon: BookOpen, label: 'Latest dispatches', copy: 'Read what has changed across the world.', href: '/news' }
  ];

  return (
    <div className="site-home">
      <div className="site-home-cartography" aria-hidden="true"><i /><i /><i /></div>
      <div className="site-home-inner">
        <section className="site-home-hero">
          <div className="site-home-copy">
            <p className="site-kicker"><Shield /> The Shattered Convergence</p>
            <h1>A living world,<br /><em>kept in good order.</em></h1>
            <p className="site-home-lede">The campaign registry for the characters, guilds, expeditions, and small acts of bravery that make a Westmarch endure.</p>
            <div className="site-home-actions">
              <Link to="/characters" className="site-primary-link">Enter the registry <ArrowRight /></Link>
              <Link to="/about" className="site-text-link">How this world works <span>↗</span></Link>
            </div>
          </div>

          <aside className="site-home-ledger">
            <div className="site-home-ledger-heading"><Map /><div><p className="site-kicker">Community ledger</p><h2>World at a glance</h2></div></div>
            <div className="site-home-stats">
              {statItems.map((item, index) => (
                <div key={item.label}><span>0{index + 1}</span><strong>{isLoading ? '—' : item.value.toLocaleString()}</strong><small>{item.label}</small></div>
              ))}
            </div>
            {error && <p className="site-home-error" role="status">{error}</p>}
            <p className="site-home-ledger-note">Updated from the registry as stories are entered.</p>
          </aside>
        </section>

        <section className="site-home-pathways" aria-label="Explore the campaign">
          {pathways.map(pathway => {
            const Icon = pathway.icon;
            return <Link to={pathway.href} key={pathway.label}><Icon /><span><strong>{pathway.label}</strong><small>{pathway.copy}</small></span><ArrowRight /></Link>;
          })}
        </section>
      </div>
    </div>
  );
};

export default HomePage;
