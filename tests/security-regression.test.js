'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('Bearer authentication accepts standard whitespace after the scheme', () => {
    assert.match(serverSource, /authorization\.replace\(\/\^Bearer\\s\+\/i, ''\)/);
    assert.doesNotMatch(serverSource, /authorization\.replace\(\/\^Bearer\\\\s\+\/i, ''\)/);
});

test('API responses are marked private and non-cacheable', () => {
    assert.match(serverSource, /res\.setHeader\('Cache-Control', 'no-store, private'\)/);
    assert.match(serverSource, /res\.setHeader\('Pragma', 'no-cache'\)/);
});

test('baseline browser security headers are configured', () => {
    assert.match(serverSource, /X-Content-Type-Options', 'nosniff'/);
    assert.match(serverSource, /X-Frame-Options', 'DENY'/);
    assert.match(serverSource, /Referrer-Policy', 'strict-origin-when-cross-origin'/);
    assert.match(serverSource, /app\.disable\('x-powered-by'\)/);
});

test('health endpoint does not expose records or secrets', () => {
    assert.match(serverSource, /app\.get\('\/healthz'/);
    assert.match(serverSource, /json\(\{ status: 'unhealthy' \}\)/);
});
