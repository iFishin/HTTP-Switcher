'use strict';

const assert = require('assert');
const http = require('http');
const { parseTargetInfo, resolveJsonPath, resolveJsonPathChain } = require('./middleware/parser');
const config = require('./config');

// =============================================================
// resolveJsonPath — array index support
// =============================================================
{
  const obj = { a: { b: { c: 'deep' } }, items: [{ url: 'first' }, { url: 'second' }], x: [{ y: 1 }] };
  assert.strictEqual(resolveJsonPath(obj, 'a.b.c'), 'deep');
  assert.strictEqual(resolveJsonPath(obj, 'items.0.url'), 'first');
  assert.strictEqual(resolveJsonPath(obj, 'items.1.url'), 'second');
  assert.strictEqual(resolveJsonPath(obj, 'x'), obj.x);
  assert.strictEqual(resolveJsonPath(obj, 'a.b.z'), undefined);
  assert.strictEqual(resolveJsonPath(null, 'a'), undefined);
  assert.strictEqual(resolveJsonPath(obj, 'items.99.url'), undefined);
  assert.strictEqual(resolveJsonPath({ '0': 'zero' }, '0'), 'zero'); // object key '0'
  console.log('✓ resolveJsonPath (with array index)');
}

// =============================================================
// resolveJsonPathChain
// =============================================================
{
  const obj = { content: { url: 'chain-val' }, target_url: 'fallback' };
  // 先找 content.url 再找 target_url
  assert.strictEqual(resolveJsonPathChain(obj, ['content.url', 'target_url']), 'chain-val');
  // 第一个路径不存在，回退到第二个
  assert.strictEqual(resolveJsonPathChain(obj, ['missing.path', 'target_url']), 'fallback');
  // 全部不存在
  assert.strictEqual(resolveJsonPathChain(obj, ['missing', 'nonexistent']), undefined);
  // 空数组
  assert.strictEqual(resolveJsonPathChain(obj, []), undefined);
  // 非数组
  assert.strictEqual(resolveJsonPathChain(obj, null), undefined);
  console.log('✓ resolveJsonPathChain');
}

// =============================================================
// parseTargetInfo: from Header (unchanged)
// =============================================================
{
  const req = {
    method: 'POST',
    headers: {
      'x-target-url': 'http://192.168.1.100:3000/api',
      'x-target-method': 'GET',
      'x-target-headers': Buffer.from(JSON.stringify({ Authorization: 'Bearer tok' })).toString('base64'),
    },
    body: {},
  };
  const result = parseTargetInfo(req, config);
  assert.strictEqual(result.targetUrl, 'http://192.168.1.100:3000/api');
  assert.strictEqual(result.targetMethod, 'GET');
  assert.strictEqual(result.targetHeaders.Authorization, 'Bearer tok');
  assert.strictEqual(result.source, 'header');
  console.log('✓ parseTargetInfo from header');
}

// =============================================================
// parseTargetInfo: from Body — default path
// =============================================================
{
  const req = {
    method: 'POST',
    headers: {},
    body: {
      target_url: 'http://10.0.0.5:8080/data',
      target_method: 'PUT',
      target_headers: { 'X-Custom': 'val' },
      target_body: { name: 'test' },
    },
  };
  const result = parseTargetInfo(req, config);
  assert.strictEqual(result.targetUrl, 'http://10.0.0.5:8080/data');
  assert.strictEqual(result.targetMethod, 'PUT');
  assert.strictEqual(result.targetHeaders['X-Custom'], 'val');
  assert.deepStrictEqual(result.targetBody, { name: 'test' });
  assert.strictEqual(result.source, 'body');
  console.log('✓ parseTargetInfo from body (default path)');
}

// =============================================================
// parseTargetInfo: from Body — alternative path (data.target_url)
// Uses custom config with fallback chains
// =============================================================
{
  const altConfig = {
    parsing: {
      headerTargetUrl: 'X-Target-URL',
      headerTargetMethod: 'X-Target-Method',
      headerTargetHeaders: 'X-Target-Headers',
      bodyTargetUrlPaths: ['target_url', 'data.target_url'],
      bodyTargetMethodPaths: ['target_method', 'data.target_method'],
      bodyTargetHeadersPaths: ['target_headers', 'data.target_headers'],
      bodyTargetBodyPaths: ['target_body', 'data.target_body'],
    },
  };
  const req = {
    method: 'POST',
    headers: {},
    body: { data: { target_url: 'http://10.0.0.1/api', target_method: 'DELETE' } },
  };
  const result = parseTargetInfo(req, altConfig);
  assert.strictEqual(result.targetUrl, 'http://10.0.0.1/api');
  assert.strictEqual(result.targetMethod, 'DELETE');
  assert.strictEqual(result.source, 'body');
  console.log('✓ parseTargetInfo from body (data.target_url fallback)');
}

