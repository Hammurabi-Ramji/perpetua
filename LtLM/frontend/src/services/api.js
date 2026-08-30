import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
  headers: {
    'Content-Type': 'application/json'
  },
  // Add retry configuration
  retry: 3,
  retryDelay: 1000
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor with retry logic
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;

    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      delete api.defaults.headers.common['Authorization'];
      globalThis.location.href = '/login';
      throw error;
    }

    // Retry logic for network errors or 5xx errors
    if (!config?.retry) throw error;

    config.retryCount = config.retryCount || 0;

    if (config.retryCount >= config.retry) {
      throw error;
    }

    config.retryCount += 1;

    const delay = config.retryDelay || 1000;
    await new Promise(resolve => setTimeout(resolve, delay));

    return api(config);
  }
);

export { api };