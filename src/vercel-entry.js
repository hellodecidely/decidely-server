// vercel-entry.js - ONLY for Vercel deployment
import app from './app.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

let isConnected = false;

const connectDB = async () => {
  if (isConnected) return;
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    isConnected = true;
    console.log('✅ MongoDB Connected (Vercel)');
  } catch (error) {
    console.error('❌ MongoDB Error:', error.message);
  }
};

export default async function handler(req, res) {
  await connectDB();
  return app(req, res);
}