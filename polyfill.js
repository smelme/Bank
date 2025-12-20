import crypto from 'crypto';

const webcrypto = crypto.webcrypto;

if (!globalThis.crypto) {
    globalThis.crypto = webcrypto;
}
if (!global.crypto) {
    global.crypto = webcrypto;
}
if (typeof window === 'undefined') {
    global.window = global;
    global.window.crypto = webcrypto;
}

console.log('Polyfilled crypto');
