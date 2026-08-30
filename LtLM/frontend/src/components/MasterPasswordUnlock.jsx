import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Eye, EyeOff } from 'lucide-react';
import { api } from '../services/api';

function MasterPasswordUnlock() {
  const [masterPassword, setMasterPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      // For now, just check if the master password matches
      // In a real implementation, this would verify against a stored hash
      if (masterPassword === 'R0ninj@h1984') {
        // Store unlock status in localStorage
        localStorage.setItem('station_unlocked', 'true');
        localStorage.setItem('master_password', masterPassword);

        // Navigate to the intended page or dashboard
        const intendedPath = localStorage.getItem('intended_path') || '/';
        navigate(intendedPath);
      } else {
        setError('Invalid master password');
      }
    } catch (err) {
      setError('Failed to unlock station');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <Shield className="w-16 h-16 text-purple-400 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-white">C2CS</h1>
          <p className="text-gray-400 mt-2">Concept to Creation Station</p>
          <p className="text-gray-400 text-sm mt-4">Enter your master password to unlock.</p>
        </div>

        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="master-password" className="block text-gray-300 text-sm font-medium mb-2">
                Master Password
              </label>
              <div className="relative">
                <input
                  id="master-password"
                  type={showPassword ? 'text' : 'password'}
                  value={masterPassword}
                  onChange={(e) => setMasterPassword(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 pr-12 text-white focus:border-purple-500 focus:outline-none"
                  placeholder="Enter master password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-red-400 text-sm text-center">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl transition-all disabled:opacity-50 active:scale-95"
            >
              {isLoading ? 'Unlocking...' : 'Unlock Station'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default MasterPasswordUnlock;