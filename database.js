import pkg from 'pg';
import fs from 'fs';
import path from 'path';
const { Pool } = pkg;

import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database connection pool
let pool = null;

// In-memory storage when no database is available
const inMemoryUsers = new Map();
const inMemoryPasskeys = new Map();
const inMemoryChallenges = new Map();
const inMemoryAuthEvents = [];
// Dev persistence directory
const DEV_DATA_DIR = path.join(__dirname, '.devdata');
const DEV_USERS_FILE = path.join(DEV_DATA_DIR, 'users.json');
const DEV_PASSKEYS_FILE = path.join(DEV_DATA_DIR, 'passkeys.json');
const DEV_CHALLENGES_FILE = path.join(DEV_DATA_DIR, 'challenges.json');

// Try to load persisted in-memory stores (dev convenience)
try {
    if (!fs.existsSync(DEV_DATA_DIR)) fs.mkdirSync(DEV_DATA_DIR, { recursive: true });
    if (fs.existsSync(DEV_USERS_FILE)) {
        const raw = fs.readFileSync(DEV_USERS_FILE, 'utf8');
        const arr = JSON.parse(raw || '[]');
        for (const u of arr) inMemoryUsers.set(u.id, u);
    }
    if (fs.existsSync(DEV_PASSKEYS_FILE)) {
        const raw = fs.readFileSync(DEV_PASSKEYS_FILE, 'utf8');
        const arr = JSON.parse(raw || '[]');
        for (const p of arr) inMemoryPasskeys.set(p.credential_id, p);
    }
    if (fs.existsSync(DEV_CHALLENGES_FILE)) {
        const raw = fs.readFileSync(DEV_CHALLENGES_FILE, 'utf8');
        const arr = JSON.parse(raw || '[]');
        for (const c of arr) inMemoryChallenges.set(c.challenge, c);
    }
} catch (err) {
    console.error('Failed to load dev persisted data:', err.message);
}

function persistInMemoryUsers() {
    try {
        const arr = Array.from(inMemoryUsers.values());
        fs.writeFileSync(DEV_USERS_FILE, JSON.stringify(arr, null, 2), 'utf8');
    } catch (err) {
        console.error('Failed to persist users:', err.message);
    }
}

function persistInMemoryPasskeys() {
    try {
        const arr = Array.from(inMemoryPasskeys.values());
        fs.writeFileSync(DEV_PASSKEYS_FILE, JSON.stringify(arr, null, 2), 'utf8');
    } catch (err) {
        console.error('Failed to persist passkeys:', err.message);
    }
}

function persistInMemoryChallenges() {
    try {
        const arr = Array.from(inMemoryChallenges.values());
        fs.writeFileSync(DEV_CHALLENGES_FILE, JSON.stringify(arr, null, 2), 'utf8');
    } catch (err) {
        console.error('Failed to persist challenges:', err.message);
    }
}

// Initialize database connection
export function initDatabase() {
    // Only initialize if DATABASE_URL is provided
    if (!process.env.DATABASE_URL) {
        console.log('No DATABASE_URL provided, using in-memory storage');
        return false;
    }

    console.log('Initializing database with URL:', process.env.DATABASE_URL.replace(/:[^:]+@/, ':***@')); // Hide password

    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL.includes('railway.app') ? {
            rejectUnauthorized: false
        } : false
    });

    console.log('Database connection pool initialized');
    return true;
}

