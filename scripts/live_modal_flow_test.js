const {spawn} = require('child_process');
const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https://') ? https : http;
    const req = lib.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
  });
}

async function waitForJson(url, attempts, delayMs) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fetchJson(url);
    } catch (_error) {
      await wait(delayMs);
    }
  }
  throw new Error('Unable to fetch JSON from ' + url);
}

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
    });

    this.ws.on('message', (raw) => {
      const payload = JSON.parse(String(raw));
      if (!payload.id) {
        return;
      }
      const pending = this.pending.get(payload.id);
      if (!pending) {
        return;
      }
      this.pending.delete(payload.id);
      if (payload.error) {
        pending.reject(new Error(JSON.stringify(payload.error)));
        return;
      }
      pending.resolve(payload.result);
    });
  }

  send(method, params = {}, sessionId = null) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) {
      payload.sessionId = sessionId;
    }
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  async evaluate(sessionId, expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    }, sessionId);
    return result.result ? result.result.value : null;
  }
}

async function main() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chef-live-modal-'));
  const browser = spawn('/usr/bin/chromium', [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--autoplay-policy=no-user-gesture-required',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--ignore-certificate-errors',
    '--window-size=1440,1200',
    '--remote-debugging-port=9333',
    '--user-data-dir=' + userDataDir,
    'about:blank'
  ], { stdio: 'ignore' });

  try {
    const version = await waitForJson('http://127.0.0.1:9333/json/version', 80, 250);
    const cdp = new CDP(version.webSocketDebuggerUrl);
    await cdp.open();

    const target = await cdp.send('Target.createTarget', { url: 'https://www.chef-be.fr/login' });
    const attached = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    const sessionId = attached.sessionId;

    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Network.enable', {}, sessionId);

    await wait(5000);

    const loginState = await cdp.evaluate(sessionId, `(() => ({
      url: location.href,
      hasUser: !!document.querySelector('#username'),
      hasPass: !!document.querySelector('#password')
    }))()`);

    if (loginState.hasUser && loginState.hasPass) {
      await cdp.evaluate(sessionId, `(() => {
        document.querySelector('#username').value = 'admin';
        document.querySelector('#password').value = '@Sharingan06200';
        document.querySelector('form').submit();
        return true;
      })()`);
      await wait(5000);
    }

    await cdp.send('Page.navigate', { url: 'https://www.chef-be.fr/live' }, sessionId);
    await wait(8000);

    const beforeEnd = await cdp.evaluate(sessionId, `(() => ({
      url: location.href,
      activeContext: window.PT_ACTIVE_LIVE_CONTEXT || null,
      existingVisible: !!document.querySelector('#live_existing_actions') && getComputedStyle(document.querySelector('#live_existing_actions')).display !== 'none',
      resumeText: document.querySelector('#resumeExistingLiveBtn') ? document.querySelector('#resumeExistingLiveBtn').textContent.trim() : null,
      endText: document.querySelector('#endExistingLiveBtn') ? document.querySelector('#endExistingLiveBtn').textContent.trim() : null,
      publishText: document.querySelector('#publishBtn') ? document.querySelector('#publishBtn').textContent.trim() : null
    }))()`);

    await cdp.evaluate(sessionId, `(() => {
      const button = document.querySelector('#endExistingLiveBtn');
      if (button) {
        button.click();
        return true;
      }
      return false;
    })()`);
    await wait(6000);

    const afterEnd = await cdp.evaluate(sessionId, `(() => ({
      activeContext: window.PT_ACTIVE_LIVE_CONTEXT || null,
      existingVisible: !!document.querySelector('#live_existing_actions') && getComputedStyle(document.querySelector('#live_existing_actions')).display !== 'none',
      publishText: document.querySelector('#publishBtn') ? document.querySelector('#publishBtn').textContent.trim() : null,
      titleValue: document.querySelector('#live_video_name') ? document.querySelector('#live_video_name').value : null
    }))()`);

    await cdp.evaluate(sessionId, `(() => {
      const mode = document.querySelector('#live_stream_mode');
      const target = document.querySelector('#live_stream_target');
      const title = document.querySelector('#live_video_name');
      if (mode) {
        mode.value = 'browser';
        mode.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (target) {
        target.value = 'chef_live';
        target.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (title) {
        title.value = 'Codex Modal Test';
      }
      return true;
    })()`);
    await wait(2000);

    await cdp.evaluate(sessionId, `(() => {
      const button = document.querySelector('#publishBtn');
      if (button) {
        button.click();
        return true;
      }
      return false;
    })()`);
    await wait(12000);

    const afterCreate = await cdp.evaluate(sessionId, `(() => ({
      activeContext: window.PT_ACTIVE_LIVE_CONTEXT || null,
      livePostId: document.querySelector('#live_post_id') ? document.querySelector('#live_post_id').value : null,
      statusText: document.querySelector('.chef-live-browser-status-text') ? document.querySelector('.chef-live-browser-status-text').textContent.trim() : null,
      previewReady: !!(document.querySelector('#chef-live-inline-preview') && document.querySelector('#chef-live-inline-preview').srcObject),
      endVisible: !!document.querySelector('.end_vdo_call') && !document.querySelector('.end_vdo_call').classList.contains('hidden')
    }))()`);

    console.log(JSON.stringify({ beforeEnd, afterEnd, afterCreate }, null, 2));
    cdp.ws.close();
  } finally {
    browser.kill('SIGKILL');
  }
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});
