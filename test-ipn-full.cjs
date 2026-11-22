const http = require('http');

const secret = '31097B768418E769A01394A140F80611';
const body = '{"payment_id":"pay_test123","status":7,"amount":3.9,"currency":"USD","plan":"premium","order_id":"ord_3d8cabd0cae1cba3"}';
const crypto = require('crypto');
const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');

console.log('Signature:', sig);

const options = {
  hostname: 'localhost',
  port: 8080,
  path: '/api/paymento/ipn',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-hmac-sha256-signature': sig,
    'Content-Length': Buffer.byteLength(body)
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', data);
  });
});

req.on('error', (e) => {
  console.error('Error:', e.message);
});

req.write(body);
req.end();