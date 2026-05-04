import app from './app.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

let isConnected = false;

export default async function handler(req, res) {
  if (!isConnected) {
    try {
      console.log('Connecting to MongoDB...');
      console.log('Database:', process.env.DB_NAME || 'test');
      
      await mongoose.connect(process.env.MONGODB_URI, {
        dbName: 'test', // ← FORCE DATABASE NAME
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
        socketTimeoutMS: 45000,
      });
      
      isConnected = true;
      console.log('✅ MongoDB Connected');
      
      // Test if collections exist
      const collections = await mongoose.connection.db.listCollections().toArray();
      console.log('Collections:', collections.map(c => c.name));
      
    } catch (error) {
      console.error('MongoDB Error:', error.message);
      return res.status(500).json({
        success: false,
        error: 'Database connection failed: ' + error.message
      });
    }
  }
  
  return app(req, res);
}