// Create tables if they don't exist
export async function setupTables() {
    if (!pool) return false;

    try {
        // === NEW ORCHESTRATOR TABLES (Master DB) ===
        
        // Users table - Master source of truth
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                keycloak_user_id VARCHAR(255) UNIQUE,
                username VARCHAR(255) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                phone VARCHAR(50),
                
                -- Digital ID verified data
                given_name VARCHAR(255),
                family_name VARCHAR(255),
                birth_date DATE,
                document_number VARCHAR(100) UNIQUE,
                document_type VARCHAR(50),
                issuing_authority VARCHAR(255),
                face_descriptor JSONB,
                
                -- Verification status
                id_verified BOOLEAN DEFAULT false,
                id_verified_at TIMESTAMP,
                
                -- Account status
                enabled BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Passkey credentials table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS passkey_credentials (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                credential_id TEXT NOT NULL UNIQUE,
                public_key TEXT NOT NULL,
                counter BIGINT DEFAULT 0,
                transports JSONB,
                backup_eligible BOOLEAN DEFAULT false,
                backup_state BOOLEAN DEFAULT false,
                device_type VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_used_at TIMESTAMP,
                revoked_at TIMESTAMP
            )
        `);
        
        // Auth events table for audit logging
        await pool.query(`
            CREATE TABLE IF NOT EXISTS auth_events (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                user_id UUID REFERENCES users(id) ON DELETE SET NULL,
                username VARCHAR(255),
                event_type VARCHAR(50) NOT NULL,
                method VARCHAR(50),
                result VARCHAR(20) NOT NULL,
                reason TEXT,
                ip_address INET,
                user_agent TEXT,
                client_id VARCHAR(255),
                correlation_id VARCHAR(100),
                metadata JSONB
            )
        `);
        
        // Challenge storage for WebAuthn ceremonies
        await pool.query(`
            CREATE TABLE IF NOT EXISTS webauthn_challenges (
                challenge VARCHAR(255) PRIMARY KEY,
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NOT NULL
            )
        `);
        
        // Auth code storage for OIDC flows
        await pool.query(`
            CREATE TABLE IF NOT EXISTS oidc_auth_codes (
                code VARCHAR(255) PRIMARY KEY,
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                client_id VARCHAR(255) NOT NULL,
                redirect_uri TEXT,
                scope TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NOT NULL,
                user_data JSONB NOT NULL
            )
        `);
        
        // Create indexes
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_users_keycloak_id ON users(keycloak_user_id);
            CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
            CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
            CREATE INDEX IF NOT EXISTS idx_users_document_number ON users(document_number);
            CREATE INDEX IF NOT EXISTS idx_passkey_user_id ON passkey_credentials(user_id);
            CREATE INDEX IF NOT EXISTS idx_passkey_credential_id ON passkey_credentials(credential_id);
            CREATE INDEX IF NOT EXISTS idx_auth_events_user_id ON auth_events(user_id);
            CREATE INDEX IF NOT EXISTS idx_auth_events_timestamp ON auth_events(timestamp DESC);
            CREATE INDEX IF NOT EXISTS idx_challenges_expires ON webauthn_challenges(expires_at);
            CREATE INDEX IF NOT EXISTS idx_auth_codes_expires ON oidc_auth_codes(expires_at);
        `);
        
        // === LEGACY TABLES (Keep for now, migrate later) ===
        
        await pool.query(`
            CREATE TABLE IF NOT EXISTS accounts (
                id SERIAL PRIMARY KEY,
                document_number VARCHAR(255) UNIQUE NOT NULL,
                account_number VARCHAR(50) UNIQUE NOT NULL,
                account_type VARCHAR(50) NOT NULL,
                full_name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                phone VARCHAR(50) NOT NULL,
                balance DECIMAL(12, 2) DEFAULT 0.00,
                face_descriptor JSONB NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS sessions (
                session_token VARCHAR(255) PRIMARY KEY,
                document_number VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NOT NULL
            )
        `);

        // Create index on document_number for faster lookups
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_accounts_document_number 
            ON accounts(document_number)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_sessions_expires_at 
            ON sessions(expires_at)
        `);

        console.log('Database tables initialized successfully');
        return true;
    } catch (error) {
        console.error('Error setting up database tables:', error);
        return false;
    }
}

// Account operations
export async function createAccount(accountData) {
    if (!pool) return null;

    try {
        const result = await pool.query(
            `INSERT INTO accounts 
            (document_number, account_number, account_type, full_name, email, phone, balance, face_descriptor)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *`,
            [
                accountData.documentNumber,
                accountData.accountNumber,
                accountData.accountType,
                accountData.fullName,
                accountData.email,
                accountData.phone,
                accountData.balance || 0,
                JSON.stringify(accountData.faceDescriptor)
            ]
        );
        return result.rows[0];
    } catch (error) {
        console.error('Error creating account:', error);
        throw error;
    }
}

export async function getAccountByDocumentNumber(documentNumber) {
    if (!pool) return null;

    try {
        const result = await pool.query(
            'SELECT * FROM accounts WHERE document_number = $1',
            [documentNumber]
        );
        return result.rows[0] || null;
    } catch (error) {
        console.error('Error getting account:', error);
        return null;
    }
}

export async function accountExists(documentNumber) {
    if (!pool) return false;

    try {
        const result = await pool.query(
            'SELECT 1 FROM accounts WHERE document_number = $1 LIMIT 1',
            [documentNumber]
        );
        return result.rows.length > 0;
    } catch (error) {
        console.error('Error checking account existence:', error);
        return false;
    }
}

// Session operations
export async function createSession(sessionToken, documentNumber, expiresInMinutes = 60) {
    if (!pool) return false;

    try {
        const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);
        await pool.query(
            'INSERT INTO sessions (session_token, document_number, expires_at) VALUES ($1, $2, $3)',
            [sessionToken, documentNumber, expiresAt]
        );
        return true;
    } catch (error) {
        console.error('Error creating session:', error);
        return false;
    }
}

export async function getSession(sessionToken) {
    if (!pool) return null;

    try {
        const result = await pool.query(
            'SELECT * FROM sessions WHERE session_token = $1 AND expires_at > NOW()',
            [sessionToken]
        );
        return result.rows[0] || null;
    } catch (error) {
        console.error('Error getting session:', error);
        return null;
    }
}

export async function deleteSession(sessionToken) {
    if (!pool) return false;

    try {
        await pool.query('DELETE FROM sessions WHERE session_token = $1', [sessionToken]);
        return true;
    } catch (error) {
        console.error('Error deleting session:', error);
        return false;
    }
}

export async function cleanupExpiredSessions() {
    if (!pool) return;

    try {
        await pool.query('DELETE FROM sessions WHERE expires_at < NOW()');
    } catch (error) {
        console.error('Error cleaning up expired sessions:', error);
    }
}

// Utility to check if database is available
export function isDatabaseAvailable() {
    return pool !== null;
}

// Cleanup on shutdown
export async function closeDatabase() {
    if (pool) {
        await pool.end();
        console.log('Database connection closed');
    }
}

// === NEW ORCHESTRATOR DB FUNCTIONS ===

/**
 * Create a new user in the Orchestrator DB (master)
 */
export async function createUser(userData) {
    if (!pool) {
        console.log('Creating user in MEMORY storage (no database available):', userData.username);
        // In-memory fallback
        const user = {
            id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            keycloak_user_id: userData.keycloakUserId,
            username: userData.username,
            email: userData.email,
            phone: userData.phone || null,
            given_name: userData.givenName,
            family_name: userData.familyName,
            birth_date: userData.birthDate || null,
            document_number: userData.documentNumber,
            document_type: userData.documentType,
            issuing_authority: userData.issuingAuthority || null,
            face_descriptor: userData.faceDescriptor || null,
            id_verified: true,
            id_verified_at: new Date().toISOString(),
            created_at: new Date().toISOString()
        };
        inMemoryUsers.set(user.id, user);
        persistInMemoryUsers();
        return user;
    }

    console.log('Creating user in DATABASE:', userData.username);
    try {
        const result = await pool.query(
            `INSERT INTO users 
            (keycloak_user_id, username, email, phone, given_name, family_name, birth_date,
             document_number, document_type, issuing_authority, face_descriptor,
             id_verified, id_verified_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *`,
            [
                userData.keycloakUserId,
                userData.username,
                userData.email,
                userData.phone || null,
                userData.givenName,
                userData.familyName,
                userData.birthDate || null,
                userData.documentNumber,
                userData.documentType,
                userData.issuingAuthority || null,
                userData.faceDescriptor ? JSON.stringify(userData.faceDescriptor) : null,
                true, // id_verified
                new Date() // id_verified_at
            ]
        );
        return result.rows[0];
    } catch (error) {
        console.error('Error creating user in database:', error);
        throw error;
    }
}

/**
 * Get user by ID
 */
export async function getUserById(userId) {
    if (!pool) {
        // In-memory fallback
        return inMemoryUsers.get(userId) || null;
    }

    try {
        const result = await pool.query(
            'SELECT * FROM users WHERE id = $1',
            [userId]
        );
        return result.rows[0] || null;
    } catch (error) {
        console.error('Error getting user:', error);
        throw error;
    }
}

/**
 * Get user by username
 */
export async function getUserByUsername(username) {
    if (!pool) {
        // In-memory fallback
        for (const user of inMemoryUsers.values()) {
            if (user.username === username) {
                return user;
            }
        }
        return null;
    }

    try {
        const result = await pool.query(
            'SELECT * FROM users WHERE username = $1',
            [username]
        );
        return result.rows[0] || null;
    } catch (error) {
        console.error('Error getting user by username:', error);
        return null;
    }
}

// Debug helper: list in-memory users (dev only)
export async function __debugListUsers() {
    if (!pool) {
        return Array.from(inMemoryUsers.values());
    }
    try {
        const result = await pool.query('SELECT id, username, email FROM users LIMIT 100');
        return result.rows;
    } catch (error) {
        console.error('Error in __debugListUsers:', error);
        return [];
    }
}

/**
 * Get user by Keycloak user ID
 */
export async function getUserByKeycloakId(keycloakUserId) {
    if (!pool) return null;

    try {
        const result = await pool.query(
            'SELECT * FROM users WHERE keycloak_user_id = $1',
            [keycloakUserId]
        );
        return result.rows[0] || null;
    } catch (error) {
        console.error('Error getting user by Keycloak ID:', error);
        throw error;
    }
}

/**
 * Store WebAuthn challenge
 */
export async function storeChallenge(userId, challenge, expiresInSeconds = 300) {
    if (!pool) {
        // In-memory fallback
        const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
        const record = {
            challenge,
            user_id: userId,
            created_at: new Date().toISOString(),
            expires_at: expiresAt
        };
        inMemoryChallenges.set(challenge, record);
        persistInMemoryChallenges();
        return true;
    }

    try {
        const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
        await pool.query(
            `INSERT INTO webauthn_challenges (challenge, user_id, expires_at)
             VALUES ($1, $2, $3)
             ON CONFLICT (challenge) DO UPDATE SET expires_at = $3`,
            [challenge, userId, expiresAt]
        );
        return true;
    } catch (error) {
        console.error('Error storing challenge:', error);
        return false;
    }
}

/**
 * Get and verify challenge
 */
export async function getChallenge(challenge) {
    if (!pool) {
        const rec = inMemoryChallenges.get(challenge);
        if (!rec) return null;
        // Check expiration
        if (new Date(rec.expires_at) <= new Date()) {
            inMemoryChallenges.delete(challenge);
            persistInMemoryChallenges();
            return null;
        }
        return rec;
    }

    try {
        const result = await pool.query(
            `SELECT * FROM webauthn_challenges 
             WHERE challenge = $1 AND expires_at > NOW()`,
            [challenge]
        );
        return result.rows[0] || null;
    } catch (error) {
        console.error('Error getting challenge:', error);
        return null;
    }
}

/**
 * Delete challenge after use
 */
export async function deleteChallenge(challenge) {
    if (!pool) {
        const existed = inMemoryChallenges.delete(challenge);
        if (existed) persistInMemoryChallenges();
        return existed;
    }

    try {
        await pool.query('DELETE FROM webauthn_challenges WHERE challenge = $1', [challenge]);
        return true;
    } catch (error) {
        console.error('Error deleting challenge:', error);
        return false;
    }
}

/**
 * Store OIDC auth code
 */
export async function storeAuthCode(code, userId, clientId, redirectUri, scope, userData, expiresInSeconds = 600) {
    if (!pool) {
        // In-memory fallback - but this won't work on Railway
        console.warn('Storing auth code in memory - this will not persist on Railway!');
        return false;
    }

    try {
        const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
        await pool.query(`
            INSERT INTO oidc_auth_codes (code, user_id, client_id, redirect_uri, scope, expires_at, user_data)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (code) DO UPDATE SET expires_at = $6
        `, [code, userId, clientId, redirectUri, scope, expiresAt, JSON.stringify(userData)]);
        return true;
    } catch (error) {
        console.error('Error storing auth code:', error);
        return false;
    }
}

/**
 * Get and validate OIDC auth code
 */
export async function getAuthCode(code) {
    if (!pool) {
        // In-memory fallback - won't work on Railway
        return null;
    }

    try {
        const result = await pool.query(`
            SELECT * FROM oidc_auth_codes 
            WHERE code = $1 AND expires_at > NOW()
        `, [code]);
        
        if (result.rows.length === 0) {
            return null;
        }
        
        const row = result.rows[0];
        // Handle both JSONB (already parsed) and JSON string formats
        const userData = typeof row.user_data === 'string' 
            ? JSON.parse(row.user_data) 
            : row.user_data;
            
        return {
            user: userData,
            client_id: row.client_id,
            redirect_uri: row.redirect_uri,
            scope: row.scope,
            expires: row.expires_at
        };
    } catch (error) {
        console.error('Error getting auth code:', error);
        return null;
    }
}

/**
 * Delete OIDC auth code (after use)
 */
export async function deleteAuthCode(code) {
    if (!pool) {
        return false;
    }

    try {
        await pool.query('DELETE FROM oidc_auth_codes WHERE code = $1', [code]);
        return true;
    } catch (error) {
        console.error('Error deleting auth code:', error);
        return false;
    }
}

/**
 * Store passkey credential
 */
export async function storePasskeyCredential(credentialData) {
    if (!pool) {
        // In-memory fallback
        const credential = {
            id: `cred_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            user_id: credentialData.userId,
            credential_id: credentialData.credentialId,
            public_key: credentialData.publicKey,
            counter: credentialData.counter || 0,
            transports: credentialData.transports || [],
            backup_eligible: credentialData.backupEligible || false,
            backup_state: credentialData.backupState || false,
            device_type: credentialData.deviceType || null,
            created_at: new Date().toISOString(),
            last_used_at: null,
            revoked_at: null
        };
        inMemoryPasskeys.set(credential.credential_id, credential);
    persistInMemoryPasskeys();
    return credential;
    }

    try {
        const result = await pool.query(
            `INSERT INTO passkey_credentials 
            (user_id, credential_id, public_key, counter, transports, backup_eligible, backup_state, device_type)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *`,
            [
                credentialData.userId,
                credentialData.credentialId,
                credentialData.publicKey,
                credentialData.counter || 0,
                credentialData.transports ? JSON.stringify(credentialData.transports) : null,
                credentialData.backupEligible || false,
                credentialData.backupState || false,
                credentialData.deviceType || null
            ]
        );
        return result.rows[0];
    } catch (error) {
        console.error('Error storing passkey credential:', error);
        throw error;
    }
}

