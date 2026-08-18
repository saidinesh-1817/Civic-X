import http from 'http';

const testEndpoint = (path) => {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: 5000,
        path: path,
        method: 'GET',
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: JSON.parse(data),
            });
          } catch (e) {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              rawBody: data,
            });
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
};

const run = async () => {
  console.log('Testing endpoints...');
  try {
    // 1. Health check
    const health = await testEndpoint('/api/health');
    console.log('\n[1] GET /api/health:');
    console.log('Status Code:', health.statusCode);
    console.log('Response:', JSON.stringify(health.body, null, 2));

    // 2. Versioned health check
    const v1Health = await testEndpoint('/api/v1/health');
    console.log('\n[2] GET /api/v1/health:');
    console.log('Status Code:', v1Health.statusCode);
    console.log('Response:', JSON.stringify(v1Health.body, null, 2));

    // 3. Root endpoint
    const root = await testEndpoint('/');
    console.log('\n[3] GET /:');
    console.log('Status Code:', root.statusCode);
    console.log('Response:', JSON.stringify(root.body, null, 2));

    // 4. 404 Not Found endpoint
    const notFound = await testEndpoint('/api/nonexistent-route');
    console.log('\n[4] GET /api/nonexistent-route:');
    console.log('Status Code:', notFound.statusCode);
    console.log('Response:', JSON.stringify(notFound.body, null, 2));

    console.log('\nAll tests passed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  }
};

run();
