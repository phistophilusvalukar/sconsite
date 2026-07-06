import React from 'react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import HomePage from './pages/HomePage';
import AboutPage from './pages/AboutPage';
import CharacterPage from './pages/CharacterPage';
import CitizenRegistryPage from './pages/CitizenRegistryPage';
import GuildsPage from './pages/GuildsPage';
import NewsPage from './pages/NewsPage';
import ProfilePage from './pages/ProfilePage';
import AuthCallbackPage from './pages/AuthCallbackPage';
import { AuthProvider } from './context/AuthContext';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-fantasy-gradient">
          <Header />
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/characters" element={<CharacterPage />} />
              <Route path="/citizens" element={<CitizenRegistryPage />} />
              <Route path="/guilds" element={<GuildsPage />} />
              <Route path="/news" element={<NewsPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/auth/callback" element={<AuthCallbackPage />} />
            </Routes>
          </main>
          <Footer />
        </div>
        <SpeedInsights />
      </Router>
    </AuthProvider>
  );
}

export default App;
