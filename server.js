import dotenv from 'dotenv';
// Load environment variables first
dotenv.config();

import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import compression from 'compression';
import { connectDB } from './db/mongo-db-connect.js';
import { router as Router } from './routes/routes.js';
import stockMonitoringService from './services/stockMonitoringService.js';
import cronJobService from './services/cronJobService.js';
import { validateNotificationConfig } from './config/notification.config.js';
import { runSeed } from './seedData/seed.js';

const PORT = process.env.PORT || 8000;
const app = express();

// Configure CORS to allow frontend requests
const corsOptions = {
  origin: [
    'https://ecommerce-frontend-git-main-rajmathurwork-1432s-projects.vercel.app',
    'https://ecommerce-frontend.vercel.app',
    'http://localhost:3000',
    'http://localhost:3001',
    process.env.FRONTEND_URL || ''
  ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


connectDB().then(async () => {
  // Run seed data after database connection
  await runSeed();
});

app.use("/api", Router);

// Initialize stock monitoring and cron job services
const initializeServices = async () => {
  try {
    // Validate notification configuration
    const configErrors = validateNotificationConfig();
    if (configErrors.length > 0) {
      console.warn('⚠️ Notification configuration warnings:', configErrors);
    } else {
      console.log('✅ Notification configuration validated successfully');
    }

    // Start real-time stock monitoring
    stockMonitoringService.startMonitoring();
    
    // Start daily stock report cron job
    cronJobService.startDailyStockAlert();
    
    console.log('🚀 All services initialized successfully');
  } catch (error) {
  }
};

// Start server and initialize services
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  initializeServices();
});