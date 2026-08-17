'use strict';

const pkg = require('../../package.json');

/**
 * Landing page handler for GET /.
 *
 * Browsers (and anyone not explicitly asking for JSON) get a plain, minimal
 * HTML status page — no CSS, no external assets, no inline scripts. API
 * clients sending `Accept: application/json` get a JSON status payload
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
  const now = new Date();
  const info = homeInfo(req);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Taddle API</title>
</head>
<body>
<h1>Taddle API</h1>
<p>Backend for the Taddle social platform</p>
<p><strong>Status:</strong> All systems operational</p>
<p><strong>Environment:</strong> ${escapeHtml(info.environment)}</p>
<p><strong>Version:</strong> v${escapeHtml(info.version)}</p>
<p><strong>Uptime:</strong> ${escapeHtml(formatUptime(info.uptimeSeconds))}</p>
<p><strong>Host:</strong> ${escapeHtml(host)}</p>
<p><strong>Server time:</strong> ${escapeHtml(now.toISOString())}</p>
<hr>
<p>&copy; ${now.getFullYear()} Taddle &middot; ${escapeHtml(host)}</p>
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
