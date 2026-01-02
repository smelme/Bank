/**
 * Check Railway Production Database for Activity Logs
 * Run this with your production DATABASE_URL
 */
import dotenv from 'dotenv';
dotenv.config();

import pg from 'pg';
const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
}

console.log('Connecting to database...');
console.log('URL:', DATABASE_URL.replace(/:[^:]+@/, ':***@'));

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('railway.app') ? {
        rejectUnauthorized: false
    } : false
});

async function checkDatabase() {
    try {
        // Check if auth_activity table exists
        const tableCheck = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'auth_activity'
            );
        `);
        
        console.log('✓ auth_activity table exists:', tableCheck.rows[0].exists);
        
        if (!tableCheck.rows[0].exists) {
            console.log('❌ Table does not exist. Run setupTables() first.');
            return;
        }
        
        // Get total count
        const countResult = await pool.query('SELECT COUNT(*) as total FROM auth_activity');
        console.log('\n📊 Total activity logs:', countResult.rows[0].total);
        
        // Get recent logs
        const recentResult = await pool.query(`
            SELECT 
                id,
                username,
                auth_method,
                success,
                ip_address,
                geo_country,
                timestamp
            FROM auth_activity 
            ORDER BY timestamp DESC 
            LIMIT 10
        `);
        
        if (recentResult.rows.length > 0) {
            console.log('\n📝 Recent activity logs:');
            recentResult.rows.forEach((log, i) => {
                console.log(`${i + 1}. ${log.timestamp.toISOString()} - ${log.username} - ${log.auth_method} - ${log.success ? '✓ SUCCESS' : '✗ FAILED'} - ${log.ip_address} (${log.geo_country || 'unknown'})`);
            });
        } else {
            console.log('\n⚠ No activity logs found in database');
        }
        
        // Check table structure
        const columnsResult = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'auth_activity'
            ORDER BY ordinal_position
        `);
        
        console.log('\n📋 Table structure:');
        columnsResult.rows.forEach(col => {
            console.log(`  - ${col.column_name}: ${col.data_type}`);
        });
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
    } finally {
        await pool.end();
    }
}

checkDatabase();