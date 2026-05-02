import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// Import routes
import authRoutes from './src/routes/auth.js';
import workspaceRoutes from './src/routes/workspaces.js';
import projectRoutes from './src/routes/projects.js';
import approvalRoutes from './src/routes/approvals.js';
import magicRoutes from './src/routes/magic.js';
import dashboardRoutes from './src/routes/dashboardRoutes.js';
import clientRoutes from './src/routes/client.js';
import uploadRoutes from './src/routes/uploadRoutes.js';

// Import middleware
import errorHandler from './src/middleware/error.js';
import { protect } from './src/middleware/auth.js';

dotenv.config();

const app = express();

// Body parser middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Enable CORS
app.use(cors({
  origin: process.env.CLIENT_URL || 'https://decidely-client.vercel.app',
  credentials: true,
}));

// Welcome route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🚀 Decidely API is running',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      workspaces: '/api/workspaces',
      projects: '/api/projects',
      approvals: '/api/approvals',
      magic: '/api/magic',
      dashboard: '/api/dashboard'
    },
  });
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
  });
});

// Apply protection middleware to API routes
app.use('/api', protect);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/magic', magicRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api', clientRoutes);
app.use('/api/uploads', uploadRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.originalUrl} not found`,
  });
});

// Error handler
app.use(errorHandler);

// Database connection (lazy connect for serverless)
let isConnected = false;

const connectDB = async () => {
  if (isConnected) return;
  
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    isConnected = true;
    console.log('✅ MongoDB Connected');
  } catch (error) {
    console.error('MongoDB connection error:', error);
  }
};

// Vercel handler
export default async function handler(req, res) {
  await connectDB();
  return app(req, res);
}