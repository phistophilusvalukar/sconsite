import React, { useEffect, useState } from 'react';
import { Shield } from 'lucide-react';
import HomepageStatsService, { HomepageStats } from '../services/homepageStatsService';

const defaultStats: HomepageStats = {
  activePlayers: 0,
  guilds: 0,
  adventuresCompleted: 0
};

const HomePage: React.FC = () => {
  const [stats, setStats] = useState<HomepageStats>(defaultStats);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    HomepageStatsService.getInstance().getHomepageStats()
      .then((response) => {
        if (!isMounted) return;

        if (response.success && response.data) {
          setStats(response.data);
          setError(null);
          return;
        }

        setError(response.error || 'Unable to load community stats.');
      })
      .catch(() => {
        if (isMounted) setError('Unable to load community stats.');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const statItems = [
    { label: 'Active Players', value: stats.activePlayers },
    { label: 'Guilds', value: stats.guilds },
    { label: 'Adventures Completed', value: stats.adventuresCompleted }
  ];

  return (
    <div className="flex h-[calc(100vh-4rem)] items-center justify-center overflow-hidden px-4 py-6 sm:px-6 lg:px-8">
      <section className="w-full max-w-5xl border border-fantasy-700/40 bg-midnight-950/55 px-5 py-8 text-center shadow-2xl shadow-midnight-950/40 backdrop-blur sm:px-8 sm:py-10">
        <Shield className="mx-auto mb-5 h-14 w-14 text-yellow-400 sm:h-16 sm:w-16" />
        <h1 className="font-fantasy text-4xl font-bold leading-tight text-white sm:text-5xl md:text-6xl">
          Pathfinder 2e Westmarch
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-gray-300 sm:text-xl">
          Organize characters, guilds, and adventures for a persistent Pathfinder 2e campaign.
        </p>

        <div className="mx-auto mt-8 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
          {statItems.map((item) => (
            <div key={item.label} className="border border-fantasy-700/35 bg-fantasy-950/45 px-4 py-5">
              <div className="text-3xl font-bold text-yellow-400 sm:text-4xl">
                {isLoading ? '...' : item.value.toLocaleString()}
              </div>
              <div className="mt-2 text-sm font-medium uppercase tracking-wider text-gray-300">
                {item.label}
              </div>
            </div>
          ))}
        </div>

        {error && (
          <p className="mt-5 text-sm text-red-300" role="status">
            {error}
          </p>
        )}
      </section>
    </div>
  );
};

export default HomePage;
