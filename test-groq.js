// Test Groq API integration
const http = require('http');

const postData = JSON.stringify({
  message: 'Hello! What is 2 + 2?'
});

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/ai/chat',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

console.log('🚀 Testing Groq AI API...\n');

const req = http.request(options, (res) => {
  let data = '';

  console.log(`📊 Status: ${res.statusCode}`);
  console.log(`📋 Headers:`, res.headers, '\n');

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('✅ Response received:');
    try {
      const parsed = JSON.parse(data);
      console.log(JSON.stringify(parsed, null, 2));
      
      if (parsed.success && parsed.reply) {
        console.log('\n✨ AI Response:', parsed.reply);
        console.log('\n🎉 Groq API is working correctly!');
      }
    } catch (e) {
      console.log('📄 Raw response:', data);
    }
    process.exit(0);
  });
});

req.on('error', (e) => {
  console.error(`❌ Error:`, e);
  console.error(`Message: ${e.message}`);
  console.error(`Code: ${e.code}`);
  process.exit(1);
});

req.write(postData);
req.end();

// Timeout after 30 seconds
setTimeout(() => {
  console.error('❌ Request timeout (30 seconds)');
  process.exit(1);
}, 30000);
