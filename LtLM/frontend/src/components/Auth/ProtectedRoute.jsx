import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import MasterPasswordUnlock from '../MasterPasswordUnlock';

function ProtectedRoute() {
  // Check if station is unlocked first
  const isUnlocked = localStorage.getItem('station_unlocked') === 'true';
  const currentPath = globalThis.location ? globalThis.location.pathname : '/';

  console.log('ProtectedRoute check:', { isUnlocked, currentPath });

  if (!isUnlocked && currentPath !== '/login') {
    console.log('Showing unlock screen');
    // Store intended path for after unlock
    localStorage.setItem('intended_path', currentPath);
    return <MasterPasswordUnlock />;
  }

  // Now check authentication
  const { isAuthenticated, loading } = useAuth();

  console.log('Auth check:', { isAuthenticated, loading });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-lg">Loading...</div>
      </div>
    );
  }

  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
}

export default ProtectedRoute;