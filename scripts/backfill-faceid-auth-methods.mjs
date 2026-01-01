#!/usr/bin/env node
/**
 * Backfill FaceID auth methods for existing users who have face descriptors
 * This script adds faceid to user_auth_methods for users who registered before
 * the multi-auth system was implemented
 */

import dotenv from 'dotenv';
import pkg from 'pg';
const { Pool } = pkg;

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway.app') ? {
    rejectUnauthorized: false
  } : false
});

async function backfillFaceIdAuthMethods() {
  console.log('=== Backfilling FaceID Auth Methods ===\n');
  
  try {
    // Find all users with face descriptors who don't have faceid auth method
    const usersQuery = `
      SELECT u.id, u.username, u.email, u.face_descriptor
      FROM users u
      WHERE u.face_descriptor IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM user_auth_methods uam
        WHERE uam.user_id = u.id AND uam.method_type = 'faceid'
      )
    `;
    
    const result = await pool.query(usersQuery);
    const users = result.rows;
    
    console.log(`Found ${users.length} users with face descriptors missing faceid auth method\n`);
    
    if (users.length === 0) {
      console.log('✅ No users to backfill. All users with face descriptors already have faceid auth method.');
      return;
    }
    
    let successCount = 0;
    let failCount = 0;
    
    for (const user of users) {
      try {
        const faceDescriptor = user.face_descriptor;
        const deviceInfo = {
          type: 'biometric',
          method: 'face_recognition',
          registeredAt: new Date().toISOString()
        };
        
        const metadata = {
          descriptorLength: Array.isArray(faceDescriptor) ? faceDescriptor.length : 0,
          source: 'digital_id_verification',
          backfilled: true
        };
        
        // Check if this is the user's first auth method
        const existingMethodsResult = await pool.query(
          'SELECT COUNT(*) as count FROM user_auth_methods WHERE user_id = $1 AND is_enabled = true',
          [user.id]
        );
        const isPrimary = existingMethodsResult.rows[0].count === '0';
        
        // Insert faceid auth method
        await pool.query(
          `INSERT INTO user_auth_methods 
          (user_id, method_type, method_identifier, device_info, is_primary, metadata)
          VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            user.id,
            'faceid',
            'primary-device',
            JSON.stringify(deviceInfo),
            isPrimary,
            JSON.stringify(metadata)
          ]
        );
        
        console.log(`✓ Added faceid for user: ${user.username} (${user.email})`);
        successCount++;
        
      } catch (userErr) {
        console.error(`✗ Failed to add faceid for user ${user.username}:`, userErr.message);
        failCount++;
      }
    }
    
    console.log('\n=== Backfill Complete ===');
    console.log(`Success: ${successCount}`);
    console.log(`Failed: ${failCount}`);
    console.log(`Total: ${users.length}`);
    
  } catch (error) {
    console.error('Error during backfill:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

backfillFaceIdAuthMethods();
