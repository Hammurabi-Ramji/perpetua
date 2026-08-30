import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      // Verify token and get user info
      api.get('/auth/me').then(response => {
        setUser(response.data.user);
      }).catch(() => {
        localStorage.removeItem('token');
        delete api.defaults.headers.common['Authorization'];
      }).finally(() => {
        setLoading(false);
      });
    } else {
      // Check for OAuth token in URL
      const urlParams = new URLSearchParams(globalThis.location.search);
      const oauthToken = urlParams.get('token');
      if (oauthToken) {
        // Clear the token from URL
        const newUrl = globalThis.location.pathname + globalThis.location.hash;
        globalThis.history.replaceState({}, '', newUrl);
        
        // Set the token and get user info
        localStorage.setItem('token', oauthToken);
        api.defaults.headers.common['Authorization'] = `Bearer ${oauthToken}`;
        api.get('/auth/me').then(response => {
          setUser(response.data.user);
        }).catch(() => {
          localStorage.removeItem('token');
          delete api.defaults.headers.common['Authorization'];
        }).finally(() => {
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    }
  }, []);

  const login = async (credentials) => {
    const response = await api.post('/auth/login', credentials);
    const { token, user } = response.data;
    
    localStorage.setItem('token', token);
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUser(user);
  };

  const register = async (userData) => {
    const response = await api.post('/auth/register', userData);
    const { token, user } = response.data;
    
    localStorage.setItem('token', token);
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUser(user);
  };

  const logout = () => {
    localStorage.removeItem('token');
    delete api.defaults.headers.common['Authorization'];
    setUser(null);
  };

  const value = useMemo(() => ({
    user,
    isAuthenticated: !!user,
    loading,
    login,
    register,
    logout
  }), [user, loading]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}