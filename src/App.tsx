import { lazy, Suspense } from 'react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import { AuthProvider } from './context/AuthContext';

const HomePage = lazy(() => import('./pages/HomePage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const CharacterPage = lazy(() => import('./pages/CharacterPage'));
const CitizenRegistryPage = lazy(() => import('./pages/CitizenRegistryPage'));
const GuildsPage = lazy(() => import('./pages/GuildsPage'));
const NewsPage = lazy(() => import('./pages/NewsPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const AuthCallbackPage = lazy(() => import('./pages/AuthCallbackPage'));
const SchedulePage = lazy(() => import('./pages/SchedulePage'));
const GamesPage = lazy(() => import('./pages/GamesPage'));

function RouteFallback() {
  return (
    <div className="flex min-h-[45vh] items-center justify-center px-4 py-16">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-fantasy-700/40 border-t-yellow-400" aria-label="Loading page" />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-fantasy-gradient">
          <Header />
          <main className="flex-1">
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/characters" element={<CharacterPage />} />
                <Route path="/citizens" element={<CitizenRegistryPage />} />
                <Route path="/guilds" element={<GuildsPage />} />
                <Route path="/schedule" element={<SchedulePage />} />
                <Route path="/schedule/:pollId" element={<SchedulePage />} />
                <Route path="/games" element={<GamesPage />} />
                <Route path="/news" element={<NewsPage />} />
                <Route path="/news/:slug" element={<NewsPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/auth/callback" element={<AuthCallbackPage />} />
              </Routes>
            </Suspense>
          </main>
          <Footer />
        </div>
        <SpeedInsights />
      </Router>
    </AuthProvider>
  );
}

export default App;
