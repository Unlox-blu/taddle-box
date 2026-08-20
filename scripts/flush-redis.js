const path = require('path');
const dotenv = require('dotenv');

// Load environment variables based on APP_ENV
const envPath = process.env.APP_ENV === 'production' 
  ? path.resolve(__dirname, '../.env.production') 
  : path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

const redis = require('../src/config/redis');

async function flushCache() {
  try {
    console.log('Connecting to Redis...');
    
    // Specifically delete the app release manifest keys to fix the upload issue
    console.log('Deleting app release manifest cache...');
    await redis.del('app_releases:android:manifest');
    await redis.del('app_releases:android:manifest:development');
    console.log('✔ App release manifest cache cleared.');

    // If you want to flush the ENTIRE Redis database instead, uncomment the line below:
    // await redis.flushdb();
    // console.log('✔ Entire Redis database flushed.');

    console.log('Done! You can now safely retry the APK upload.');
    process.exit(0);
  } catch (error) {
    console.error('Failed to flush Redis cache:', error);
    process.exit(1);
  }
}

flushCache();
