import React, { useState } from 'react';
import { Loader2, LogIn } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

const DiscordLogin: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const location = useLocation();
  const { login } = useAuth();

  const handleDiscordLogin = async () => {
    try {
      setIsLoading(true);
      await login(`${location.pathname}${location.search}${location.hash}`);
    } catch (error) {
      console.error('Failed to start Discord login:', error);
      alert('Failed to start login process. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDiscordLogin}
      disabled={isLoading}
      className="site-login-button"
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <LogIn className="w-4 h-4" />
      )}
      <span>{isLoading ? 'Connecting...' : 'Login with Discord'}</span>
    </button>
  );
};

export default DiscordLogin;
