import dotenv from 'dotenv';
dotenv.config();

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('railway.app') ? {
        rejectUnauthorized: false
    } : false
});

async function testDateFiltering() {
    try {
        // Test the exact query the API is making
        const fromDate = new Date('2025-12-26');
        const toDate = new Date('2026-01-02');
        
        console.log('From date:', fromDate.toISOString());
        console.log('To date:', toDate.toISOString());
        
        // Test with date filtering
        const filteredResult = await pool.query(
            `SELECT * FROM auth_activity 
             WHERE timestamp >= $1 AND timestamp <= $2
             ORDER BY timestamp DESC`,
            [fromDate, toDate]
        );
        
        console.log('\nFiltered results:', filteredResult.rows.length);
        filteredResult.rows.forEach((log, i) => {
            console.log(`${i + 1}. ${log.timestamp.toISOString()} - ${log.username} - ${log.auth_method}`);
        });
        
        // Test without filtering
        const allResult = await pool.query('SELECT * FROM auth_activity ORDER BY timestamp DESC');
        console.log('\nAll results:', allResult.rows.length);
        allResult.rows.forEach((log, i) => {
            console.log(`${i + 1}. ${log.timestamp.toISOString()} - ${log.username} - ${log.auth_method}`);
        });
        
        // Show what the actual timestamps are
        if (allResult.rows.length > 0) {
            const firstLog = allResult.rows[0];
            console.log('\nFirst log timestamp:', firstLog.timestamp);
            console.log('Type:', typeof firstLog.timestamp);
            console.log('ISO:', firstLog.timestamp.toISOString());
        }
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
    }
}

testDateFiltering();