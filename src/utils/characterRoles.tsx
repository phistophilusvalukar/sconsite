import React from 'react';
import { Beaker, Cross, Flame, HeartPulse, Hexagon, Shield, Sparkles, Swords, Wand2, Waves } from 'lucide-react';
import { CharacterRoleBadge, CharacterRoleCategory } from '../types/database';

export const roleCategories: Array<{
  category: CharacterRoleCategory;
  badges: Array<{ id: CharacterRoleBadge; label: string; icon: React.ReactNode }>;
}> = [
  {
    category: 'Healer',
    badges: [
      { id: 'healer_magical', label: 'Magical', icon: <Sparkles className="h-4 w-4" /> },
      { id: 'healer_medicine', label: 'Medicine', icon: <Cross className="h-4 w-4" /> },
      { id: 'healer_alchemical', label: 'Alchemical', icon: <Beaker className="h-4 w-4" /> }
    ]
  },
  {
    category: 'Tank',
    badges: [
      { id: 'tank_mitigation', label: 'Mitigation', icon: <Shield className="h-4 w-4" /> },
      { id: 'tank_hp', label: 'HP', icon: <HeartPulse className="h-4 w-4" /> }
    ]
  },
  {
    category: 'DPS',
    badges: [
      { id: 'dps_physical', label: 'Physical', icon: <Swords className="h-4 w-4" /> },
      { id: 'dps_magical', label: 'Magical', icon: <Wand2 className="h-4 w-4" /> },
      { id: 'dps_duelist', label: 'Duelist', icon: <Hexagon className="h-4 w-4" /> },
      { id: 'dps_blaster', label: 'Blaster', icon: <Flame className="h-4 w-4" /> }
    ]
  },
  {
    category: 'Support',
    badges: [
      { id: 'support_defensive', label: 'Defensive', icon: <Shield className="h-4 w-4" /> },
      { id: 'support_offensive', label: 'Offensive', icon: <Sparkles className="h-4 w-4" /> },
      { id: 'support_control', label: 'Control', icon: <Waves className="h-4 w-4" /> }
    ]
  }
];

export const roleBadgeMap = new Map(roleCategories.flatMap(group =>
  group.badges.map(badge => [badge.id, { ...badge, category: group.category }])
));

export function getRoleCategoryForBadge(badge: CharacterRoleBadge): CharacterRoleCategory | undefined {
  return roleBadgeMap.get(badge)?.category;
}

export function roleBadgeTone(category?: CharacterRoleCategory) {
  if (category === 'Healer') return 'bg-emerald-900/80 text-emerald-100 ring-emerald-300/40';
  if (category === 'Tank') return 'bg-blue-900/80 text-blue-100 ring-blue-300/40';
  if (category === 'DPS') return 'bg-red-900/80 text-red-100 ring-red-300/40';
  if (category === 'Support') return 'bg-violet-900/80 text-violet-100 ring-violet-300/40';
  return 'bg-fantasy-900/80 text-gray-100 ring-yellow-300/30';
}
