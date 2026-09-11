import axios from 'axios';

// Point to the backend API
const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || '/api',
    timeout: 60000,
});

// Attach JWT token automatically to every request
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
});

// Auto-redirect on 401/403
api.interceptors.response.use(
    (res) => res,
    (error) => {
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            // Redirect to login without hard reload when possible
            if (window.location.pathname !== '/login') {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export default api;
