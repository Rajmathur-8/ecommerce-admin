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
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true);
    
    // Allow localhost for development
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    
    // Allow all Vercel domains
    if (origin.includes('vercel.app')) {
      return callback(null, true);
    }
    
    // Allow all Render domains (for frontend and admin panel)
    if (origin.includes('onrender.com')) {
      return callback(null, true);
    }
    
    // Allow specific production domains
    const allowedOrigins = [
      'https://www.guptadistributors.com',
      'https://guptadistributors.com',
      process.env.FRONTEND_URL,
      process.env.ADMIN_URL,
    ].filter(Boolean);
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    callback(null, true); // Allow all for now - can be restricted later
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));

// Explicit OPTIONS handler for preflight requests
app.options('*', cors(corsOptions));

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