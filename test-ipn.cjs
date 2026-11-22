const crypto = require('crypto');
const secret = '31FDA1C365877F2784882F721B8275C2';
const body = '{"payment_id":"pay_test123","status":7,"amount":3.9,"currency":"USD","plan":"premium","order_id":"ord_3d8cabd0cae1cba3"}';
const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
console.log('Signature:', sig);