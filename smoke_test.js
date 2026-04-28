// Headless smoke test: load page, simulate addStep, capture state.
// Uses Chrome via CDP (no extra deps; spawns Chrome with --remote-debugging-port).
const cp = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TARGET_URL = 'http://127.0.0.1:8765/index.html';
const PORT = 9222;
const USER_DATA = path.join(process.env.TEMP || '/tmp', 'mlwalk-cdp-' + Date.now());

function req(opts) {
  return new Promise((resolve, reject) => {
    const r = http.request(opts, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => resolve({ status: res.statusCode, body: buf }));
    });
    r.on('error', reject);
    if (opts.body) r.write(opts.body);
    r.end();
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJson(p) {
  const r = await req({ host: '127.0.0.1', port: PORT, path: p, method: 'GET' });
  return JSON.parse(r.body);
}

(async () => {
  fs.mkdirSync(USER_DATA, { recursive: true });
  const child = cp.spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + USER_DATA,
    '--window-size=720,1200',
    TARGET_URL,
  ], { stdio: 'ignore', detached: false });

  let ready = false;
  for (let i = 0; i < 30; i++) {
    await sleep(300);
    try {
      const tabs = await getJson('/json');
      if (tabs.length) { ready = true; break; }
    } catch (e) {}
  }
  if (!ready) { console.error('FAIL: Chrome did not start'); child.kill(); process.exit(1); }

  const tabs = await getJson('/json');
  const tab = tabs.find(t => t.type === 'page') || tabs[0];
  const ws = require('http');
  // Use CDP via raw WebSocket - implement minimal client
  const WebSocket = require('node:worker_threads'); // placeholder; we'll use ws via http upgrade
  // Simpler: use the older /json/runtime/evaluate? Not standard. Use ws://
  // Implement minimal WS client using net
  const net = require('net');
  const crypto = require('crypto');
  const wsUrl = new URL(tab.webSocketDebuggerUrl);

  const sock = net.createConnection({ host: wsUrl.hostname, port: wsUrl.port });
  const key = crypto.randomBytes(16).toString('base64');
  await new Promise((res, rej) => {
    sock.once('connect', res);
    sock.once('error', rej);
  });
  sock.write(
    `GET ${wsUrl.pathname} HTTP/1.1\r\n` +
    `Host: ${wsUrl.hostname}:${wsUrl.port}\r\n` +
    `Upgrade: websocket\r\nConnection: Upgrade\r\n` +
    `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`
  );

  let buf = Buffer.alloc(0);
  let handshakeDone = false;
  const pendingResolvers = new Map();
  let msgId = 0;

  function frame(payload) {
    const data = Buffer.from(payload);
    const len = data.length;
    let head;
    if (len < 126) head = Buffer.from([0x81, 0x80 | len]);
    else if (len < 65536) {
      head = Buffer.alloc(4);
      head[0] = 0x81; head[1] = 0x80 | 126;
      head.writeUInt16BE(len, 2);
    } else {
      head = Buffer.alloc(10);
      head[0] = 0x81; head[1] = 0x80 | 127;
      head.writeBigUInt64BE(BigInt(len), 2);
    }
    const mask = crypto.randomBytes(4);
    const masked = Buffer.alloc(len);
    for (let i = 0; i < len; i++) masked[i] = data[i] ^ mask[i % 4];
    return Buffer.concat([head, mask, masked]);
  }

  sock.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    if (!handshakeDone) {
      const idx = buf.indexOf('\r\n\r\n');
      if (idx >= 0) { handshakeDone = true; buf = buf.slice(idx + 4); }
      else return;
    }
    while (buf.length >= 2) {
      const b1 = buf[0], b2 = buf[1];
      const opcode = b1 & 0x0f;
      let len = b2 & 0x7f;
      let off = 2;
      if (len === 126) { len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (buf.length < off + len) return;
      const payload = buf.slice(off, off + len);
      buf = buf.slice(off + len);
      if (opcode === 1) {
        const text = payload.toString('utf8');
        try {
          const m = JSON.parse(text);
          if (m.id && pendingResolvers.has(m.id)) {
            pendingResolvers.get(m.id)(m);
            pendingResolvers.delete(m.id);
          }
        } catch (e) {}
      }
    }
  });

  function send(method, params) {
    const id = ++msgId;
    const msg = JSON.stringify({ id, method, params: params || {} });
    sock.write(frame(msg));
    return new Promise((res, rej) => {
      pendingResolvers.set(id, res);
      setTimeout(() => { if (pendingResolvers.has(id)) { pendingResolvers.delete(id); rej(new Error('timeout: ' + method)); } }, 8000);
    });
  }

  // Wait a bit for handshake
  await sleep(400);

  await send('Runtime.enable');
  await send('Page.enable');
  // Wait for page to fully load
  await sleep(1500);

  async function evalExpr(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.result && r.result.exceptionDetails) {
      throw new Error('JS error: ' + JSON.stringify(r.result.exceptionDetails));
    }
    return r.result && r.result.result && r.result.result.value;
  }

  const errs = await evalExpr(`(() => { const e = window.__jsErrors || []; return e; })()`);
  console.log('errors collected:', errs);

  const before = await evalExpr(`window.__mlwalk ? window.__mlwalk.state.todaySteps : 'no_state'`);
  console.log('todaySteps before:', before);

  // Trigger 50 steps
  await evalExpr(`window.__mlwalk.addStep(50)`);
  await sleep(300);
  const after = await evalExpr(`window.__mlwalk.state.todaySteps`);
  const ko = await evalExpr(`window.__mlwalk.state.koCount`);
  const enemies = await evalExpr(`window.__mlwalk.enemies.length`);
  const canvasOk = await evalExpr(`!!document.getElementById('stage').getContext('2d')`);
  const todayHud = await evalExpr(`document.getElementById('todaySteps').textContent`);
  const koHud = await evalExpr(`document.getElementById('koCount').textContent`);

  console.log('todaySteps after +50:', after);
  console.log('koCount after +50:', ko, '(expect ~5)');
  console.log('enemies on stage:', enemies);
  console.log('canvas2d available:', canvasOk);
  console.log('HUD today text:', todayHud, '/ KO text:', koHud);

  // Grab a screenshot
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (shot.result && shot.result.data) {
    const out = path.join(__dirname, 'smoke_screenshot.png');
    fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
    console.log('screenshot written:', out);
  }

  let ok = (after >= 50) && (ko >= 1) && canvasOk;
  console.log(ok ? 'SMOKE TEST: PASS' : 'SMOKE TEST: FAIL');

  sock.destroy();
  child.kill();
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('FAIL:', e); process.exit(1); });
