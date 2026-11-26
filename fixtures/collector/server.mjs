// A fake tracker vendor for the shop fixture. It serves two synthetic tracker scripts and
// records every event they send, so a test can compare what the browser attempted with what
// actually arrived. Bind it to 127.0.0.1 while the shop runs on localhost: a different origin
// and a different site, like a real third-party vendor.
//
//   GET  /pulse.js /adtag.js       synthetic analytics and marketing scripts
//   POST /collect/analytics        events from pulse.js
//   POST /collect/ads              events from adtag.js
//   GET  /widget/stock.json        a request the shop's policy does not list (unclassified)
//   GET  /__receipts?after=N       events received after sequence number N
//   POST /__reset                  forget all receipts
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const host = process.env.COLLECTOR_HOST ?? '127.0.0.1';
const port = Number(process.env.COLLECTOR_PORT ?? 4318);

let receipts = [];
let seq = 0;

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

function send(res, status, body, headers = {}) {
  const text = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'cache-control': 'no-store',
    ...(typeof body === 'object' ? { 'content-type': 'application/json' } : {}),
    ...headers,
  });
  res.end(text);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  try {
    if (req.method === 'OPTIONS') return send(res, 204, undefined, cors);

    if (req.method === 'GET' && (url.pathname === '/pulse.js' || url.pathname === '/adtag.js')) {
      const script = await readFile(join(here, 'public', url.pathname.slice(1)), 'utf8');
      return send(res, 200, script, { 'content-type': 'text/javascript; charset=utf-8' });
    }

    if (req.method === 'POST' && (url.pathname === '/collect/analytics' || url.pathname === '/collect/ads')) {
      const body = await readBody(req);
      receipts.push({
        seq: ++seq,
        receivedAt: Date.now(),
        path: url.pathname,
        contentType: req.headers['content-type'] ?? null,
        origin: req.headers.origin ?? null,
        event: typeof body === 'object' && body ? (body.event ?? null) : null,
        page: typeof body === 'object' && body ? (body.page ?? null) : null,
        body,
      });
      return send(res, 204, undefined, cors);
    }

    if (req.method === 'GET' && url.pathname === '/widget/stock.json') {
      return send(res, 200, { updatedAt: new Date().toISOString(), lowStock: ['trail-flask'] }, cors);
    }

    if (req.method === 'GET' && url.pathname === '/__receipts') {
      const after = Number(url.searchParams.get('after') ?? 0);
      return send(res, 200, { seq, receipts: receipts.filter((r) => r.seq > after) }, cors);
    }

    if (req.method === 'POST' && url.pathname === '/__reset') {
      receipts = [];
      return send(res, 204, undefined, cors);
    }

    if (req.method === 'GET' && url.pathname === '/__health') return send(res, 200, { ok: true, receipts: receipts.length });

    send(res, 404, { error: 'not found' }, cors);
  } catch (e) {
    send(res, 500, { error: String(e) });
  }
});

server.listen(port, host, () => console.log(`collector listening on http://${host}:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
