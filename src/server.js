import http from 'http';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from './config/database.js';
import app from './app.js';
import { initSocket } from './utils/socket.js';

// Load environment variables
config();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Connect to database
connectDB();

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.io
initSocket(server);

const PORT = process.env.PORT || 5000;

// Graceful shutdown function
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    console.log('💥 Server closed. Process terminating...');
    process.exit(0);
  });

  // Force close after 10 seconds if server doesn't close
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

server.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════╗
  ║                                       ║
  ║   🚀 Decidely Backend Started!        ║
  ║                                       ║
  ║   Port: ${PORT}                          ║
  ║   Environment: ${process.env.NODE_ENV || 'development'}       ║
  ║   URL: ${process.env.NODE_ENV === 'production' ? process.env.BACKEND_URL || `http://localhost:${PORT}` : `http://localhost:${PORT}`}           ║
  ║                                       ║
  ║   ${new Date().toLocaleString()}           ║
  ║                                       ║
  ╚═══════════════════════════════════════╝
  `);
});

// Handle unhandled rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ UNHANDLED REJECTION! 💥 Shutting down...');
  console.error('Error:', err.name, err.message);
  console.error('Stack:', err.stack);
  
  gracefulShutdown('Unhandled Rejection');
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('❌ UNCAUGHT EXCEPTION! 💥 Shutting down...');
  console.error('Error:', err.name, err.message);
  console.error('Stack:', err.stack);
  
  gracefulShutdown('Uncaught Exception');
});

// Handle termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Log when server is closing
process.on('exit', (code) => {
  console.log(`Process exiting with code: ${code}`);
});

// For Render.com - log memory usage
if (process.env.NODE_ENV === 'production') {
  setInterval(() => {
    const memoryUsage = process.memoryUsage();
    console.log(`📊 Memory Usage: RSS=${Math.round(memoryUsage.rss / 1024 / 1024)}MB, Heap=${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`);
  }, 60000); // Log every minute
}