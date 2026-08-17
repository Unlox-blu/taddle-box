'use strict';

const pkg = require('../../package.json');

/**
 * Landing page handler for GET /.
 *
 * Browsers (and anyone not explicitly asking for JSON) get a small,
 * self-contained HTML status page — no external assets, no inline scripts,
 * so it stays valid under helmet's default Content-Security-Policy
 * (`style-src` allows inline styles; `script-src 'self'` blocks inline JS).
 * API clients sending `Accept: application/json` get a JSON status payload
 * instead.
 */

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatUptime = (seconds) => {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
};

const homeInfo = (req) => ({
  name: pkg.name,
  version: pkg.version,
  status: 'ok',
  environment: process.env.NODE_ENV || 'development',
  host: req.get('host') || '',
  uptimeSeconds: Math.floor(process.uptime()),
  startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
  timestamp: new Date().toISOString(),
});

const renderHomePage = (req) => {
  const host = req.get('host') || '';
  const baseUrl = `${req.protocol}://${host}`;
  const now = new Date();
  const info = homeInfo(req);

  const endpoints = [
    '/health',
    '/api/v1/auth',
    '/api/v1/users',
    '/api/v1/posts',
    '/api/v1/communities',
    '/api/v1/events',
    '/api/v1/games',
    '/api/v1/feed',
    '/api/v1/wallet',
    '/api/v1/xp',
    '/api/v1/search',
    '/api/v1/notifications',
  ];

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Taddle API — online</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    padding: 32px 16px;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: #e7ecf5;
    background: radial-gradient(1100px 600px at 50% -10%, #1e2a4a 0%, #0b1220 55%, #070b14 100%);
  }
  .card {
    width: 100%; max-width: 720px;
    background: rgba(255,255,255,.04);
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 20px; padding: 40px;
    box-shadow: 0 24px 60px rgba(0,0,0,.45);
  }
  .brand { display: flex; align-items: center; gap: 14px; margin-bottom: 8px; }
  .logo {
    width: 46px; height: 46px; border-radius: 12px; flex: none;
    background: linear-gradient(135deg, #6c8cff, #a06bff);
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 22px; color: #fff;
  }
  h1 { margin: 0; font-size: 26px; letter-spacing: -.01em; }
  .sub { margin: 2px 0 0; color: #93a1bd; font-size: 14.5px; }
  .status {
    display: inline-flex; align-items: center; gap: 8px; margin-top: 24px;
    background: rgba(46,204,113,.12); color: #4ade80;
    border: 1px solid rgba(46,204,113,.35);
    padding: 6px 14px; border-radius: 999px; font-size: 13px; font-weight: 600;
  }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #4ade80; animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin: 26px 0 30px; }
  .cell {
    background: rgba(255,255,255,.045);
    border: 1px solid rgba(255,255,255,.08);
    border-radius: 12px; padding: 14px 16px;
  }
  .cell .k { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #7d8aa8; margin-bottom: 4px; }
  .cell .v { font-size: 15px; font-weight: 600; color: #eef2fa; word-break: break-all; }
  .endpoints h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #7d8aa8; margin: 0 0 12px; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12.5px;
    color: #b8c7e8; background: rgba(108,140,255,.1);
    border: 1px solid rgba(108,140,255,.25);
    border-radius: 8px; padding: 6px 10px; text-decoration: none;
  }
  .chip:hover { background: rgba(108,140,255,.2); color: #fff; }
  footer {
    margin-top: 30px; padding-top: 18px; border-top: 1px solid rgba(255,255,255,.07);
    color: #5c6a88; font-size: 12.5px;
    display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px;
  }
  @media (max-width: 560px) { .grid { grid-template-columns: 1fr; } .card { padding: 28px 20px; } }
</style>
</head>
<body>
<div class="card">
  <div class="brand">
    <div class="logo">T</div>
    <div>
      <h1>Taddle API</h1>
      <p class="sub">Backend for the Taddle social platform</p>
    </div>
  </div>

  <span class="status"><span class="dot"></span>All systems operational</span>

  <div class="grid">
    <div class="cell"><div class="k">Environment</div><div class="v">${escapeHtml(info.environment)}</div></div>
    <div class="cell"><div class="k">Version</div><div class="v">v${escapeHtml(info.version)}</div></div>
    <div class="cell"><div class="k">Uptime</div><div class="v">${escapeHtml(formatUptime(info.uptimeSeconds))}</div></div>
    <div class="cell"><div class="k">Host</div><div class="v">${escapeHtml(host)}</div></div>
    <div class="cell"><div class="k">Started at</div><div class="v">${escapeHtml(info.startedAt)}</div></div>
    <div class="cell"><div class="k">Server time</div><div class="v">${escapeHtml(now.toISOString())}</div></div>
  </div>

  <div class="endpoints">
    <h2>API endpoints</h2>
    <div class="chips">
      ${endpoints.map((path) => `<a class="chip" href="${escapeHtml(baseUrl + path)}">${escapeHtml(path)}</a>`).join('')}
    </div>
  </div>

  <footer>
    <span>&copy; ${now.getFullYear()} Taddle</span>
    <span>${escapeHtml(host)}</span>
  </footer>
</div>
</body>
</html>`;
};

const homeHandler = (req, res) => {
  if (req.accepts(['html', 'json']) === 'json') {
    return res.json(homeInfo(req));
  }
  return res.type('html').send(renderHomePage(req));
};

module.exports = {
  homeHandler,
  homeInfo,
  renderHomePage,
};
