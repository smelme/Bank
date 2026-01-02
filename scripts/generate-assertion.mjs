import 'dotenv/config';
import crypto from 'crypto';
try{ if (typeof globalThis.crypto === 'undefined') globalThis.crypto = crypto.webcrypto }catch(e){}
import { signAssertion } from '../token-exchange.js';

(async()=>{
  const user = { id: process.env.TRUSTGATE_TEST_USER_ID||'user_test_1', username: process.env.TRUSTGATE_TEST_USERNAME||'test.user' };
  const jwt = await signAssertion(user);
  console.log(jwt);
})();
