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
    uptime: process.uptime(),
  });
});

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