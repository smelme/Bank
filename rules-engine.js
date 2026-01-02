/**
 * Rules Engine for Authentication Control
 * 
 * Evaluates authentication rules to determine:
 * - Which auth methods are allowed
 * - Whether access should be blocked
 * - Conditional logic based on IP, location, user attributes
 */

import * as db from './database.js';

/**
 * Evaluate all active rules for a given context
 * @param {Object} context - Authentication context
 * @param {string} context.username - Username attempting to sign in
 * @param {string} context.email - User email (if available)
 * @param {string} context.ip_address - Client IP address
 * @param {string} context.geo_country - Country code (e.g., 'US', 'ET')
 * @param {string} context.geo_city - City name
 * @param {string} context.user_agent - Browser user agent
 * @param {Array} context.user_auth_methods - User's registered auth methods
 * @returns {Object} Result with allowed methods and block status
 */
export async function evaluateRules(context) {
    try {
        console.log('[RULES] Evaluating rules for context:', {
            username: context.username,
            ip_address: context.ip_address,
            user_auth_methods: context.user_auth_methods
        });
        
        // Get all active rules ordered by priority
        const rules = await db.getRules({ is_enabled: true });
        
        console.log('[RULES] Found', rules.length, 'active rules');
        
        if (!rules || rules.length === 0) {
            // No rules - allow all user's registered methods
            return {
                allowed: true,
                allowedMethods: context.user_auth_methods || ['passkey', 'digitalid', 'email_otp', 'sms_otp'],
                deniedMethods: [],
                appliedRules: [],
                blockReason: null
            };
        }
        
        const result = {
            allowed: true,
            allowedMethods: new Set(context.user_auth_methods || ['passkey', 'digitalid', 'email_otp', 'sms_otp']),
            deniedMethods: new Set(),
            appliedRules: [],
            blockReason: null
        };
        
        // Evaluate each rule in priority order
        for (const rule of rules) {
            console.log('[RULES] Evaluating rule:', rule.name, 'with conditions:', rule.conditions);
            const ruleMatches = await evaluateConditions(rule.conditions, context);
            console.log('[RULES] Rule', rule.name, 'matches:', ruleMatches);
            
            if (ruleMatches) {
                result.appliedRules.push({
                    id: rule.id,
                    name: rule.name,
                    priority: rule.priority
                });
                
                console.log('[RULES] Applying actions for rule', rule.name, ':', rule.actions);
                // Apply actions
                applyActions(rule.actions, result, context);
                
                // If access is blocked, stop processing
                if (!result.allowed) {
                    console.log('[RULES] Access blocked by rule:', rule.name);
                    break;
                }
            }
        }
        
        // Convert sets back to arrays
        result.allowedMethods = Array.from(result.allowedMethods);
        result.deniedMethods = Array.from(result.deniedMethods);
        
        return result;
    } catch (error) {
        console.error('Error evaluating rules:', error);
        // On error, be permissive and allow all methods
        return {
            allowed: true,
            allowedMethods: context.user_auth_methods || ['passkey', 'digitalid', 'email_otp', 'sms_otp'],
            deniedMethods: [],
            appliedRules: [],
            blockReason: null,
            error: error.message
        };
    }
}

/**
 * Evaluate rule conditions with AND/OR logic
 * @param {Object} conditions - Rule conditions
 * @param {Object} context - Authentication context
 * @returns {boolean} Whether conditions are met
 */
async function evaluateConditions(conditions, context) {
    if (!conditions || typeof conditions !== 'object') {
        return false;
    }
    
    const { operator = 'AND', rules = [] } = conditions;
    
    if (rules.length === 0) {
        return true; // No conditions means rule always applies
    }
    
    if (operator === 'AND') {
        return (await Promise.all(rules.map(rule => evaluateSingleCondition(rule, context)))).every(result => result);
    } else if (operator === 'OR') {
        return (await Promise.all(rules.map(rule => evaluateSingleCondition(rule, context)))).some(result => result);
    }
    
    return false;
}

/**
 * Evaluate a single condition
 * @param {Object} condition - Individual condition
 * @param {Object} context - Authentication context
 * @returns {boolean} Whether condition is met
 */
