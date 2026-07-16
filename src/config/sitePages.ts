import type React from 'react';
import {
  Briefcase,
  CalendarDays,
  ClipboardList,
  Home,
  Newspaper,
  Scroll,
  Shield,
  Sparkles,
  Sun,
  Ticket,
  User,
  Users,
  Wrench
} from 'lucide-react';

export type SitePageKey =
  | 'home'
  | 'about'
  | 'characters'
  | 'citizens'
  | 'guilds'
  | 'schedule'
  | 'games'
  | 'underhaul-contracts'
  | 'arcane-locks'
  | 'event'
  | 'skill-checks'
  | 'news';

export interface SitePageDefinition {
  key: SitePageKey;
  name: string;
  href: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  routePrefixes: string[];
}

export const sitePages: SitePageDefinition[] = [
  {
    key: 'home',
    name: 'Home',
    href: '/',
    description: 'Landing page, server snapshot, and community overview.',
    icon: Home,
    routePrefixes: ['/']
  },
  {
    key: 'about',
    name: 'About',
    href: '/about',
    description: 'Campaign premise and Westmarch server information.',
    icon: Scroll,
    routePrefixes: ['/about']
  },
  {
    key: 'characters',
    name: 'Characters',
    href: '/characters',
    description: 'Public character gallery and party role browsing.',
    icon: User,
    routePrefixes: ['/characters']
  },
  {
    key: 'citizens',
    name: 'Registry',
    href: '/citizens',
    description: 'Citizen registry and player lookup tools.',
    icon: ClipboardList,
    routePrefixes: ['/citizens']
  },
  {
    key: 'guilds',
    name: 'Guilds',
    href: '/guilds',
    description: 'Guild roster, applications, and guild management.',
    icon: Users,
    routePrefixes: ['/guilds']
  },
  {
    key: 'schedule',
    name: 'Schedule',
    href: '/schedule',
    description: 'Availability polls and schedule coordination.',
    icon: CalendarDays,
    routePrefixes: ['/schedule']
  },
  {
    key: 'games',
    name: 'Games',
    href: '/games',
    description: 'Game listings, applications, rosters, and archives.',
    icon: Ticket,
    routePrefixes: ['/games']
  },
  {
    key: 'underhaul-contracts',
    name: 'UnderHaul',
    href: '/underhaul/contracts',
    description: 'UnderHaul Contracts Office document-inspection game.',
    icon: Briefcase,
    routePrefixes: ['/underhaul/contracts']
  },
  {
    key: 'arcane-locks',
    name: 'Arcane Locks',
    href: '/arcane-locks',
    description: 'Collaborative magical lock puzzle sessions.',
    icon: Sparkles,
    routePrefixes: ['/arcane-locks']
  },
  {
    key: 'event',
    name: 'Event',
    href: '/event',
    description: 'Current event page and tutorial content.',
    icon: Sun,
    routePrefixes: ['/event']
  },
  {
    key: 'skill-checks',
    name: 'GM Tools',
    href: '/skill-checks',
    description: 'Skill checks, lock challenges, and performance tools.',
    icon: Wrench,
    routePrefixes: ['/skill-checks', '/lock-challenge']
  },
  {
    key: 'news',
    name: 'News',
    href: '/news',
    description: 'News posts, updates, comments, and announcements.',
    icon: Newspaper,
    routePrefixes: ['/news']
  }
];

export const adminPage = {
  name: 'Admin',
  href: '/admin',
  icon: Shield
};

export function getSitePageByKey(key: SitePageKey) {
  return sitePages.find(page => page.key === key);
}
