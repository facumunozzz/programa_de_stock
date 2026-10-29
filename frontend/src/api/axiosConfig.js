import axios from "axios";

const configurado =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE) ||
  (typeof window !== "undefined" && window.__API_BASE__) ||
  (typeof window !== "undefined" && window.localStorage.getItem("API_BASE")) ||
  (typeof window !== "undefined" && window.location.port === "3000" ? window.location.origin : "http://localhost:3000");

const baseSinBarra = String(configurado).replace(/\/+$/, "");
const API_BASE = baseSinBarra.endsWith("/api") ? baseSinBarra : `${baseSinBarra}/api`;

const api = axios.create({
  baseURL: API_BASE,
  timeout: 20000,
});

api.interceptors.request.use((config) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let isRefreshing = false;

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const status = err?.response?.status;

    if (status === 401 && !isRefreshing) {
      isRefreshing = true;

      try {
        if (typeof window !== "undefined") {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          localStorage.removeItem("role");

          setTimeout(() => {
            isRefreshing = false;
            if (window.location.pathname !== "/login") window.location.href = "/login";
          }, 50);
        }
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(err);
  }
);

export default api;