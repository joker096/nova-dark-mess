const http = require('http');

const secret = '31FDA1C365877F2784882F721B8275C2';
const body = '{"payment_id":"pay_test123","status":7,"amount":3.9,"currency":"USD","plan":"premium","order_id":"ord_3d8cabd0cae1cba3"}';
const crypto = require('crypto');
const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');

console.log('Body bytes:', Buffer.byteLength(body));
console.log('Body:', JSON.stringify(body));
console.log('Secret:', secret);
console.log('Signature:', sig);

const postData = body;

const options = {
  hostname: 'localhost',
  port: 8080,
  path: '/api/paymento/ipn',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-hmac-sha256-signature': sig,
    'Content-Length': Buffer.byteLength(postData)
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

req.write(postData);
req.end();