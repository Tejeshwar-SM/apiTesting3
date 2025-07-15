import axios from 'axios';

const createApiClient = () => {
  return axios.create({
    baseURL: process.env.STICKY_BASE_URL,
    auth: {
      username: process.env.STICKY_USERNAME,
      password: process.env.STICKY_PASSWORD
    },
    headers: {
      'Content-Type': 'application/json'
    },
    timeout: 30000
  });
};


const TARGET_PRODUCTS = ['2142', '2181', '834'];


export const getTargetProducts = () => TARGET_PRODUCTS;

export const fetchProducts = async () => {
  try {
    console.log('Starting fetchProducts...');
    console.log('API Base URL:', process.env.STICKY_BASE_URL);
    console.log('Username:', process.env.STICKY_USERNAME);
    console.log('Target Products:', TARGET_PRODUCTS);
    
    const api = createApiClient();
    
    console.log('Making API request to /product_index...');
    const response = await api.post('/product_index', {
      product_id: TARGET_PRODUCTS
    });

    console.log('Raw API Response:', {
      status: response.status,
      statusText: response.statusText,
      responseCode: response.data?.response_code,
      dataKeys: Object.keys(response.data || {})
    });

    if (response.data.response_code !== '100') {
      console.error('API returned error code:', response.data.response_code);
      console.error('Full response:', JSON.stringify(response.data, null, 2));
      throw new Error(`API Error: ${response.data.response_code} - ${response.data.message || 'Unknown error'}`);
    }

    const products = response.data.products || {};
    console.log('Products fetched successfully:', Object.keys(products).length);
    console.log('Product IDs returned:', Object.keys(products));

    return products;
  } catch (error) {
    console.error('Error in fetchProducts:', error.message);
    if (error.response) {
      console.error('Error Response Status:', error.response.status);
      console.error('Error Response Data:', error.response.data);
    }
    throw error;
  }
};

export const fetchProductRevenue = async (productId) => {
  try {
    console.log(`Fetching revenue for product: ${productId}`);
    
    const api = createApiClient();
    
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 3);
    
    const formatDate = (date) => {
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const year = date.getFullYear();
      return `${month}/${day}/${year}`;
    };

    const dateRange = {
      start: formatDate(startDate),
      end: formatDate(endDate)
    };

    console.log(`Date range for product ${productId}:`, dateRange);

    const requestData = {
      campaign_id: 'all',
      start_date: dateRange.start,
      end_date: dateRange.end,
      product_id: [productId],
      criteria: 'all',
      search_type: 'all'
    };

    console.log('Order find request:', requestData);

    const response = await api.post('/order_find', requestData);

    console.log(`Order response for ${productId}:`, {
      status: response.status,
      responseCode: response.data?.response_code,
      totalOrders: response.data?.total_orders,
      orderIdsLength: response.data?.order_id?.length || 0
    });

    if (response.data.response_code !== '100') {
      console.warn(`Order find returned: ${response.data.response_code} for product ${productId}`);
      return {
        totalOrders: 0,
        orderIds: [],
        dateRange
      };
    }

    const result = {
      totalOrders: parseInt(response.data.total_orders || 0),
      orderIds: response.data.order_id || [],
      dateRange
    };

    console.log(`Revenue data for ${productId}:`, {
      orders: result.totalOrders,
      orderIds: result.orderIds.length
    });

    return result;

  } catch (error) {
    console.error(`Error fetching revenue for product ${productId}:`, error.message);
    throw error;
  }
};


export const fetchOrderDetails = async (orderIds) => {
  try {
    console.log(`Processing ${orderIds.length} orders...`);
    
    if (orderIds.length === 0) {
      return { totalRevenue: 0, totalQuantity: 0 };
    }

    const api = createApiClient();
    let totalRevenue = 0;
    let totalQuantity = 0;

    
    for (let i = 0; i < orderIds.length; i += 5) {
      const batch = orderIds.slice(i, i + 5);
      
      const batchPromises = batch.map(async (orderId) => {
        try {
          const response = await api.post('/order_view', {
            order_id: [parseInt(orderId)]
          });

          if (response.data.response_code === '100') {
            return {
              revenue: parseFloat(response.data.order_total || 0),
              quantity: parseInt(response.data.main_product_quantity || 0)
            };
          }
        } catch (orderError) {
          console.error(`Error fetching order ${orderId}:`, orderError.message);
        }
        return { revenue: 0, quantity: 0 };
      });

      
      const batchResults = await Promise.all(batchPromises);
      
      // Aggregate results
      batchResults.forEach(result => {
        totalRevenue += result.revenue;
        totalQuantity += result.quantity;
      });
    }

    console.log(`Order processing complete: Revenue: $${totalRevenue}, Quantity: ${totalQuantity}`);

    return {
      totalRevenue,
      totalQuantity
    };
  } catch (error) {
    console.error('Error fetching order details:', error);
    throw error;
  }
};

const stickyService = {
  fetchProducts,
  fetchProductRevenue,
  fetchOrderDetails,
  getTargetProducts
};

export default stickyService;