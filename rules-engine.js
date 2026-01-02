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
        // Get all active rules ordered by priority
        const rules = await db.getRules({ is_enabled: true });
        
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
            const ruleMatches = evaluateConditions(rule.conditions, context);
            
            if (ruleMatches) {
                result.appliedRules.push({
                    id: rule.id,
                    name: rule.name,
                    priority: rule.priority
                });
                
                // Apply actions
                applyActions(rule.actions, result, context);
                
                // If access is blocked, stop processing
                if (!result.allowed) {
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
function evaluateConditions(conditions, context) {
    if (!conditions || typeof conditions !== 'object') {
        return false;
    }
    
    const { operator = 'AND', rules = [] } = conditions;
    
    if (rules.length === 0) {
        return true; // No conditions means rule always applies
    }
    
    if (operator === 'AND') {
        return rules.every(rule => evaluateSingleCondition(rule, context));
    } else if (operator === 'OR') {
        return rules.some(rule => evaluateSingleCondition(rule, context));
    }
    
    return false;
}

/**
 * Evaluate a single condition
 * @param {Object} condition - Individual condition
 * @param {Object} context - Authentication context
 * @returns {boolean} Whether condition is met
 */
function evaluateSingleCondition(condition, context) {
    const { field, operator, value } = condition;
    
    // Get the actual value from context
    let contextValue = getNestedValue(context, field);
    
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
 * @param {Object} actions - Rule actions
 * @param {Object} result - Current evaluation result
 * @param {Object} context - Authentication context
 */
function applyActions(actions, result, context) {
    if (!actions || typeof actions !== 'object') {
        return;
    }
    
    // Block access completely
    if (actions.block === true) {
        result.allowed = false;
        result.blockReason = actions.block_reason || 'Access denied by security rule';
        result.allowedMethods.clear();
        return;
    }
    
    // Deny specific auth methods
    if (Array.isArray(actions.deny_methods)) {
        actions.deny_methods.forEach(method => {
            result.allowedMethods.delete(method);
            result.deniedMethods.add(method);
        });
    }
    
    // Allow only specific methods (whitelist)
    if (Array.isArray(actions.allow_only_methods)) {
        const allowedSet = new Set(actions.allow_only_methods);
        
        // Remove methods not in the whitelist
        for (const method of result.allowedMethods) {
            if (!allowedSet.has(method)) {
                result.allowedMethods.delete(method);
                result.deniedMethods.add(method);
            }
        }
    }
    
    // Require specific method
    if (actions.require_method) {
        // Remove all methods except the required one
        const requiredMethod = actions.require_method;
        for (const method of result.allowedMethods) {
            if (method !== requiredMethod) {
                result.allowedMethods.delete(method);
            }
        }
        
        // If required method not available, block access
        if (!result.allowedMethods.has(requiredMethod)) {
            result.allowed = false;
            result.blockReason = `${requiredMethod} authentication required`;
        }
    }
    
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
