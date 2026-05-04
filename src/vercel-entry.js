// vercel-entry.js
import app from './app.js';
import connectDB from './src/config/database.js';
import dotenv from 'dotenv';

dotenv.config();

let isConnected = false;

export default async function handler(req, res) {
  // Connect only once
  if (!isConnected) {
    try {
      await connectDB();
      isConnected = true;
    } catch (error) {
      console.error('Database connection failed:', error.message);
      return res.status(500).json({
        success: false,
        error: 'Database connection failed'
      });
    }
  }
  
  return app(req, res);
}