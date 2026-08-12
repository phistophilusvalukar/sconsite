import React, { useState } from 'react';
import { Loader2, LogIn } from 'lucide-react';
import { useAuth } from '../context/useAuth';

const GoogleLogin: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();

  const handleGoogleLogin = async () => {
    try {
      setIsLoading(true);
      await login();
    } catch (error) {
      console.error('Failed to start Google login:', error);
      alert('Failed to start login process. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleGoogleLogin}
      disabled={isLoading}
      className="site-login-button"
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <LogIn className="w-4 h-4" />
      )}
      <span>{isLoading ? 'Connecting...' : 'Login with Google'}</span>
    </button>
  );
};

export default GoogleLogin;
