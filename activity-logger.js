/**
 * Activity Logging Middleware
 * 
 * Logs all authentication attempts with context information
 */

import * as db from './database.js';
import axios from 'axios';

/**
 * Extract client IP address from request
 * Handles various proxy headers
 */
export function getClientIP(req) {
    return (
        req.headers['cf-connecting-ip'] || // Cloudflare
        req.headers['x-real-ip'] || // Nginx proxy
        req.headers['x-forwarded-for']?.split(',')[0]?.trim() || // Standard proxy header
        req.socket.remoteAddress ||
        req.connection.remoteAddress ||
        'unknown'
    );
}

/**
 * Get geolocation data for IP address
 * Uses ipapi.co free API (no key required for basic usage)
 */
async function getGeoLocation(ipAddress) {
    // Skip for local IPs
    if (!ipAddress || ipAddress === 'unknown' || 
        ipAddress.startsWith('127.') || 
        ipAddress.startsWith('192.168.') ||
        ipAddress.startsWith('10.') ||
        ipAddress === '::1') {
        return {
            country: null,
            city: null
        };
    }
    
    try {
        const response = await axios.get(`https://ipapi.co/${ipAddress}/json/`, {
            timeout: 2000 // 2 second timeout
        });
        
        return {
            country: response.data.country_code || null,
            city: response.data.city || null,
            region: response.data.region || null,
            timezone: response.data.timezone || null
        };
    } catch (error) {
        console.warn(`Geolocation lookup failed for ${ipAddress}:`, error.message);
        return {
            country: null,
            city: null
        };
    }
}

/**
 * Log authentication activity
 * @param {Object} data - Activity data
 * @param {string} data.username - Username
 * @param {string} data.user_id - User ID (if successful)
 * @param {string} data.auth_method - Authentication method used
 * @param {boolean} data.success - Whether auth was successful
 * @param {string} data.failure_reason - Reason for failure (if unsuccessful)
 * @param {Object} data.req - Express request object
 * @param {Object} data.metadata - Additional metadata
 */
export async function logAuthActivity(data) {
    try {
        console.log('[ACTIVITY] logAuthActivity called with:', {
            username: data.username,
            auth_method: data.auth_method,
            success: data.success,
            has_req: !!data.req,
            req_type: typeof data.req
        });
        
        if (!data.req) {
            console.error('[ACTIVITY] ERROR: data.req is undefined!');
            return;
        }
        
        const ipAddress = getClientIP(data.req);
        const userAgent = data.req.headers?.['user-agent'] || null;
        
        // Get geolocation (async, don't block on it)
        const geo = await getGeoLocation(ipAddress).catch(err => {
            console.warn('Geo lookup error:', err.message);
            return { country: null, city: null };
        });
        
        console.log('[ACTIVITY] About to log to database');
        
        // Log to database
        const result = await db.logActivity({
            user_id: data.user_id || null,
            username: data.username,
            auth_method: data.auth_method,
            ip_address: ipAddress,
            user_agent: userAgent,
            geo_country: geo.country,
            geo_city: geo.city,
            success: data.success,
            failure_reason: data.failure_reason || null,
            metadata: {
                ...data.metadata,
                geo_region: geo.region,
                geo_timezone: geo.timezone
            }
        });
        
        console.log(`[ACTIVITY] Auth activity logged: ${data.username} via ${data.auth_method} from ${ipAddress} (${geo.country || 'unknown'}) - ${data.success ? 'SUCCESS' : 'FAILED'} - DB result: ${!!result}`);
    } catch (error) {
        console.error('[ACTIVITY] Error logging auth activity:', error);
        // Don't throw - logging should never break the auth flow
    }
}

/**
 * Express middleware to attach activity logger to request
 */
export function attachActivityLogger(req, res, next) {
    req.logAuthActivity = (data) => {
        return logAuthActivity({
            ...data,
            req
        });
    };
    next();
}

/**
 * Get authentication context from request
 * Used by rules engine
 */
export async function getAuthContext(req, user = null) {
    const ipAddress = getClientIP(req);
    const geo = await getGeoLocation(ipAddress).catch(() => ({ country: null, city: null }));
    
    return {
        username: user?.username || req.body?.username || null,
        email: user?.email || null,
        user_id: user?.id || null,
        ip_address: ipAddress,
        geo_country: geo.country,
        geo_city: geo.city,
        user_agent: req.headers['user-agent'] || null,
        user_auth_methods: user?.auth_methods || []
    };
}
