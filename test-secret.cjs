require('dotenv').config({ override: true });
const secrets = (process.env.PAYMENTO_SECRET_KEYS || '').split(',').map(s => s.trim()).filter(Boolean);
const secret = (secrets[0] || process.env.PAYMENTO_SECRET_KEY || process.env.PAYMENTO_SECRET || '').trim();
console.log('Effective secret:', secret);
console.log('Length:', secret.length);
const crypto = require('crypto');
const body = '{"payment_id":"pay_test123","status":7,"amount":3.9,"currency":"USD","plan":"premium","order_id":"ord_3d8cabd0cae1cba3"}';
const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
console.log('Expected signature:', sig);