// frontend/src/api/axiosConfig.js
import axios from 'axios';

// Orden de resolución del BASE URL (sin process.env):
// 1) Vite: import.meta.env.VITE_API_BASE
// 2) window.__API_BASE__ (por si lo seteás en index.html)
// 3) localStorage.API_BASE
// 4) fallback 'http://localhost:3000'
const API_BASE =
  (typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.VITE_API_BASE) ||
  (typeof window !== 'undefined' && window.__API_BASE__) ||
  (typeof window !== 'undefined' && window.localStorage.getItem('API_BASE')) ||
  'http://localhost:3000';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 20000,
});

// ===== Interceptor: Authorization =====
api.interceptors.request.use((config) => {
  const token = (typeof window !== 'undefined') ? localStorage.getItem('token') : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ===== Interceptor: 401 global =====
let isRefreshing = false;
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const status = err?.response?.status;
    if (status === 401) {
      if (!isRefreshing) {
        isRefreshing = true;
        try {
          if (typeof window !== 'undefined') {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            localStorage.removeItem('role');
            setTimeout(() => {
              isRefreshing = false;
              if (window.location.pathname !== '/login') {
                window.location.href = '/login';
              }
            }, 50);
          }
        } finally {
          isRefreshing = false;
        }
      }
    }
    return Promise.reject(err);
  }
);

export default api;