async function evaluateSingleCondition(condition, context) {
    const { field, property, operator, value } = condition;
    let fieldName = field || property; // Support both field and property for compatibility
    
    if (!fieldName || !operator) {
        return false;
    }
    
    // Handle special property-based conditions (IP activity threshold, multi-account, etc.)
    if (fieldName === 'ip_activity_threshold') {
        return await checkIPActivityThreshold(context.ip_address, { ...value, operator });
    }
    
    if (fieldName === 'ip_multi_account') {
        return await checkIPMultiAccount(context.ip_address, value);
    }
    
    if (fieldName === 'user_country_jump') {
        return await checkUserCountryJump(context.username, value);
    }
    
    // Map common property names to context field names
    const fieldMapping = {
        'country': 'geo_country',
        'city': 'geo_city',
        'ip': 'ip_address'
    };
    
    fieldName = fieldMapping[fieldName] || fieldName;
    
    // Get the actual value from context
    let contextValue = getNestedValue(context, fieldName);
    
    // Handle different operators
    switch (operator) {
        case 'equals':
            return contextValue === value;
            
        case 'not_equals':
            return contextValue !== value;
            
        case 'contains':
            return contextValue && String(contextValue).includes(value);
            
        case 'not_contains':
            return !contextValue || !String(contextValue).includes(value);
            
        case 'starts_with':
            return contextValue && String(contextValue).startsWith(value);
            
        case 'ends_with':
            return contextValue && String(contextValue).endsWith(value);
            
        case 'in':
            return Array.isArray(value) && value.includes(contextValue);
            
        case 'not_in':
            return !Array.isArray(value) || !value.includes(contextValue);
            
        case 'ip_in_range':
            return isIPInRange(context.ip_address, value);
            
        case 'ip_equals':
            return context.ip_address === value;
            
        case 'country_equals':
            return context.geo_country === value;
            
        case 'country_in':
            return Array.isArray(value) && value.includes(context.geo_country);
            
        case 'country_not_in':
            return !Array.isArray(value) || !value.includes(context.geo_country);
            
        default:
            console.warn(`Unknown operator: ${operator}`);
            return false;
    }
}

/**
 * Get nested value from object using dot notation
 * @param {Object} obj - Object to search
 * @param {string} path - Path like 'user.email' or 'ip_address'
 * @returns {*} Value at path
 */
function getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Check if IP address is in CIDR range
 * @param {string} ip - IP address to check
 * @param {string} range - CIDR range (e.g., '192.168.1.0/24')
 * @returns {boolean} Whether IP is in range
 */
function isIPInRange(ip, range) {
    if (!ip || !range) return false;
    
    try {
        // Simple IPv4 check
        if (!range.includes('/')) {
            return ip === range;
        }
        
        const [rangeIP, bits] = range.split('/');
        const mask = ~(2 ** (32 - parseInt(bits)) - 1);
        
        const ipNum = ipToNumber(ip);
        const rangeNum = ipToNumber(rangeIP);
        
        return (ipNum & mask) === (rangeNum & mask);
    } catch (error) {
        console.error('Error checking IP range:', error);
        return false;
    }
}

/**
 * Convert IP address to number
 * @param {string} ip - IP address
 * @returns {number} IP as number
 */
function ipToNumber(ip) {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
}

/**
 * Apply rule actions to the result
 * @param {Array|Object} actions - Rule actions (array or single object)
 * @param {Object} result - Current evaluation result
 * @param {Object} context - Authentication context
 */
function applyActions(actions, result, context) {
    if (!actions) {
        return;
    }
    
    console.log('[RULES] Applying actions:', actions);
    
    // Handle both array format (from frontend) and object format (legacy)
    const actionsArray = Array.isArray(actions) ? actions : [actions];
    
    for (const action of actionsArray) {
        if (!action || typeof action !== 'object') {
            continue;
        }
        
        console.log('[RULES] Processing action:', action);
        
        // Block access completely
        if (action.type === 'block_access') {
            result.allowed = false;
            result.blockReason = action.reason || 'Access denied by security rule';
            result.allowedMethods.clear();
            console.log('[RULES] Access blocked, clearing all methods');
            return;
        }
        
        // Require 2FA (not implemented yet)
        if (action.type === 'require_2fa') {
            // For now, just allow all methods but mark as requiring 2FA
            // This would need additional implementation
            continue;
        }
        
        // Allow only specific methods (whitelist) - REPLACE the allowed methods
        if (action.type === 'allow_methods' && Array.isArray(action.methods)) {
            console.log('[RULES] Applying allow_methods:', action.methods);
            // Clear existing methods and set to the specified whitelist
            result.allowedMethods.clear();
            action.methods.forEach(method => {
                result.allowedMethods.add(method);
                console.log('[RULES] Adding allowed method:', method);
            });
        }
        
        // Deny specific auth methods
        if (action.type === 'deny_methods' && Array.isArray(action.methods)) {
            console.log('[RULES] Applying deny_methods:', action.methods);
            action.methods.forEach(method => {
                result.allowedMethods.delete(method);
                result.deniedMethods.add(method);
            });
        }
    }
    
    console.log('[RULES] Final allowed methods:', Array.from(result.allowedMethods));
    
    // Check if no methods are left
    if (result.allowedMethods.size === 0) {
        result.allowed = false;
        result.blockReason = result.blockReason || 'No allowed authentication methods available';
    }
}

/**
 * Example rule structure:
 * 
 * {
 *   name: "Block Russia from Email OTP",
 *   conditions: {
 *     operator: "AND",
 *     rules: [
 *       { field: "geo_country", operator: "equals", value: "RU" }
 *     ]
 *   },
 *   actions: {
 *     deny_methods: ["email_otp"]
 *   }
 * }
 * 
 * {
 *   name: "High-risk countries require passkey",
 *   conditions: {
 *     operator: "AND",
 *     rules: [
 *       { field: "geo_country", operator: "in", value: ["RU", "CN", "KP"] }
 *     ]
 *   },
 *   actions: {
 *     require_method: "passkey"
 *   }
 * }
 * 
 * {
 *   name: "Block internal IP from external access",
 *   conditions: {
 *     operator: "AND",
 *     rules: [
 *       { field: "ip_address", operator: "ip_in_range", value: "192.168.0.0/16" }
 *     ]
 *   },
 *   actions: {
 *     block: true,
 *     block_reason: "Internal IP addresses are not allowed for external access"
 *   }
 * }
 */

