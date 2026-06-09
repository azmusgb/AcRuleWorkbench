const http = require('http');
const fs = require('fs');
const path = require('path');

const DEFAULT_PORT = 5000;
const DEFAULT_HOST = '127.0.0.1';

const args = new Set(process.argv.slice(2));
function argValue(name, fallback) {
  const argv = process.argv.slice(2);
  const index = argv.findIndex((item) => item === name);
  return index >= 0 && index < argv.length - 1 ? argv[index + 1] : fallback;
}

const PORT = Number.parseInt(argValue('--port', process.env.PORT || String(DEFAULT_PORT)), 10) || DEFAULT_PORT;
const HOST = argValue('--host', process.env.HOST || DEFAULT_HOST);
const ENABLE_CORS = args.has('--enable-cors');
const ALLOW_REMOTE_STATIC = args.has('--allow-remote-static');

const ROOT = path.resolve(__dirname);
const DEFAULT_VIEWER = '/ac-rule-viewer.html';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const BLOCKED_SEGMENTS = new Set([
  '.git',
  '.vs',
  'artifacts',
  'attached_assets',
  'bin',
  'obj',
  'lib',
  'rri_bin',
  'packages',
  'TestResults',
]);

const BLOCKED_FILE_NAMES = new Set([
  'fwd.cfd',
  'ac-rule-viewer-live.html',
  'ac-rule-viewer-live.css',
  'ac-rule-viewer-live.js',
  'ac-rule-viewer.fwd.json',
  'ac-rule-viewer.rules.json',
  'ac-rule-viewer.rel.json',
  'ac-rule-viewer.tree.json',
  'ac-rule-viewer.flow.json',
  'runtime-path.generated.ps1',
]);

const BLOCKED_EXTENSIONS = new Set([
  '.zip',
  '.7z',
  '.rar',
  '.dll',
  '.exe',
  '.pdb',
  '.log',
  '.trace',
  '.dmp',
  '.etl',
  '.user',
  '.suo',
]);

function isLoopbackHost(host) {
  const normalized = String(host || '').toLowerCase();
  return normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '[::1]';
}

function reject(res, statusCode, message) {
  const body = Buffer.from(`${message}\n`, 'utf8');
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': String(body.length),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function normalizeRequestPath(req) {
  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);
  let urlPath = decodeURIComponent(url.pathname || '/');

  if (urlPath === '/' || urlPath === '/viewer') {
    urlPath = DEFAULT_VIEWER;
  }

  if (urlPath.includes('\0')) {
    throw new Error('Invalid path.');
  }

  const relative = urlPath.replace(/^\/+/, '');
  const resolved = path.resolve(ROOT, relative);
  const relativeFromRoot = path.relative(ROOT, resolved);

  if (relativeFromRoot.startsWith('..') || path.isAbsolute(relativeFromRoot)) {
    throw new Error('Path is outside the static viewer root.');
  }

  const segments = relativeFromRoot.split(path.sep).filter(Boolean);
  if (segments.some((segment) => BLOCKED_SEGMENTS.has(segment))) {
    throw new Error('This path is not served by the static viewer.');
  }

  const fileName = path.basename(resolved);
  if (BLOCKED_FILE_NAMES.has(fileName)) {
    throw new Error('This generated or private file is not served by the static viewer.');
  }

  const extension = path.extname(resolved).toLowerCase();
  if (BLOCKED_EXTENSIONS.has(extension)) {
    throw new Error('This file type is not served by the static viewer.');
  }

  return { resolved, extension };
}

if (!isLoopbackHost(HOST) && !ALLOW_REMOTE_STATIC) {
  console.error(`Refusing to bind static viewer to non-loopback host "${HOST}".`);
  console.error('Use --allow-remote-static only on a trusted network and never from a source tree containing private FWD/config artifacts.');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  if (ENABLE_CORS) {
    res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:' + PORT);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    if (!ENABLE_CORS) return reject(res, 403, 'CORS is disabled.');
    res.writeHead(204, {
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Request-Id',
    });
    res.end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return reject(res, 405, 'Method not allowed.');
  }

  let file;
  try {
    file = normalizeRequestPath(req);
  } catch (err) {
    return reject(res, 403, err && err.message ? err.message : 'Forbidden.');
  }

  fs.stat(file.resolved, (statErr, stats) => {
    if (statErr || !stats.isFile()) {
      return reject(res, 404, 'Not found.');
    }

    const contentType = MIME_TYPES[file.extension] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': String(stats.size),
    });

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    const stream = fs.createReadStream(file.resolved);
    stream.on('error', () => reject(res, 500, 'Server error.'));
    stream.pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`FW Editor Viewer static server running at http://${HOST}:${PORT}`);
  console.log('Static server is localhost-only by default. Use the .NET API host for product API workflows.');
});
