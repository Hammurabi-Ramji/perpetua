import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { Bell, Mail, Monitor, Save, CheckCircle } from 'lucide-react';

function ReminderSettings() {
  const [settings, setSettings] = useState({
    emailNotifications: true,
    browserNotifications: false,
    notificationEmail: ''
  });

  const queryClient = useQueryClient();

  const { data: currentSettings } = useQuery({ 
    queryKey: ['reminder-settings'], 
    queryFn: () => api.get('/reminders/settings').then(r => r.data)
  });

  useEffect(() => {
    if (currentSettings) {
      setSettings(currentSettings);
    }
  }, [currentSettings]);

  const updateSettings = useMutation({
    mutationFn: (newSettings) => api.patch('/reminders/settings', newSettings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminder-settings'] });
      alert('Settings updated successfully!');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    updateSettings.mutate(settings);
  };

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold text-white mb-2">Reminder Settings</h1>
      <p className="text-gray-400 mb-6">Configure how you want to be notified about license actions</p>

      <div className="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Email Settings */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Mail className="w-6 h-6 text-purple-400" />
              <h2 className="text-xl font-semibold text-white">Email Notifications</h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label htmlFor="email-notifications" className="text-white font-medium">Enable Email Notifications</label>
                  <p className="text-gray-400 text-sm">Receive reminders via email</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    id="email-notifications"
                    type="checkbox"
                    checked={settings.emailNotifications}
                    onChange={(e) => setSettings({...settings, emailNotifications: e.target.checked})}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                </label>
              </div>

              <div>
                <label htmlFor="notification-email" className="block text-white font-medium mb-2">Notification Email</label>
                <input
                  id="notification-email"
                  type="email"
                  value={settings.notificationEmail}
                  onChange={(e) => setSettings({...settings, notificationEmail: e.target.value})}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white focus:border-purple-500 focus:outline-none"
                  placeholder="your-email@example.com"
                />
              </div>
            </div>
          </div>

          {/* Browser Notifications */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Monitor className="w-6 h-6 text-purple-400" />
              <h2 className="text-xl font-semibold text-white">Browser Notifications</h2>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label htmlFor="browser-notifications" className="text-white font-medium">Enable Browser Notifications</label>
                <p className="text-gray-400 text-sm">Receive notifications in your browser</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  id="browser-notifications"
                  type="checkbox"
                  checked={settings.browserNotifications}
                  onChange={(e) => setSettings({...settings, browserNotifications: e.target.checked})}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
              </label>
            </div>
          </div>

          {/* Reminder Types */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Bell className="w-6 h-6 text-purple-400" />
              <h2 className="text-xl font-semibold text-white">Reminder Types</h2>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <div>
                  <p className="text-white font-medium">License Redemption</p>
                  <p className="text-gray-400 text-sm">Reminders for unredeemed licenses</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <div>
                  <p className="text-white font-medium">Action Deadlines</p>
                  <p className="text-gray-400 text-sm">Reminders for upcoming action deadlines</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <div>
                  <p className="text-white font-medium">Weekly Summary</p>
                  <p className="text-gray-400 text-sm">Weekly overview of licenses needing attention</p>
                </div>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={updateSettings.isLoading}
            className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white rounded-lg font-medium transition-colors"
          >
            <Save className="w-4 h-4" />
            {updateSettings.isLoading ? 'Saving...' : 'Save Settings'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default ReminderSettings;