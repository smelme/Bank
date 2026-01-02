import * as db from './database.js';
import * as activityLogger from './activity-logger.js';

// Initialize database
db.initDatabase();
await db.setupTables();

console.log('Testing activity logging with proper initialization...');

// Simulate a request object
const mockReq = {
  headers: {
    'user-agent': 'TestAgent/1.0'
  },
  socket: {
    remoteAddress: '127.0.0.1'
  }
};

// Attach the middleware function to the mock request
activityLogger.attachActivityLogger(mockReq, {}, () => {});

// Test logging via the attached function
try {
  await mockReq.logAuthActivity({
    user_id: 'test-user-id',
    username: 'test-user',
    auth_method: 'test',
    success: true,
    metadata: { test: true }
  });
  
  console.log('✓ Activity logged successfully via req.logAuthActivity');
  
  // Check if it was saved
  const logs = await db.getActivity({ limit: 5 });
  console.log('Activity logs in database:', logs.length);
  if (logs.length > 0) {
    console.log('Latest log:', JSON.stringify(logs[0], null, 2));
  } else {
    console.log('⚠ No logs found in database');
  }
} catch (error) {
  console.error('✗ Error:', error.message);
  console.error(error.stack);
}

process.exit(0);