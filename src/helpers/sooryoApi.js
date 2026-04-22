import axios from "axios";

export function getSooryoApiBaseUrl() {
  return import.meta.env.VITE_API_BASE_URL || "http://localhost:5075";
}

function bearerFromAuthUser(obj) {
  if (!obj?.accessToken) return null;
  const t = String(obj.accessToken).trim();
  if (!t) return null;
  return /^bearer\s/i.test(t) ? t : `Bearer ${t}`;
}

/** Axios instance that sends `Authorization: Bearer …` from `localStorage.authUser`. */
export function createSooryoAuthorizedClient() {
  const client = axios.create({ baseURL: getSooryoApiBaseUrl() });
  client.interceptors.request.use((config) => {
    try {
      const raw = localStorage.getItem("authUser");
      if (!raw) return config;
      const obj = JSON.parse(raw);
      const auth = bearerFromAuthUser(obj);
      if (auth) {
        config.headers = config.headers || {};
        config.headers.Authorization = auth;
      }
    } catch {
      /* ignore */
    }
    return config;
  });
  return client;
}

export function getAuthUserId() {
  try {
    const raw = localStorage.getItem("authUser");
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (obj.uid != null && obj.uid !== "") return Number(obj.uid);
    if (obj.id != null && obj.id !== "") return Number(obj.id);
  } catch {
    /* ignore */
  }
  return null;
}
