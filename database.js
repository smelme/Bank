import pkg from 'pg';
const { Pool } = pkg;

// Database connection pool
let pool = null;

// Initialize database connection
export function initDatabase() {
    // Only initialize if DATABASE_URL is provided
    if (!process.env.DATABASE_URL) {
        console.log('No DATABASE_URL provided, using in-memory storage');
        return false;
    }

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
