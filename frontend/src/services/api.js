import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 60000
});

export const productAPI = {
  getAllProducts: async () => {
    const response = await api.get('/products');
    return response.data;
  },

  syncProducts: async () => {
    const response = await api.post('/products/sync');
    return response.data;
  },

  findProductsByIds: async (productIds) => {
    const idsString = Array.isArray(productIds) ? productIds.join(',') : productIds;
    const response = await api.get(`/products/find?ids=${idsString}`);
    return response.data;
  },

  getAnalytics: async () => {
    const response = await api.get('/products/analytics');
    return response.data;
  }
};

export default api;