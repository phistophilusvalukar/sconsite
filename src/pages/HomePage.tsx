import React, { useEffect, useState } from 'react';
import { ArrowRight, CalendarDays, Library, Map, Shield, Users } from 'lucide-react';
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
    { icon: Library, label: 'Atlas of Ao', copy: 'Trace the people, places, and mysteries of the Convergence.', href: '/lore' },
    { icon: CalendarDays, label: 'Expeditions', copy: 'Find the next story gathering at the table.', href: '/games' }
  ];

  return (
    <div className="site-home">
      <div className="site-home-cartography" aria-hidden="true"><i /><i /><i /></div>
      <div className="site-home-inner">
        <section className="site-home-hero">
          <div className="site-home-copy">
            <p className="site-kicker"><Shield /> The Shattered Convergence</p>
            <h1>Lost worlds converge.<br /><em>Your story continues.</em></h1>
            <p className="site-home-lede">Shattered Convergence is a Pathfinder 2e Living World where Wayfinders gather in Axiom, cross unstable realms, and return with stories that permanently shape Ao.</p>
            <div className="site-home-actions">
              <Link to="/characters" className="site-primary-link">Enter the registry <ArrowRight /></Link>
              <Link to="/lore" className="site-text-link">Enter the atlas <span>↗</span></Link>
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
