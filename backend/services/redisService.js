import redis from 'redis';

let client = null;
let isConnected = false;

const connect = async () => {
  try {
    client = redis.createClient({
      url: `redis://localhost:6379`,
      password: process.env.REDIS_PASSWORD,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.log('Redis connection attempts exhausted');
            return false;
          }
          return Math.min(retries * 100, 3000);
        }
      }
    });

    client.on('connect', () => {
      console.log('Redis client connected');
      isConnected = true;
    });

    client.on('error', (err) => {
      console.log('Redis client error:', err);
      isConnected = false;
    });

    client.on('end', () => {
      console.log('Redis client disconnected');
      isConnected = false;
    });

    await client.connect();
    console.log('Redis service initialized');
    
  } catch (error) {
    console.error('Redis connection failed:', error);
    isConnected = false;
  }
};

const disconnect = async () => {
  if (client && isConnected) {
    await client.quit();
    console.log('Redis disconnected');
  }
};


const set = async (key, value, ttlSeconds = 3600) => {
  try {
    if (!isConnected) {
      console.warn('Redis not connected, skipping cache set');
      return false;
    }

    const serializedValue = JSON.stringify(value);
    await client.setEx(key, ttlSeconds, serializedValue);
    console.log(`Cached: ${key} (TTL: ${ttlSeconds}s)`);
    return true;
  } catch (error) {
    console.error(`Redis SET error for key ${key}:`, error);
    return false;
  }
};


const get = async (key) => {
  try {
    if (!isConnected) {
      console.warn('Redis not connected, skipping cache get');
      return null;
    }

    const value = await client.get(key);
    if (value) {
      console.log(`Cache HIT: ${key}`);
      return JSON.parse(value);
    } else {
      console.log(`Cache MISS: ${key}`);
      return null;
    }
  } catch (error) {
    console.error(`Redis GET error for key ${key}:`, error);
    return null;
  }
};

const del = async (key) => {
  try {
    if (!isConnected) {
      console.warn('Redis not connected, skipping cache delete');
      return false;
    }

    const result = await client.del(key);
    console.log(`Deleted cache: ${key}`);
    return result > 0;
  } catch (error) {
    console.error(`Redis DEL error for key ${key}:`, error);
    return false;
  }
};


const clearPattern = async (pattern) => {
  try {
    if (!isConnected) {
      console.warn('Redis not connected, skipping pattern clear');
      return 0;
    }

    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      const result = await client.del(keys);
      console.log(`Cleared ${result} keys matching pattern: ${pattern}`);
      return result;
    }
    return 0;
  } catch (error) {
    console.error(`Redis pattern clear error for ${pattern}:`, error);
    return 0;
  }
};


const getStats = async () => {
  try {
    if (!isConnected) {
      return { connected: false };
    }

    const info = await client.info('memory');
    const keyCount = await client.dbSize();
    
    return {
      connected: isConnected,
      keyCount,
      memoryInfo: info
    };
  } catch (error) {
    console.error('Redis stats error:', error);
    return { connected: false, error: error.message };
  }
};


const redisService = {
  connect,
  disconnect,
  set,
  get,
  del,
  clearPattern,
  getStats,
  get isConnected() {
    return isConnected;
  }
};

export default redisService;