import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import connectDB from './config/database.js';
import productRoutes from './routes/products.js';
import redisService from './services/redisService.js';
import cacheService from './services/cacheService.js';
import jobRoutes from './routes/jobs.js';
import queueService from './services/queueService.js';
import { startWorkers, stopWorkers } from './workers/workerManager.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const app = express();

// Connect to databases
connectDB();
redisService.connect();
queueService.initializeQueues();
const workers = startWorkers();

app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true
}));
app.use(express.json());

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

app.use('/api/products', productRoutes);
app.use('/api/jobs', jobRoutes);

app.get('/api/health', async (req, res) => {
  try {
    const cacheStats = await cacheService.getCacheStats();
    
    res.json({
      message: 'Product Analytics API is running',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        redis: redisService.isConnected ? 'Connected' : 'Disconnected',
        mongodb: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
      },
      cache: {
        enabled: true,
        redis: cacheStats?.redis || null,
        mongodb: cacheStats?.mongodb || null
      },
      routes: [
        'GET /api/health',
        'GET /api/products',
        'GET /api/products/find?ids=1,2,3',
        'POST /api/products/sync',
        'GET /api/products/analytics',
        'GET /api/products/cache-stats'
      ]
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      message: 'Health check failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await stopWorkers();
  await queueService.closeQueues();
  await redisService.disconnect();
  await mongoose.connection.close();
  process.exit(0);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`Cache stats: http://localhost:${PORT}/api/products/cache-stats`);
});