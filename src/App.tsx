import { lazy, Suspense } from 'react';
import type React from 'react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import AuthCallbackPage from './pages/AuthCallbackPage';
import { AuthProvider } from './context/AuthContext';
import { PageVisibilityProvider } from './context/PageVisibilityContext';
import { useAuth } from './context/useAuth';
import { usePageVisibility } from './context/usePageVisibility';
import { SitePageKey } from './config/sitePages';

const HomePage = lazy(() => import('./pages/HomePage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const CharacterPage = lazy(() => import('./pages/CharacterPage'));
const CitizenRegistryPage = lazy(() => import('./pages/CitizenRegistryPage'));
const GuildsPage = lazy(() => import('./pages/GuildsPage'));
const NewsPage = lazy(() => import('./pages/NewsPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const SchedulePage = lazy(() => import('./pages/SchedulePage'));
const GamesPage = lazy(() => import('./pages/GamesPage'));
const SkillChecksPage = lazy(() => import('./pages/SkillChecksPage'));
const EventPage = lazy(() => import('./pages/EventPage'));
const ContractsOfficePage = lazy(() => import('./features/contracts/routes/ContractsOfficePage'));

function RouteFallback() {
  return (
    <div className="flex min-h-[45vh] items-center justify-center px-4 py-16">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-fantasy-700/40 border-t-yellow-400" aria-label="Loading page" />
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
        <Route path="/characters" element={<PageGate pageKey="characters"><CharacterPage /></PageGate>} />
        <Route path="/citizens" element={<PageGate pageKey="citizens"><CitizenRegistryPage /></PageGate>} />
        <Route path="/guilds" element={<PageGate pageKey="guilds"><GuildsPage /></PageGate>} />
        <Route path="/schedule" element={<PageGate pageKey="schedule"><SchedulePage /></PageGate>} />
        <Route path="/schedule/:pollId" element={<PageGate pageKey="schedule"><SchedulePage /></PageGate>} />
        <Route path="/games" element={<PageGate pageKey="games"><GamesPage /></PageGate>} />
        <Route path="/underhaul/contracts" element={<PageGate pageKey="underhaul-contracts"><ContractsOfficePage /></PageGate>} />
        <Route path="/underhaul/contracts/:slug" element={<PageGate pageKey="underhaul-contracts"><ContractsOfficePage /></PageGate>} />
        <Route path="/event" element={<PageGate pageKey="event"><EventPage /></PageGate>} />
        <Route path="/skill-checks" element={<PageGate pageKey="skill-checks"><SkillChecksPage /></PageGate>} />
        <Route path="/skill-checks/challenges" element={<PageGate pageKey="skill-checks"><SkillChecksPage /></PageGate>} />
        <Route path="/skill-checks/performance" element={<PageGate pageKey="skill-checks"><SkillChecksPage /></PageGate>} />
        <Route path="/lock-challenge/:challengeId/player/:token" element={<PageGate pageKey="skill-checks"><SkillChecksPage /></PageGate>} />
        <Route path="/lock-challenge/:challengeId/spectate/:token" element={<PageGate pageKey="skill-checks"><SkillChecksPage /></PageGate>} />
        <Route path="/news" element={<PageGate pageKey="news"><NewsPage /></PageGate>} />
        <Route path="/news/:slug" element={<PageGate pageKey="news"><NewsPage /></PageGate>} />
        <Route path="/admin" element={<AdminPage />} />
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
  const hideFooter = location.pathname === '/';

  return (
    <div className="flex min-h-screen flex-col bg-fantasy-gradient">
      <Header />
      <main className="flex-1">
        <AppRoutes />
      </main>
      {!hideFooter && <Footer />}
    </div>
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
      <div className="flex min-h-[55vh] items-center justify-center px-4 py-16">
        <div className="max-w-xl rounded-xl border border-fantasy-700/30 bg-fantasy-900/30 p-8 text-center">
          <h1 className="font-fantasy text-3xl font-bold text-white">Page unavailable</h1>
          <p className="mt-4 text-gray-300">
            This page is currently hidden from public navigation. Please check back later.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default App;
