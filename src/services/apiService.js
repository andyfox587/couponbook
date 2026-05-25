//src/services/apiService.js
import axios from 'axios';
import { getAccessToken } from '@/services/authService';

const remote = process.env.VUE_APP_API_URL;
if (!remote && process.env.NODE_ENV === 'production') {
  throw new Error('VUE_APP_API_URL is not defined in production');
}

const api = axios.create({
  baseURL: '/api/v1',
});

// Auto-attach the Cognito bearer token to every request when the user is
// signed in. Anonymous calls (public GETs like /groups, /coupons) still work
// because we only set the header when a token is available.
api.interceptors.request.use(async (config) => {
  try {
    const token = await getAccessToken();
    if (token) {
      config.headers = config.headers || {};
      if (!config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
  } catch (e) {
    // Token fetch errors shouldn't block public requests; let the server
    // respond with 401 if the endpoint actually requires auth.
    console.warn('[apiService] failed to attach access token:', e);
  }
  return config;
});

export default api;
