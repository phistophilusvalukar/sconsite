import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, Loader2, Shield, Users } from 'lucide-react';
import { DATABASE_TABLES } from '../config/database';
import { useAuth } from '../context/useAuth';
import { useSupabaseRealtime } from '../hooks/useSupabaseRealtime';
import CitizenRegistryService, { CitizenRegistry, RegistryRow, RegistryTierKey } from '../services/citizenRegistryService';

type SortKey = keyof RegistryRow;
type SortDirection = 'asc' | 'desc';

interface RegistryTableProps {
  title: string;
  rows: RegistryRow[];
}

const tierColumns: Array<{ key: RegistryTierKey; label: string; range: string }> = [
  { key: 'tier1', label: 'Tier 1', range: '1-3' },
  { key: 'tier2', label: 'Tier 2', range: '4-6' },
  { key: 'tier3', label: 'Tier 3', range: '7-9' },
  { key: 'tier4', label: 'Tier 4', range: '10-12' },
  { key: 'tier5', label: 'Tier 5', range: '13-15' },
  { key: 'tier6', label: 'Tier 6', range: '16-18' },
  { key: 'tier7', label: 'Tier 7', range: '19-20' }
];

const RegistryTable: React.FC<RegistryTableProps> = ({ title, rows }) => {
  const [sortKey, setSortKey] = useState<SortKey>('total');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const aValue = a[sortKey];
      const bValue = b[sortKey];

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      const numericA = Number(aValue);
      const numericB = Number(bValue);
      return sortDirection === 'asc' ? numericA - numericB : numericB - numericA;
    });
  }, [rows, sortKey, sortDirection]);

  const handleSort = (nextSortKey: SortKey) => {
    if (nextSortKey === sortKey) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
      return;
    }

    setSortKey(nextSortKey);
    setSortDirection(nextSortKey === 'name' ? 'asc' : 'desc');
  };

  const SortButton = ({ columnKey, label, sublabel }: { columnKey: SortKey; label: string; sublabel?: string }) => (
    <button
      onClick={() => handleSort(columnKey)}
      className="flex w-full items-center justify-between gap-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-300 hover:text-yellow-300"
    >
      <span>
        {label}
        {sublabel && <span className="block text-[11px] font-normal normal-case text-gray-500">{sublabel}</span>}
      </span>
      <ArrowDownUp className={`h-3.5 w-3.5 ${sortKey === columnKey ? 'text-yellow-400' : 'text-gray-500'}`} />
    </button>
  );

  return (
    <section className="bg-fantasy-900/30 border border-fantasy-700/30 rounded-xl p-4">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h2 className="font-fantasy text-2xl font-bold text-white">{title}</h2>
        <span className="text-sm text-gray-400">{rows.length} entries</span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-fantasy-700/40">
          <thead>
            <tr>
              <th className="min-w-[180px] px-3 py-3">
                <SortButton columnKey="name" label="Name" />
              </th>
              {tierColumns.map(column => (
                <th key={column.key} className="min-w-[90px] px-3 py-3">
                  <SortButton columnKey={column.key} label={column.label} sublabel={column.range} />
                </th>
              ))}
              <th className="min-w-[90px] px-3 py-3">
                <SortButton columnKey="total" label="Total" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-fantasy-700/30">
            {sortedRows.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-gray-400" colSpan={tierColumns.length + 2}>
                  No current characters found.
                </td>
              </tr>
            ) : (
              sortedRows.map(row => (
                <tr key={row.name} className="hover:bg-fantasy-800/20">
                  <td className="px-3 py-3 font-medium text-white">{row.name}</td>
                  {tierColumns.map(column => (
                    <td key={column.key} className="px-3 py-3 text-center text-gray-200">
                      {row[column.key]}
                    </td>
                  ))}
                  <td className="px-3 py-3 text-center font-bold text-yellow-300">{row.total}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};

const CitizenRegistryPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [registry, setRegistry] = useState<CitizenRegistry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const registryService = useMemo(() => CitizenRegistryService.getInstance(), []);

  const loadRegistry = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const response = await registryService.getRegistry();
    if (response.success && response.data) {
      setRegistry(response.data);
    } else {
      setError(response.error || 'Failed to load registry');
    }

    setIsLoading(false);
  }, [registryService]);

  useEffect(() => {
    if (isAuthenticated) {
      loadRegistry();
    } else {
      setIsLoading(false);
    }
  }, [isAuthenticated, loadRegistry]);

  useSupabaseRealtime({
    channelName: 'citizen-registry-page',
    tables: [
      DATABASE_TABLES.CHARACTERS,
      DATABASE_TABLES.GUILDS,
      DATABASE_TABLES.GUILD_MEMBERSHIPS
    ],
    onChange: loadRegistry,
    enabled: isAuthenticated
  });

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <Shield className="w-16 h-16 text-yellow-400 mx-auto mb-6" />
          <h1 className="font-fantasy text-4xl font-bold text-white mb-6">Citizen Registry</h1>
          <p className="text-xl text-gray-300">Please log in to view the citizen registry.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col gap-4 mb-8 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="font-fantasy text-4xl font-bold text-white mb-2">Citizen Registry</h1>
            <p className="text-gray-300">
              Current active-character census by class, ancestry, heritage, and guild.
            </p>
          </div>
          <button
            onClick={loadRegistry}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-fantasy-700 hover:bg-fantasy-600 text-white rounded-lg"
          >
            <ArrowDownUp className="w-4 h-4" />
            <span>Refresh</span>
          </button>
        </div>

        {isLoading && (
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 text-yellow-400 mx-auto mb-4 animate-spin" />
            <p className="text-gray-300">Loading registry...</p>
          </div>
        )}

        {!isLoading && error && (
          <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-6 text-red-200">
            {error}
          </div>
        )}

        {!isLoading && registry && (
          <>
            <div className="grid grid-cols-1 gap-4 mb-8 md:grid-cols-3">
              <div className="bg-fantasy-900/30 border border-fantasy-700/30 rounded-xl p-5">
                <Users className="w-7 h-7 text-yellow-400 mb-3" />
                <p className="text-sm text-gray-400">Current Characters</p>
                <p className="text-3xl font-bold text-white">{registry.totalCharacters}</p>
              </div>
              <div className="bg-fantasy-900/30 border border-fantasy-700/30 rounded-xl p-5">
                <Users className="w-7 h-7 text-blue-400 mb-3" />
                <p className="text-sm text-gray-400">Guild Characters</p>
                <p className="text-3xl font-bold text-white">{registry.guildedCharacters}</p>
              </div>
              <div className="bg-fantasy-900/30 border border-fantasy-700/30 rounded-xl p-5">
                <Users className="w-7 h-7 text-emerald-400 mb-3" />
                <p className="text-sm text-gray-400">Unguilded Characters</p>
                <p className="text-3xl font-bold text-white">{registry.totalCharacters - registry.guildedCharacters}</p>
              </div>
            </div>

            <div className="space-y-8">
              <RegistryTable title="Classes" rows={registry.classes} />
              <RegistryTable title="Ancestries" rows={registry.ancestries} />
              <RegistryTable title="Heritages" rows={registry.heritages} />
              <RegistryTable title="Guilds" rows={registry.guilds} />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CitizenRegistryPage;
