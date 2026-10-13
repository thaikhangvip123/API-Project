import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const platformDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(platformDir, 'gateway', 'public');
const assetsDir = path.join(publicDir, 'assets');
const expectedAssets = [
  'app.css',
  'app.js',
  'api-client.js',
  'auth.js',
  'dashboard.js',
  'graphql.js',
  'soap.js',
  'users.js'
];

const html = await readFile(path.join(publicDir, 'index.html'), 'utf8');
const nginx = await readFile(path.join(platformDir, 'gateway', 'nginx.conf'), 'utf8');
const sourceFiles = [
  path.join(publicDir, 'index.html'),
  ...expectedAssets.map((name) => path.join(assetsDir, name))
];
const browserSource = (await Promise.all(sourceFiles.map((file) => readFile(file, 'utf8')))).join('\n');

describe('static API portal', () => {
  it('contains every required file and resolves local references', async () => {
    for (const asset of expectedAssets) {
      assert.equal(existsSync(path.join(assetsDir, asset)), true, `missing ${asset}`);
    }

    for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)) {
      assert.equal(existsSync(path.join(publicDir, match[1])), true, `missing referenced asset ${match[1]}`);
    }

    for (const moduleName of expectedAssets.filter((name) => name.endsWith('.js'))) {
      const source = await readFile(path.join(assetsDir, moduleName), 'utf8');
      for (const match of source.matchAll(/from '\.\/([^']+)'/g)) {
        assert.equal(existsSync(path.join(assetsDir, match[1])), true, `missing import ${match[1]}`);
      }
    }
  });

  it('has unique ids, valid fragment targets, and all planned sections', () => {
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(new Set(ids).size, ids.length, 'element ids must be unique');
    for (const match of html.matchAll(/(?:href|data-copy-target)="#([^"]+)"/g)) {
      assert.equal(ids.includes(match[1]), true, `missing fragment target #${match[1]}`);
    }
    for (const id of ['overview', 'status', 'authentication', 'users', 'graphql', 'soap-demo', 'webhook-docs', 'realtime', 'grpc', 'endpoints']) {
      assert.equal(ids.includes(id), true, `missing portal section #${id}`);
      assert.match(html, new RegExp(`href="#${id}"`), `navigation must link to #${id}`);
    }
  });

  it('avoids external UI dependencies and unsafe browser sinks', () => {
    assert.doesNotMatch(html, /<(?:script|link)[^>]+(?:src|href)="https?:\/\//i);
    const externalUrls = [...browserSource.matchAll(/https?:\/\/[^"'\s<]+/g)].map((match) => match[0]);
    assert.deepEqual(externalUrls.sort(), [
      'http://schemas.xmlsoap.org/soap/envelope/',
      'https://api.jcb-services.me/health'
    ]);
    assert.doesNotMatch(browserSource, /\b(?:localStorage|sessionStorage|innerHTML|outerHTML|insertAdjacentHTML|srcdoc|document\.write|eval|Function)\b/);
    assert.doesNotMatch(browserSource, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/);
    assert.doesNotMatch(browserSource, /CF-Access-Client-(?:Id|Secret):\s*(?!\$CF_ACCESS_)[^<\s]+/i);
  });

  it('does not contain a sensitive value from local runtime environments', async () => {
    for (const envName of ['.env', '.env.production']) {
      const envPath = path.join(platformDir, envName);
      if (!existsSync(envPath)) continue;
      const lines = (await readFile(envPath, 'utf8')).split(/\r?\n/);
      for (const line of lines) {
        if (!line || line.startsWith('#') || !line.includes('=')) continue;
        const separator = line.indexOf('=');
        const key = line.slice(0, separator);
        const value = line.slice(separator + 1);
        if (/(SECRET|PASSWORD|TOKEN|PRIVATE|KEY)/i.test(key) && value.length >= 8) {
          assert.equal(browserSource.includes(value), false, `runtime value for ${key} leaked into portal`);
        }
      }
    }
  });

  it('keeps JWT in memory and documents webhook placeholders only', async () => {
    const auth = await readFile(path.join(assetsDir, 'auth.js'), 'utf8');
    assert.match(auth, /let currentToken = '';/);
    assert.match(auth, /navigator\.clipboard\.writeText\(currentToken\)/);
    assert.match(html, /HMAC_SHA256\(WEBHOOK_SECRET, raw_request_body\)/);
    assert.match(html, /\$CF_ACCESS_CLIENT_ID/);
    assert.match(html, /\$CF_ACCESS_CLIENT_SECRET/);
    assert.match(html, /id="register-form"[^>]+method="post"[^>]+action="\/api\/auth\/register"/);
    assert.match(html, /id="login-form"[^>]+method="post"[^>]+action="\/api\/auth\/login"/);
  });

  it('configures exact static routing, MIME types, and portal-only security headers', () => {
    assert.match(nginx, /include \/etc\/nginx\/mime\.types;/);
    assert.match(nginx, /default_type application\/octet-stream;/);
    assert.match(nginx, /location = \/ \{/);
    assert.match(nginx, /location \/assets\/ \{/);
    assert.match(nginx, /location \/ws\/ \{/);
    assert.match(nginx, /location \/webrtc\/ \{/);
    const rootLocation = nginx.slice(nginx.indexOf('location = / {'), nginx.indexOf('location = /index.html'));
    for (const header of ['Content-Security-Policy', 'X-Frame-Options', 'Permissions-Policy']) {
      assert.match(rootLocation, new RegExp(header), `${header} must be set on the portal response`);
      assert.equal((nginx.match(new RegExp(header, 'g')) || []).length, 1, `${header} must only be set on the portal response`);
    }
    assert.match(rootLocation, /X-Content-Type-Options nosniff/);

    const wsLocation = nginx.slice(nginx.indexOf('location /ws/ {'), nginx.indexOf('location = /webhook/health'));
    const webrtcLocation = nginx.slice(nginx.indexOf('location /webrtc/ {'));
    for (const location of [wsLocation, webrtcLocation]) {
      assert.doesNotMatch(location, /Content-Security-Policy|X-Frame-Options|Permissions-Policy/);
    }
  });

  it('mounts the portal read-only in development and production Compose', async () => {
    for (const composeName of ['docker-compose.yml', 'docker-compose.prod.yml']) {
      const compose = await readFile(path.join(platformDir, composeName), 'utf8');
      assert.match(compose, /\.\/gateway\/public:\/usr\/share\/nginx\/html:ro/);
    }
  });

  it('contains only the expected public files', async () => {
    const publicEntries = (await readdir(publicDir)).sort();
    const actualAssets = (await readdir(assetsDir)).sort();
    assert.deepEqual(publicEntries, ['assets', 'index.html']);
    assert.deepEqual(actualAssets, [...expectedAssets].sort());
  });
});