/**
 * Check if an IP address has been used by multiple accounts within a time window
 * @param {string} ipAddress - IP address to check
 * @param {Object} config - Configuration with threshold and timeWindow
 * @param {number} config.accountThreshold - Minimum number of different accounts
 * @param {number} config.timeWindowMinutes - Time window in minutes
 * @returns {boolean} Whether the condition is met
 */
async function checkIPMultiAccount(ipAddress, config) {
    if (!ipAddress || !config || typeof config !== 'object') {
        return false;
    }
    
    const { accountThreshold = 3, timeWindowMinutes = 10 } = config;
    
    try {
        const timeWindowMs = timeWindowMinutes * 60 * 1000;
        const since = new Date(Date.now() - timeWindowMs);
        
        // Count distinct usernames from this IP within the time window
        const result = await db.pool.query(
            `SELECT COUNT(DISTINCT username) as account_count 
             FROM auth_activity 
             WHERE ip_address = $1 
             AND timestamp >= $2 
             AND success = true`,
            [ipAddress, since]
        );
        
        const accountCount = parseInt(result.rows[0].account_count);
        console.log(`[RULES] IP ${ipAddress} used by ${accountCount} accounts in last ${timeWindowMinutes} minutes`);
        
        return accountCount >= accountThreshold;
    } catch (error) {
        console.error('Error checking IP multi-account:', error);
        return false;
    }
}

/**
 * Check if an IP address has exceeded activity threshold within a time window
 * @param {string} ipAddress - IP address to check
 * @param {Object} config - Configuration with threshold, timeWindow, and operator
 * @param {number} config.activityThreshold - Number of activities to compare against
 * @param {number} config.timeWindowMinutes - Time window in minutes
 * @param {string} config.operator - Comparison operator: 'gt', 'gte', 'lt', 'lte', 'eq', 'neq'
 * @returns {boolean} Whether the condition is met
 */
async function checkIPActivityThreshold(ipAddress, config) {
    if (!ipAddress || !config || typeof config !== 'object') {
        return false;
    }
    
    const { 
        activityThreshold = 10, 
        timeWindowMinutes = 5,
        operator = 'gt'  // Default to greater than
    } = config;
    
    try {
        const timeWindowMs = timeWindowMinutes * 60 * 1000;
        const since = new Date(Date.now() - timeWindowMs);
        
        // Count total activities from this IP within the time window
        const result = await db.pool.query(
            `SELECT COUNT(*) as activity_count 
             FROM auth_activity 
             WHERE ip_address = $1 
             AND timestamp >= $2`,
            [ipAddress, since]
        );
        
        const activityCount = parseInt(result.rows[0].activity_count);
        console.log(`[RULES] IP ${ipAddress} has ${activityCount} activities in last ${timeWindowMinutes} minutes (threshold: ${activityThreshold}, operator: ${operator})`);
        
        // Apply the comparison operator
        switch (operator) {
            case 'gt':
                return activityCount > activityThreshold;
            case 'gte':
                return activityCount >= activityThreshold;
            case 'lt':
                return activityCount < activityThreshold;
            case 'lte':
                return activityCount <= activityThreshold;
            case 'eq':
                return activityCount === activityThreshold;
            case 'neq':
                return activityCount !== activityThreshold;
            default:
                console.warn(`Unknown operator for IP activity threshold: ${operator}, defaulting to gt`);
                return activityCount > activityThreshold;
        }
    } catch (error) {
        console.error('Error checking IP activity threshold:', error);
        return false;
    }
}

/**
 * Check if a user has been active from different countries within a time window
 * @param {string} username - Username to check
 * @param {Object} config - Configuration with timeWindow
 * @param {number} config.timeWindowMinutes - Time window in minutes
 * @returns {boolean} Whether the condition is met (user jumped countries)
 */
async function checkUserCountryJump(username, config) {
    if (!username || !config || typeof config !== 'object') {
        return false;
    }
    
    const { timeWindowMinutes = 30 } = config;
    
    try {
        const timeWindowMs = timeWindowMinutes * 60 * 1000;
        const since = new Date(Date.now() - timeWindowMs);
        
        // Get distinct countries for this user within the time window
        const result = await db.pool.query(
            `SELECT DISTINCT geo_country 
             FROM auth_activity 
             WHERE username = $1 
             AND timestamp >= $2 
             AND success = true 
             AND geo_country IS NOT NULL`,
            [username, since]
        );
        
        const countries = result.rows.map(row => row.geo_country);
        console.log(`[RULES] User ${username} active in countries: ${countries.join(', ')} in last ${timeWindowMinutes} minutes`);
        
        // If user has been active in more than one country, it's a jump
        return countries.length > 1;
    } catch (error) {
        console.error('Error checking user country jump:', error);
        return false;
    }
}