// =============================================================
// parseTargetInfo: from Body — deep nested path (action.value.target_url)
// =============================================================
{
  const altConfig = {
    parsing: {
      headerTargetUrl: 'X-Target-URL',
      headerTargetMethod: 'X-Target-Method',
      headerTargetHeaders: 'X-Target-Headers',
      bodyTargetUrlPaths: ['target_url', 'action.value.target_url'],
      bodyTargetMethodPaths: ['target_method', 'action.value.target_method'],
      bodyTargetHeadersPaths: ['target_headers', 'action.value.target_headers'],
      bodyTargetBodyPaths: ['target_body', 'action.value.target_body'],
    },
  };
  const req = {
    method: 'POST',
    headers: {},
    body: { action: { value: { target_url: 'http://10.0.0.2/array' } } },
  };
  const result = parseTargetInfo(req, altConfig);
  assert.strictEqual(result.targetUrl, 'http://10.0.0.2/array');
  assert.strictEqual(result.source, 'body');
  console.log('✓ parseTargetInfo from body (action.value.target_url fallback)');
}

// =============================================================
// parseTargetInfo: from Body — array index path
// =============================================================
{
  const req = {
    method: 'POST',
    headers: {},
    body: { events: [{ target_url: 'http://10.0.0.3/event' }] },
  };
  // 用非默认路径测试数组索引解析
  const customPaths = ['events.0.target_url'];
  const result = parseTargetInfo(req, {
    parsing: {
      headerTargetUrl: 'X-Target-URL',
      headerTargetMethod: 'X-Target-Method',
      headerTargetHeaders: 'X-Target-Headers',
      bodyTargetUrlPaths: customPaths,
      bodyTargetMethodPaths: ['events.0.target_method'],
      bodyTargetHeadersPaths: ['events.0.target_headers'],
      bodyTargetBodyPaths: ['events.0.target_body'],
    },
  });
  assert.strictEqual(result.targetUrl, 'http://10.0.0.3/event');
  assert.strictEqual(result.source, 'body');
  console.log('✓ parseTargetInfo from body (array index events.0.target_url)');
}

// =============================================================
// parseTargetInfo: body with string target_headers (JSON string)
// =============================================================
{
  const req = {
    method: 'POST',
    headers: {},
    body: {
      target_url: 'http://10.0.0.1/api',
      target_headers: '{"Authorization":"Bearer tok123","X-Custom":"val"}',
    },
  };
  const result = parseTargetInfo(req, config);
  assert.strictEqual(result.targetUrl, 'http://10.0.0.1/api');
  assert.deepStrictEqual(result.targetHeaders, { Authorization: 'Bearer tok123', 'X-Custom': 'val' });
  console.log('✓ parseTargetInfo body with string target_headers (auto-parsed)');
}

// =============================================================
// parseTargetInfo: body with empty target_body string
// =============================================================
{
  const req = {
    method: 'POST',
    headers: {},
    body: { target_url: 'http://10.0.0.1/api', target_body: '' },
  };
  const result = parseTargetInfo(req, config);
  assert.strictEqual(result.targetBody, null, 'empty string target_body should become null');
  console.log('✓ parseTargetInfo body with empty target_body string');
}

// =============================================================
// parseTargetInfo: body with empty target_headers string
// =============================================================
{
  const req = {
    method: 'POST',
    headers: {},
    body: { target_url: 'http://10.0.0.1/api', target_headers: '' },
  };
  const result = parseTargetInfo(req, config);
  assert.deepStrictEqual(result.targetHeaders, {});
  console.log('✓ parseTargetInfo body with empty target_headers string');
}

// =============================================================
// parseTargetInfo: missing URL
// =============================================================
{
  const req = { method: 'GET', headers: {}, body: {} };
  const result = parseTargetInfo(req, config);
  assert.ok(result.error);
  assert.ok(result.error.includes('target_url') || result.error.includes('Target'));
  console.log('✓ parseTargetInfo missing URL');
}

// =============================================================
// parseTargetInfo: invalid header headers (unchanged)
// =============================================================
{
  const req = {
    method: 'POST',
    headers: {
      'x-target-url': 'http://192.168.1.1/test',
      'x-target-headers': 'not-base64-json',
    },
    body: {},
  };
  const result = parseTargetInfo(req, config);
  assert.ok(result.error);
  console.log('✓ parseTargetInfo invalid header headers');
}

// =============================================================
// parseTargetInfo: fallback to original method (unchanged)
// =============================================================
{
  const req = {
    method: 'DELETE',
    headers: { 'x-target-url': 'http://192.168.1.1/resource' },
    body: {},
  };
  const result = parseTargetInfo(req, config);
  assert.strictEqual(result.targetMethod, 'DELETE');
  console.log('✓ parseTargetInfo fallback to original method');
}

