import cron from 'node-cron';
import MagicLink from '../models/MagicLink.js';

// Run every day at midnight
export const setupCronJobs = () => {
  // Auto-expire old magic links
  cron.schedule('0 0 * * *', async () => {
    console.log('🕛 Running magic link auto-expiry...');
    try {
      await MagicLink.autoExpire();
    } catch (error) {
      console.error('❌ Error in auto-expiry cron:', error);
    }
  });

  console.log('✅ Cron jobs scheduled');
};