import crypto from 'crypto';

const webcrypto = crypto.webcrypto;

// For Node.js 18+, crypto is already available globally
if (!globalThis.crypto) {
    globalThis.crypto = webcrypto;
}

// Set up global crypto if not available
if (!global.crypto) {
    try {
        global.crypto = webcrypto;
    } catch (e) {
        // Ignore if crypto is read-only (Node.js 20+)
    }
}

// Set up window polyfill for browser-like environment
if (typeof window === 'undefined') {
    global.window = global;
    // Try to set window.crypto, but don't fail if it's read-only
    if (!global.window.crypto) {
        try {
            Object.defineProperty(global.window, 'crypto', {
                value: webcrypto,
                writable: false,
                configurable: true
            });
        } catch (e) {
            // Crypto might already be defined and read-only
        }
    }
}

console.log('Polyfilled crypto');
