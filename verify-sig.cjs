const crypto = require('crypto');
const secret = 'MzFGREExQzM2NTg3N0YyNzg0ODgyRjcyMUI4Mjc1QzI=';
const body = '{"payment_id":"pay_test123","status":7,"amount":3.9,"currency":"USD","plan":"premium","order_id":"ord_3d8cabd0cae1cba3"}';
const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
console.log('Signature:', sig);
console.log('Expected (from test-ipn-debug): 26865b753f8a23d78d915e9b97e823c2c47e3c58c1f892b521175276d03ef143');
console.log('Match:', sig === '26865b753f8a23d78d915e9b97e823c2c47e3c58c1f892b521175276d03ef143');