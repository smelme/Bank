#!/usr/bin/env node
/**
 * Migration: Remove UNIQUE constraints from email and document_number
 * to allow family members to share emails and document numbers
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
        console.log('Starting migration: Remove email and document_number uniqueness constraints...\n');
        
        // 1. Drop UNIQUE constraint on email
        console.log('Step 1: Dropping UNIQUE constraint on email...');
        await pool.query(`
            ALTER TABLE users 
            DROP CONSTRAINT IF EXISTS users_email_key;
        `);
        console.log('✓ Email UNIQUE constraint removed');
        
        // 2. Drop UNIQUE constraint on document_number
        console.log('\nStep 2: Dropping UNIQUE constraint on document_number...');
        await pool.query(`
            ALTER TABLE users 
            DROP CONSTRAINT IF EXISTS users_document_number_key;
        `);
        console.log('✓ Document number UNIQUE constraint removed');
        
        console.log('\n✅ Migration completed successfully!');
        console.log('\nNow:');
        console.log('  - Email can be shared by family members');
        console.log('  - Document number can be shared (if needed)');
        console.log('  - Uniqueness enforced by: email+DOB+firstName+lastName combination');
        console.log('  - Username remains UNIQUE');
        
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

migrate();