// =============================================================
// apiKeyAuth integration test — X-API-Key and Authorization: Bearer
// =============================================================
{
  const express = require('express');
  const { apiKeyAuth } = require('./middleware/security');

  // Save and restore
  const origApiKey = config.security.apiKey;
  config.security.apiKey = 'test-key-123';

  const testApp = express();
  testApp.use(apiKeyAuth);
  testApp.get('/test', (req, res) => res.json({ ok: true }));

  const server = testApp.listen(0, () => {
    const port = server.address().port;
    let done = 0;

    function finish() {
      done++;
      if (done === 4) {
        config.security.apiKey = origApiKey;
        server.close();
        console.log('✓ apiKeyAuth middleware (X-API-Key + Authorization Bearer)');
      }
    }

    // 1. No API key → 401
    http.get(`http://127.0.0.1:${port}/test`, (res) => {
      assert.strictEqual(res.statusCode, 401);
      finish();
    });

    // 2. Wrong X-API-Key → 401
    http.get({ hostname: '127.0.0.1', port, path: '/test', headers: { 'X-API-Key': 'wrong' } }, (res) => {
      assert.strictEqual(res.statusCode, 401);
      finish();
    });

    // 3. Correct X-API-Key → 200
    http.get({ hostname: '127.0.0.1', port, path: '/test', headers: { 'X-API-Key': 'test-key-123' } }, (res) => {
      assert.strictEqual(res.statusCode, 200);
      finish();
    });

    // 4. Correct Authorization: Bearer → 200
    http.get({ hostname: '127.0.0.1', port, path: '/test', headers: { 'Authorization': 'Bearer test-key-123' } }, (res) => {
      assert.strictEqual(res.statusCode, 200);
      finish();
    });
  });
}

// =============================================================
// End-to-end server test — POST with body path fallback
// =============================================================
async function serverTest() {
  const express = require('express');

  // Simulate relay with body path fallback
  const relayApp = express();
  relayApp.use(express.json());

  // Custom config with fallback paths
  const relayConfig = {
    parsing: {
      headerTargetUrl: 'X-Target-URL',
      headerTargetMethod: 'X-Target-Method',
      headerTargetHeaders: 'X-Target-Headers',
      bodyTargetUrlPaths: ['target_url', 'data.target_url', 'content.url'],
      bodyTargetMethodPaths: ['target_method', 'data.target_method'],
      bodyTargetHeadersPaths: ['target_headers', 'data.target_headers'],
      bodyTargetBodyPaths: ['target_body', 'data.target_body'],
    },
  };

  relayApp.all('*', (req, res) => {
    const target = parseTargetInfo(req, relayConfig);
    if (target.error) return res.status(400).json(target);
    res.json(target);
  });

  const server = relayApp.listen(0, () => {
    const port = server.address().port;

    // Test 1: body with nested data.target_url
    const body1 = JSON.stringify({ data: { target_url: `http://127.0.0.1:${port}/echo`, target_method: 'POST' } });
    const req1 = http.request({
      hostname: '127.0.0.1', port, path: '/any', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body1) },
    }, (res) => {
      let d = '';
      res.on('data', (c) => d += c);
      res.on('end', () => {
        const parsed = JSON.parse(d);
        assert.strictEqual(parsed.source, 'body');
        assert.strictEqual(parsed.targetUrl, `http://127.0.0.1:${port}/echo`);
        assert.strictEqual(parsed.targetMethod, 'POST');

        // Test 2: body with content.url fallback
        const body2 = JSON.stringify({ content: { url: `http://127.0.0.1:${port}/content` } });
        const req2 = http.request({
          hostname: '127.0.0.1', port, path: '/any', method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body2) },
        }, (res2) => {
          let d2 = '';
          res2.on('data', (c) => d2 += c);
          res2.on('end', () => {
            const parsed2 = JSON.parse(d2);
            assert.strictEqual(parsed2.source, 'body');
            assert.strictEqual(parsed2.targetUrl, `http://127.0.0.1:${port}/content`);

            // Test 3: missing url in all paths
            const body3 = JSON.stringify({ unrelated: 'data' });
            const req3 = http.request({
              hostname: '127.0.0.1', port, path: '/any', method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body3) },
            }, (res3) => {
              assert.strictEqual(res3.statusCode, 400);
              server.close();
              console.log('✓ End-to-end server test (multi-path fallback)');
            });
            req3.write(body3);
            req3.end();
          });
        });
        req2.write(body2);
        req2.end();
      });
    });
    req1.write(body1);
    req1.end();
  });
}

serverTest().catch((err) => {
  console.error('Server test failed:', err);
  process.exit(1);
});
