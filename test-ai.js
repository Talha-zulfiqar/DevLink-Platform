const http = require('http');

const req = http.request('http://localhost:5000/api/ai/chat', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'}
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      console.log('Response:', response);
    } catch (e) {
      console.log('Raw response:', data);
    }
  });
});

req.on('error', (e) => {
  console.error('Request error:', e);
});

req.write(JSON.stringify({message: 'What is AI?'}));
req.end();
