import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './hooks/useAuth';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import LicenseManager from './components/LicenseManager';
import LicenseDetail from './components/LicenseDetail';
import SiteConnector from './components/SiteConnector';
import ReminderSettings from './components/ReminderSettings';
import GretaChat from './components/GretaChat';
import Twidget from './components/Twidget';
import Pickaxe from './components/Pickaxe';
import Storage from './components/Storage';
import EdubaLibrary from './components/EdubaLibrary';
import Login from './components/Auth/Login';
import OAuthCallback from './components/Auth/OAuthCallback';
import ProtectedRoute from './components/Auth/ProtectedRoute';
import './styles/index.css';

const queryClient = new QueryClient();

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Router>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/auth/callback" element={<OAuthCallback />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<Layout />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/licenses" element={<LicenseManager />} />
                  <Route path="/licenses/:id" element={<LicenseDetail />} />
                  <Route path="/sites" element={<SiteConnector />} />
                  <Route path="/reminders" element={<ReminderSettings />} />
                  <Route path="/greta" element={<GretaChat />} />
                  <Route path="/twidget" element={<Twidget />} />
                  <Route path="/pickaxe" element={<Pickaxe />} />
                  <Route path="/storage" element={<Storage />} />
                  <Route path="/eduba" element={<EdubaLibrary />} />
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Router>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;