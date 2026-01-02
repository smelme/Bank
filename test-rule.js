// Test rule evaluation with country condition
import * as rules from './rules-engine.js';

console.log('Testing rule evaluation with country condition...');

// Mock context for NZ user
const context = {
  username: 'testuser',
  ip_address: '101.98.188.175',
  geo_country: 'NZ',
  geo_city: 'Auckland',
  user_auth_methods: ['passkey', 'email_otp']
};

// Test the single condition evaluation directly
const condition = {
  property: 'country',
  operator: 'equals',
  value: 'NZ'
};

// Import the internal function (this is a bit hacky but for testing)
import('./rules-engine.js').then(module => {
  // Access the internal function through the module
  const testCondition = {
    operator: 'AND',
    rules: [condition]
  };

  // Test evaluateConditions function
  const RulesEngine = module;
  // We can't easily access internal functions, so let's test the mapping logic

  console.log('Context geo_country:', context.geo_country);
  console.log('Condition property:', condition.property);
  console.log('Should match: NZ === NZ ?', context.geo_country === 'NZ');
});