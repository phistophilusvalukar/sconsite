import React from 'react';
import { CharacterRoleBadge } from '../types/database';
import { roleBadgeMap, roleBadgeTone } from '../utils/characterRoles';

interface CharacterRoleBadgesProps {
  badges?: CharacterRoleBadge[];
  showLabels?: boolean;
  limit?: number;
  className?: string;
}

const CharacterRoleBadges: React.FC<CharacterRoleBadgesProps> = ({ badges = [], showLabels = false, limit, className = '' }) => {
  const visibleBadges = typeof limit === 'number' ? badges.slice(0, limit) : badges;
  const hiddenCount = typeof limit === 'number' ? Math.max(0, badges.length - limit) : 0;

  if (badges.length === 0) return null;

  return (
    <div className={`flex flex-wrap justify-end gap-1.5 ${className}`}>
      {visibleBadges.map(badgeId => {
        const badge = roleBadgeMap.get(badgeId);
        if (!badge) return null;

        return (
          <span
            key={badgeId}
            className={`group/badge relative flex h-8 min-w-8 items-center justify-center gap-1 rounded-md border border-yellow-100/20 px-2 text-xs font-bold shadow-[inset_0_0_0_1px_rgba(0,0,0,0.45)] ring-1 ${roleBadgeTone(badge.category)}`}
          >
            {badge.icon}
            {showLabels && <span>{badge.label}</span>}
            <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-fantasy-700/50 bg-midnight-950 px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 shadow-xl transition-opacity group-hover/badge:opacity-100">
              {badge.category}: {badge.label}
            </span>
          </span>
        );
      })}
      {hiddenCount > 0 && (
        <span className="flex h-8 min-w-8 items-center justify-center rounded-md bg-midnight-900/85 px-2 text-xs font-bold text-gray-200 ring-1 ring-yellow-300/25">
          +{hiddenCount}
        </span>
      )}
    </div>
  );
};

export default CharacterRoleBadges;
