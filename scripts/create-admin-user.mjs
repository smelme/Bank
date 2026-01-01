/**
 * Create Admin User Script
 * 
 * Usage: node scripts/create-admin-user.mjs <username> <email> <password> [full_name] [role]
 * 
 * Example:
 *   node scripts/create-admin-user.mjs admin admin@tamange.bank SecurePass123 "Admin User" superadmin
 */

import dotenv from 'dotenv';
dotenv.config();

import bcrypt from 'bcrypt';
import * as db from '../database.js';

async function createAdminUser() {
    const args = process.argv.slice(2);
    
    if (args.length < 3) {
        console.error('Usage: node scripts/create-admin-user.mjs <username> <email> <password> [full_name] [role]');
        console.error('');
        console.error('Example:');
        console.error('  node scripts/create-admin-user.mjs admin admin@tamange.bank SecurePass123 "Admin User" superadmin');
        console.error('');
        console.error('Roles: superadmin, admin, viewer');
        process.exit(1);
    }
    
    const [username, email, password, full_name = 'Admin User', role = 'admin'] = args;
    
    console.log('Creating admin user...');
    console.log(`Username: ${username}`);
    console.log(`Email: ${email}`);
    console.log(`Full Name: ${full_name}`);
    console.log(`Role: ${role}`);
    console.log('');
    
    try {
        // Check if user already exists
        const existing = await db.getAdminUserByUsername(username);
        if (existing) {
            console.error(`❌ Admin user '${username}' already exists!`);
            process.exit(1);
        }
        
        // Hash password
        const saltRounds = 10;
        const password_hash = await bcrypt.hash(password, saltRounds);
        
        // Create admin user
        const admin = await db.createAdminUser({
            username,
            email,
            password_hash,
            full_name,
            role,
            metadata: {
                created_via: 'script',
                created_at: new Date().toISOString()
            }
        });
        
        console.log('✅ Admin user created successfully!');
        console.log('');
        console.log('User Details:');
        console.log(`  ID: ${admin.id}`);
        console.log(`  Username: ${admin.username}`);
        console.log(`  Email: ${admin.email}`);
        console.log(`  Full Name: ${admin.full_name}`);
        console.log(`  Role: ${admin.role}`);
        console.log(`  Active: ${admin.is_active}`);
        console.log(`  Created: ${admin.created_at}`);
        console.log('');
        console.log('You can now log in to the admin portal with these credentials.');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating admin user:', error.message);
        console.error(error);
        process.exit(1);
    }
}

createAdminUser();
