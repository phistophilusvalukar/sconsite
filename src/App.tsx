import { lazy, Suspense } from 'react';
import type React from 'react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { BrowserRouter as Router, Navigate, Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import DiscordLogin from './components/DiscordLogin';
import AuthCallbackPage from './pages/AuthCallbackPage';
import { AuthProvider } from './context/AuthContext';
import { PageVisibilityProvider } from './context/PageVisibilityContext';
import { useAuth } from './context/useAuth';
import { usePageVisibility } from './context/usePageVisibility';
import { SitePageKey } from './config/sitePages';

const HomePage = lazy(() => import('./pages/HomePage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const RulesPage = lazy(() => import('./pages/RulesPage'));
const LorePage = lazy(() => import('./pages/LorePage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const CharacterPage = lazy(() => import('./pages/CharacterPage'));
const CharacterProfilePage = lazy(() => import('./pages/CharacterProfilePage'));
const CharacterPlannerPage = lazy(() => import('./pages/CharacterPlannerPage'));
const CitizenRegistryPage = lazy(() => import('./pages/CitizenRegistryPage'));
const GuildsPage = lazy(() => import('./pages/GuildsPage'));
const GuildProfilePage = lazy(() => import('./pages/GuildProfilePage'));
const GuildManagementPage = lazy(() => import('./pages/GuildManagementPage'));
const NewsPage = lazy(() => import('./pages/NewsPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const SchedulePage = lazy(() => import('./pages/SchedulePage'));
const GamesPage = lazy(() => import('./pages/GamesPage'));
const SkillChecksPage = lazy(() => import('./pages/SkillChecksPage'));
const TicketLogsPage = lazy(() => import('./pages/TicketLogsPage'));
const EventPage = lazy(() => import('./pages/EventPage'));
const ContractsOfficePage = lazy(() => import('./features/contracts/routes/ContractsOfficePage'));
const ArcaneLocksPage = lazy(() => import('./features/arcane-locks/routes/ArcaneLocksPage'));
const CardGamePage = lazy(() => import('./pages/CardGamePage'));
const BrokenSealsPage = lazy(() => import('./features/broken-seals/routes/BrokenSealsPage'));
const CampaignObjectivesPage = lazy(() => import('./features/campaign-objectives/routes/CampaignObjectivesPage'));
const HellknightAutobattlerPage = lazy(() => import('./features/hellknight-autobattler/routes/HellknightAutobattlerPage'));
const TacticalPuzzlesPage = lazy(() => import('./features/tactical-puzzles/routes/TacticalPuzzlesPage'));
const DbAdminPage = lazy(() => import('./pages/DbAdminPage'));
const MarketplacePage = lazy(() => import('./features/marketplace/MarketplacePage'));
const ShopPage = lazy(() => import('./features/marketplace/ShopPage'));

function RouteFallback() {
  return (
    <div className="site-route-fallback">
      <div className="site-route-loader" aria-label="Loading page" />
    </div>
  );
}

function AppRoutes() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const isAuthReturn = location.pathname !== '/auth/callback' && (
    searchParams.has('code') ||
    searchParams.has('error') ||
    searchParams.has('error_description')
  );

  if (isAuthReturn) {
    return <AuthCallbackPage />;
  }

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<PageGate pageKey="home"><HomePage /></PageGate>} />
        <Route path="/about" element={<PageGate pageKey="about"><AboutPage /></PageGate>} />
        <Route path="/rules" element={<RulesPage />} />
        <Route path="/lore" element={<PageGate pageKey="lore"><LorePage /></PageGate>} />
        <Route path="/lore/:slug" element={<PageGate pageKey="lore"><LorePage /></PageGate>} />
        <Route path="/characters" element={<MemberPageGate pageKey="characters"><CharacterPage /></MemberPageGate>} />
        <Route path="/characters/:characterId" element={<MemberPageGate pageKey="characters"><CharacterProfilePage /></MemberPageGate>} />
        <Route path="/characters/:characterId/planner" element={<MemberPageGate pageKey="characters"><CharacterPlannerPage /></MemberPageGate>} />
        <Route path="/public/characters/:characterId" element={<CharacterProfilePage publicView />} />
        <Route path="/citizens" element={<MemberPageGate pageKey="citizens"><CitizenRegistryPage /></MemberPageGate>} />
        <Route path="/guilds" element={<MemberPageGate pageKey="guilds"><GuildsPage /></MemberPageGate>} />
        <Route path="/guilds/:guildId/manage" element={<MemberPageGate pageKey="guilds"><GuildManagementPage /></MemberPageGate>} />
        <Route path="/guilds/:guildId" element={<MemberPageGate pageKey="guilds"><GuildProfilePage /></MemberPageGate>} />
        <Route path="/schedule" element={<PageGate pageKey="schedule"><SchedulePage /></PageGate>} />
        <Route path="/schedule/:pollId" element={<PageGate pageKey="schedule"><SchedulePage /></PageGate>} />
        <Route path="/games" element={<PageGate pageKey="games"><GamesPage /></PageGate>} />
        <Route path="/marketplace" element={<MemberPageGate pageKey="marketplace"><MarketplacePage /></MemberPageGate>} />
        <Route path="/marketplace/:shopId" element={<MemberPageGate pageKey="marketplace"><ShopPage /></MemberPageGate>} />
        <Route path="/ticket-log" element={<TicketLogsPage />} />
        <Route path="/ticket-logs" element={<Navigate to="/ticket-log" replace />} />
        <Route path="/arcana" element={<PageGate pageKey="arcana"><CardGamePage /></PageGate>} />
        <Route path="/underhaul/contracts" element={<PageGate pageKey="underhaul-contracts"><ContractsOfficePage /></PageGate>} />
        <Route path="/underhaul/contracts/:slug" element={<PageGate pageKey="underhaul-contracts"><ContractsOfficePage /></PageGate>} />
        <Route path="/arcane-locks" element={<PageGate pageKey="arcane-locks"><ArcaneLocksPage /></PageGate>} />
        <Route path="/arcane-locks/:sessionId" element={<PageGate pageKey="arcane-locks"><ArcaneLocksPage /></PageGate>} />
        <Route path="/broken-seals" element={<PageGate pageKey="broken-seals"><BrokenSealsPage /></PageGate>} />
        <Route path="/citadel-tactics" element={<PageGate pageKey="citadel-tactics"><HellknightAutobattlerPage /></PageGate>} />
        <Route path="/tactical-puzzles" element={<PageGate pageKey="tactical-puzzles"><TacticalPuzzlesPage /></PageGate>} />
        <Route path="/campaign-objectives" element={<PageGate pageKey="campaign-objectives"><CampaignObjectivesPage /></PageGate>} />
        <Route path="/campaign-objectives/:campaignSlug" element={<PageGate pageKey="campaign-objectives"><CampaignObjectivesPage /></PageGate>} />
        <Route path="/campaign-objectives/:campaignSlug/parties/:partyId" element={<PageGate pageKey="campaign-objectives"><CampaignObjectivesPage /></PageGate>} />
        <Route path="/campaign-objectives/:campaignSlug/journals/:journalId" element={<PageGate pageKey="campaign-objectives"><CampaignObjectivesPage /></PageGate>} />
        <Route path="/event" element={<PageGate pageKey="event"><EventPage /></PageGate>} />
        <Route path="/skill-checks" element={<PageGate pageKey="skill-checks"><SkillChecksPage /></PageGate>} />
        <Route path="/skill-checks/challenges" element={<PageGate pageKey="skill-checks"><SkillChecksPage /></PageGate>} />
        <Route path="/skill-checks/performance" element={<PageGate pageKey="skill-checks"><SkillChecksPage /></PageGate>} />
        <Route path="/lock-challenge/:challengeId/player/:token" element={<PageGate pageKey="skill-checks"><SkillChecksPage /></PageGate>} />
        <Route path="/lock-challenge/:challengeId/spectate/:token" element={<PageGate pageKey="skill-checks"><SkillChecksPage /></PageGate>} />
        <Route path="/news" element={<PageGate pageKey="news"><NewsPage /></PageGate>} />
        <Route path="/news/:slug" element={<PageGate pageKey="news"><NewsPage /></PageGate>} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/db-admin" element={<DbAdminPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <PageVisibilityProvider>
          <AppLayout />
        </PageVisibilityProvider>
        <SpeedInsights />
      </Router>
    </AuthProvider>
  );
}

function AppLayout() {
  const location = useLocation();
  const { isLoading, user } = useAuth();
  const isPublicResource = location.pathname.startsWith('/ticket-log')
    || location.pathname === '/rules'
    || location.pathname.startsWith('/public/characters/');
  const hideFooter = location.pathname === '/';

  if (isLoading) {
    return <RouteFallback />;
  }

  if (user?.isBanned || user?.profile?.isBanned) {
    return <BannedPage />;
  }

  if (isPublicResource) {
    return (
      <div className="site-app-shell public-resource-shell min-h-screen">
        <main className="site-main">
          <AppRoutes />
        </main>
      </div>
    );
  }

  return (
    <div className="site-app-shell flex min-h-screen flex-col">
      <Header />
      <main className="site-main flex-1">
        <AppRoutes />
      </main>
      {!hideFooter && <Footer />}
    </div>
  );
}

function BannedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-midnight-950 px-6">
      <section className="max-w-xl rounded-2xl border border-red-500/40 bg-red-950/20 p-8 text-center shadow-2xl">
        <h1 className="font-fantasy text-4xl font-bold text-white">Account banned</h1>
        <p className="mt-4 text-lg leading-8 text-red-100">You have been banned. Please contact staff on the SCON discord.</p>
      </section>
    </main>
  );
}

function PageGate({ children, pageKey }: { children: React.ReactNode; pageKey: SitePageKey }) {
  const { user } = useAuth();
  const { isLoading, isPageEnabled } = usePageVisibility();
  const isAdmin = Boolean(user?.isAdmin || user?.profile?.isAdmin);

  if (isLoading) {
    return <RouteFallback />;
  }

  if (!isAdmin && !isPageEnabled(pageKey)) {
    return (
      <div className="site-empty-state">
        <div className="site-empty-state-card">
          <p className="site-kicker">The registry</p>
          <h1>Page unavailable</h1>
          <p>
            This page is currently hidden from public navigation. Please check back later.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function MemberPageGate({ children, pageKey }: { children: React.ReactNode; pageKey: SitePageKey }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <RouteFallback />;
  }

  if (!isAuthenticated) {
    return (
      <div className="site-empty-state">
        <div className="site-empty-state-card">
          <p className="site-kicker">Members only</p>
          <h1>Continue with Discord</h1>
          <p>Sign in with your Shattered Convergence Discord account to open this registry.</p>
          <div className="site-empty-state-action"><DiscordLogin /></div>
        </div>
      </div>
    );
  }

  return <PageGate pageKey={pageKey}>{children}</PageGate>;
}

export default App;
