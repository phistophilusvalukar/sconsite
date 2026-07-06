import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { supabase } from '../config/database';

const AuthCallbackPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const handleCallback = async () => {
      const oauthError = searchParams.get('error_description') || searchParams.get('error');
      if (oauthError) {
        setStatus('error');
        setErrorMessage(oauthError);
        return;
      }

      try {
        const code = searchParams.get('code');
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            throw exchangeError;
          }
        }

        const { data, error } = await supabase.auth.getSession();
        if (error) {
          throw error;
        }

        if (!data.session) {
          setStatus('error');
          setErrorMessage('No active session was returned from Google. Please try logging in again.');
          return;
        }

        setStatus('success');
        setTimeout(() => navigate('/', { replace: true }), 1200);
      } catch (err) {
        console.error('Authentication callback failed:', err);
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : 'Login failed');
      }
    };

    handleCallback();
  }, [navigate, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full text-center">
        {status === 'loading' && (
          <>
            <Loader2 className="w-16 h-16 text-yellow-400 mx-auto mb-6 animate-spin" />
            <h2 className="font-fantasy text-3xl font-bold text-white mb-4">Authenticating...</h2>
            <p className="text-gray-300">Please wait while we finish setting up your session.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle className="w-16 h-16 text-emerald-400 mx-auto mb-6" />
            <h2 className="font-fantasy text-3xl font-bold text-white mb-4">Welcome, Adventurer!</h2>
            <p className="text-gray-300">Successfully authenticated. Redirecting you home...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-6" />
            <h2 className="font-fantasy text-3xl font-bold text-white mb-4">Authentication Failed</h2>
            <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-4 mb-6">
              <p className="text-red-400 text-sm">{errorMessage}</p>
            </div>
            <button
              onClick={() => navigate('/', { replace: true })}
              className="w-full px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-midnight-900 font-bold rounded-lg transition-colors"
            >
              Return to Homepage
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthCallbackPage;
