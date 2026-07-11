import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initPlanExpirationCron } from './utils/planExpiration.js';

// Import routes
import authRoutes from './routes/auth.js';
import workspaceRoutes from './routes/workspaces.js';
import projectRoutes from './routes/projects.js';
import approvalRoutes from './routes/approvals.js';
import magicRoutes from './routes/magic.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import clientRoutes from './routes/client.js'; 
import uploadRoutes from './routes/uploadRoutes.js'

// Import middleware
import errorHandler from './middleware/error.js';
import { checkPlanExpiry } from './middleware/checkPlanExpiry.js';
import { protect } from './middleware/auth.js';

// ES module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Body parser middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ✅ FIXED CORS - Support both local and production
const allowedOrigins = [
  "https://www.decidely.online",
  'http://localhost:5173',
  'https://decidely-client.vercel.app',
];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('Blocked origin:', origin);
      callback(null, true); // Temporarily allow all for testing
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
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
    uptime: process.uptime(),
  });
});

// ✅ PUBLIC ROUTES (No auth required)
app.use('/api/auth', authRoutes); // login, register, forgot-password are public
app.use('/api/magic', magicRoutes); // ✅ Magic link validation is public

app.use('/api', protect);

// API Routes
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api', clientRoutes); 
app.use('/api/uploads', uploadRoutes); 

// 404 handler - FIXED
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.originalUrl} not found`,
  });
});

// Initialize the plan expiration cron job
initPlanExpirationCron();

// Error handler (must be last)
app.use(errorHandler);

export default app;