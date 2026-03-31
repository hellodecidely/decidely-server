// utils/planExpiration.js
import User from '../models/User.js';
import cron from 'node-cron';

const PLAN_DURATION_DAYS = parseInt(process.env.PLAN_DURATION_DAYS);

/**
 * Calculate expiration date based on current date + plan duration
 */
export const calculateExpirationDate = () => {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + PLAN_DURATION_DAYS);
  return expiresAt;
};

/**
 * Check and downgrade expired plans
 */
export const checkExpiredPlans = async () => {
  try {
    console.log('🔍 Checking for expired plans...');
    console.log(`📅 Current time: ${new Date().toLocaleString()}`);
    
    const now = new Date();
    
    // FIRST: Find users with plan='pro' or 'agency' but no expiration date
    // This handles users upgraded before we added the expiration field
    const usersWithoutExpiration = await User.find({
      plan: { $in: ['pro', 'agency'] },
      planExpiresAt: { $exists: false }
    });
    
    if (usersWithoutExpiration.length > 0) {
      console.log(`📊 Found ${usersWithoutExpiration.length} users without expiration dates`);
      
      for (const user of usersWithoutExpiration) {
        // Set expiration based on planActivatedAt or createdAt
        const baseDate = user.planActivatedAt || user.createdAt;
        const expiresAt = new Date(baseDate);
        expiresAt.setDate(expiresAt.getDate() + PLAN_DURATION_DAYS);
        
        user.planExpiresAt = expiresAt;
        user.lastPlanChange = new Date(); // ← ADD THIS
        await user.save();
        
        console.log(`📅 Set expiration for ${user.email} to ${expiresAt.toLocaleString()}`);
      }
    }
    
    // SECOND: Find users with expired plans
    const expiredUsers = await User.find({
      plan: { $in: ['pro', 'agency'] },
      planExpiresAt: { $lt: now }
    });
    
    if (expiredUsers.length > 0) {
      console.log(`📊 Found ${expiredUsers.length} users with expired plans`);
      
      for (const user of expiredUsers) {
        const oldPlan = user.plan;
        const expiredAt = user.planExpiresAt;
        
        console.log(`📉 Downgrading ${user.email} from ${oldPlan} to free`);
        console.log(`   ⏰ Plan expired at: ${expiredAt?.toLocaleString()}`);
        
        user.plan = 'free';
        user.planExpiresAt = null;
        user.lastPlanChange = new Date(); // ← ADD THIS - FORCES LOGOUT
        
        await user.save();
      }
    } else {
      console.log('✅ No expired plans found');
    }
    
    return { success: true };
  } catch (error) {
    console.error('❌ Error checking expired plans:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Initialize the cron job for plan expiration
 */
export const initPlanExpirationCron = () => {
  console.log('⏰ Initializing plan expiration cron job...');
  console.log(`📅 Plan duration set to ${PLAN_DURATION_DAYS} days`);
  
  // For TESTING: Run every minute
  cron.schedule('* * * * *', async () => {
    console.log('⏰ Running plan expiration check...');
    await checkExpiredPlans();
  });
  
  // Also run once on startup
  setTimeout(async () => {
    console.log('🚀 Running initial plan expiration check...');
    await checkExpiredPlans();
  }, 5000);
};