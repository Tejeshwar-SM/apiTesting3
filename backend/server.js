import express from 'express';
import cors from 'cors';
// import cron from 'node-cron';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import connectDB from './config/database.js';
import productRoutes from './routes/products.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const app = express();
connectDB();

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

app.get('/api/health', (req, res) => {
  res.json({ 
    message: 'Product Analytics API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    nodeVersion: process.version,
    routes: [
      'GET /api/health',
      'GET /api/products',
      'GET /api/products/find?ids=1,2,3',
      'POST /api/products/sync',
      'GET /api/products/analytics'
    ]
  });
});

app.use('*', (req, res) => {
  console.log(`404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
    availableRoutes: [
      'GET /api/health',
      'GET /api/products',
      'GET /api/products/find?ids=1,2,3',
      'POST /api/products/sync',
      'GET /api/products/analytics'
    ]
  });
});


app.use((error, req, res, next) => {
  console.error('Server Error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// Auto-sync every 6 hours ??
// cron.schedule('0 */6 * * *', async () => {
//   console.log('Starting automated product sync...');
//   try {
//     const response = await fetch(`http://localhost:${PORT}/api/products/sync`, {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json'
//       }
//     });
    
//     if (response.ok) {
//       console.log('Automated sync completed successfully');
//     } else {
//       console.error('Automated sync failed:', response.statusText);
//     }
//   } catch (error) {
//     console.error('Automated sync failed:', error);
//   }
// });

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log(`API Base URL: http://localhost:${PORT}/api`);
  console.log(`Health Check: http://localhost:${PORT}/api/health`);
  console.log(`Using ES Modules`);
});