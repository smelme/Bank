#!/usr/bin/env node
/**
 * Migration: Add nonce column to oidc_auth_codes table
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

async function migrate() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL?.includes('railway.app') ? { rejectUnauthorized: false } : false
    });

    try {
        console.log('Starting migration: Add nonce column to oidc_auth_codes...');
        
        // Add nonce column if it doesn't exist
        await pool.query(`
            ALTER TABLE oidc_auth_codes 
            ADD COLUMN IF NOT EXISTS nonce TEXT;
        `);
        
        console.log('✓ Migration completed successfully');
        console.log('✓ Added nonce column to oidc_auth_codes table');
        
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

migrate();