/**
 * Get passkey credential by credential ID
 */
export async function getPasskeyCredential(credentialId) {
    if (!pool) {
        // In-memory fallback
        const credential = inMemoryPasskeys.get(credentialId);
        return (credential && !credential.revoked_at) ? credential : null;
    }

    try {
        const result = await pool.query(
            'SELECT * FROM passkey_credentials WHERE credential_id = $1 AND revoked_at IS NULL',
            [credentialId]
        );
        return result.rows[0] || null;
    } catch (error) {
        console.error('Error getting passkey credential:', error);
        return null;
    }
}

/**
 * Get all passkey credentials for a user
 */
export async function getUserPasskeyCredentials(userId) {
    if (!pool) {
        // In-memory fallback
        const credentials = [];
        for (const cred of inMemoryPasskeys.values()) {
            if (cred.user_id === userId && !cred.revoked_at) {
                credentials.push(cred);
            }
        }
        return credentials.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    try {
        const result = await pool.query(
            'SELECT * FROM passkey_credentials WHERE user_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC',
            [userId]
        );
        return result.rows;
    } catch (error) {
        console.error('Error getting user passkey credentials:', error);
        return [];
    }
}

/**
 * Update passkey counter after successful authentication
 */
export async function updatePasskeyCounter(credentialId, newCounter) {
    if (!pool) return false;

    try {
        await pool.query(
            'UPDATE passkey_credentials SET counter = $1, last_used_at = NOW() WHERE credential_id = $2',
            [newCounter, credentialId]
        );
        return true;
    } catch (error) {
        console.error('Error updating passkey counter:', error);
        return false;
    }
}

/**
 * Log authentication event
 */
export async function logAuthEvent(eventData) {
    if (!pool) return null;

    try {
        const result = await pool.query(
            `INSERT INTO auth_events 
            (user_id, username, event_type, method, result, reason, ip_address, user_agent, client_id, correlation_id, metadata)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *`,
            [
                eventData.userId || null,
                eventData.username || null,
                eventData.eventType,
                eventData.method || null,
                eventData.result,
                eventData.reason || null,
                eventData.ipAddress || null,
                eventData.userAgent || null,
                eventData.clientId || null,
                eventData.correlationId || null,
                eventData.metadata ? JSON.stringify(eventData.metadata) : null
            ]
        );
        return result.rows[0];
    } catch (error) {
        console.error('Error logging auth event:', error);
        return null;
    }
}
