import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, XCircle } from 'lucide-react';

function OAuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const success = searchParams.get('success');
  const error = searchParams.get('error');

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate('/sites');
    }, 3000);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        {success ? (
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-8">
            <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white mb-2">Success!</h1>
            <p className="text-green-200">
              Successfully connected to {success.replace('_', ' ')}
            </p>
            <p className="text-gray-400 text-sm mt-4">
              Redirecting to sites page...
            </p>
          </div>
        ) : (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-8">
            <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white mb-2">Connection Failed</h1>
            <p className="text-red-200">
              {error || 'Failed to connect to the site'}
            </p>
            <p className="text-gray-400 text-sm mt-4">
              Redirecting to sites page...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default OAuthCallback;