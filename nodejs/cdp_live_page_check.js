const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');

const USERNAME = process.env.CHEFBE_ADMIN_USER;
const PASSWORD = process.env.CHEFBE_ADMIN_PASS;
const BASE_URL = process.env.CHEFBE_BASE_URL || 'https://www.chef-be.fr';
const LOGIN_URL = `${BASE_URL}/login`;
const LIVE_URL = `${BASE_URL}/live`;
const OUT_DIR = '/var/www/vhosts/chef-be.fr/httpdocs/tmp_screens';
const PROFILE_DIR = '/tmp/codex-chefbe-live-page-profile';
const CHROME_PORT = 9227;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
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
    }).on('error', reject);
  });
}

async function waitForJson(url, retries = 60) {
  let lastError;
  for (let i = 0; i < retries; i += 1) {
    try {
      return await httpGetJson(url);
    } catch (error) {
      lastError = error;
      await delay(250);
    }
  }
  throw lastError;
}

function httpPutText(url) {
  return new Promise((resolve, reject) => {
    const request = http.request(url, { method: 'PUT' }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => resolve(data));
    });
    request.on('error', reject);
    request.end();
  });
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.events = new Map();
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
    });

    this.ws.on('message', (raw) => {
      const message = JSON.parse(raw);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) {
          return;
        }
        this.pending.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result);
        }
        return;
      }

      const handlers = this.events.get(message.method) || [];
      handlers.forEach((handler) => handler(message.params || {}));
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  once(method, predicate = null, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout waiting for ${method}`));
      }, timeoutMs);

      const handler = (params) => {
        if (predicate && !predicate(params)) {
          return;
        }
        cleanup();
        resolve(params);
      };

      const cleanup = () => {
        clearTimeout(timeout);
        const handlers = this.events.get(method) || [];
        this.events.set(method, handlers.filter((item) => item !== handler));
      };

      const handlers = this.events.get(method) || [];
      handlers.push(handler);
      this.events.set(method, handlers);
    });
  }

  async navigate(url) {
    const loaded = this.once('Page.loadEventFired', null, 45000);
    await this.send('Page.navigate', { url });
    await loaded;
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    return result.result ? result.result.value : undefined;
  }

  async screenshot(filePath, options = {}) {
    const width = options.width || 1440;
    const height = options.height || 2200;
    const mobile = !!options.mobile;
    const deviceScaleFactor = options.deviceScaleFactor || 1;

    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      mobile,
      deviceScaleFactor
    });

    const { data } = await this.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true
    });

    fs.writeFileSync(filePath, Buffer.from(data, 'base64'));
  }

  close() {
    this.ws.close();
  }
}

async function login(client) {
  await client.navigate(LOGIN_URL);
  await delay(1500);
  await client.evaluate(`
    (function () {
      var username = document.querySelector('#username');
      var password = document.querySelector('#password');
      if (!username || !password) {
        throw new Error('Login form not found');
      }
      username.value = ${JSON.stringify(USERNAME)};
      password.value = ${JSON.stringify(PASSWORD)};
      username.dispatchEvent(new Event('input', { bubbles: true }));
      password.dispatchEvent(new Event('input', { bubbles: true }));
      var submit = document.querySelector('.login-form form input[type="submit"], .login-form form button[type="submit"]');
      if (!submit) {
        throw new Error('Login submit not found');
      }
      submit.click();
    })();
  `);
  await client.once('Page.loadEventFired', null, 45000);
  await delay(3000);
}

async function createBrowserLive(client) {
  await client.navigate(LIVE_URL);
  await delay(3000);

  const state = await client.evaluate(`
    (function () {
      return {
        title: document.title,
        hasSetupButton: !!document.querySelector('#openLiveSetupModal'),
        hasModal: !!document.querySelector('#liveSetupModal'),
        targets: window.PT_LIVE_TARGETS || null
      };
    })();
  `);

  if (!state.hasSetupButton || !state.hasModal) {
    throw new Error('Live setup modal not found');
  }

  const targetInfo = await client.evaluate(`
    (function () {
      $('#liveSetupModal').modal('show');
      var targets = window.PT_LIVE_TARGETS || {};
      var browserTargets = Array.isArray(targets.browser) ? targets.browser : [];
      var selected = null;
      for (var i = 0; i < browserTargets.length; i += 1) {
        if (browserTargets[i] && browserTargets[i].provider !== 'agora') {
          selected = browserTargets[i];
          break;
        }
      }
      if (!selected && browserTargets.length) {
        selected = browserTargets[0];
      }
      if (!selected) {
        return { ok: false, reason: 'No browser target available', targets: targets };
      }
      var title = 'Codex Live Browser Test ' + Date.now();
      $('#live_stream_mode').val('browser').trigger('change');
      $('#live_video_name').val(title).trigger('input');
      $('#live_stream_target').val(selected.server_id).trigger('change');
      return {
        ok: true,
        title: title,
        selected: selected,
        allTargets: targets
      };
    })();
  `);

  if (!targetInfo.ok) {
    throw new Error(targetInfo.reason || 'Unable to choose browser target');
  }

  await delay(1500);

  await client.evaluate(`
    (function () {
      var btn = document.querySelector('#publishBtn');
      if (!btn) {
        throw new Error('Publish button not found');
      }
      btn.click();
    })();
  `);

  let created = false;
  for (let i = 0; i < 40; i += 1) {
    await delay(1500);
    const result = await client.evaluate(`
      (function () {
        return {
          postId: (document.querySelector('#live_post_id') || {}).value || '',
          hasIframe: !!document.querySelector('.chef-live-browser-publisher iframe'),
          hasEncoderPanel: !!document.querySelector('#live_stream_credentials .chef-live-panel'),
          setupVisible: !!document.querySelector('#liveSetupModal.in')
        };
      })();
    `);
    if (result.postId) {
      created = true;
      break;
    }
  }

  if (!created) {
    throw new Error('Live was not created');
  }

  await delay(4000);

  const summary = await client.evaluate(`
    (function () {
      var iframe = document.querySelector('.chef-live-browser-publisher iframe');
      var intro = document.querySelector('#live_setup_intro');
      var heading = document.querySelector('#remote-media h3');
      var main = document.querySelector('#main_live_video');
      var remote = document.querySelector('#remote-media');
      var iframeWrap = document.querySelector('.chef-live-browser-publisher');
      function box(node) {
        if (!node) {
          return null;
        }
        var rect = node.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          left: rect.left,
          top: rect.top
        };
      }
      function parents(node) {
        var items = [];
        var current = node;
        while (current && current.nodeType === 1 && items.length < 8) {
          var rect = current.getBoundingClientRect();
          items.push({
            tag: current.tagName,
            id: current.id || '',
            className: current.className || '',
            width: rect.width,
            left: rect.left
          });
          current = current.parentElement;
        }
        return items;
      }
      return {
        postId: (document.querySelector('#live_post_id') || {}).value || '',
        iframeSrc: iframe ? iframe.getAttribute('src') : '',
        hasIframe: !!iframe,
        mainHtml: main ? main.innerHTML.slice(0, 1500) : '',
        intro: intro ? intro.textContent.trim() : '',
        heading: heading ? heading.textContent.trim() : '',
        modalVisible: !!document.querySelector('#liveSetupModal.in'),
        mainBox: box(main),
        remoteBox: box(remote),
        iframeWrapBox: box(iframeWrap),
        ancestry: parents(main)
      };
    })();
  `);

  return { targetInfo, summary };
}

async function cleanupLive(client) {
  await client.evaluate(`
    (function () {
      try {
        if (typeof DeleteLive === 'function' && (document.querySelector('#live_post_id') || {}).value) {
          DeleteLive();
        }
      } catch (error) {}
    })();
  `);
  await delay(1500);
}

async function main() {
  if (!USERNAME || !PASSWORD) {
    throw new Error('Missing credentials in environment');
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.rmSync(PROFILE_DIR, { recursive: true, force: true });

  const chrome = spawn('/usr/bin/chromium', [
    `--remote-debugging-port=${CHROME_PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--allow-http-screen-capture',
    `--user-data-dir=${PROFILE_DIR}`
  ], {
    stdio: 'ignore'
  });

  try {
    await waitForJson(`http://127.0.0.1:${CHROME_PORT}/json/version`);
    const newTarget = await httpPutText(`http://127.0.0.1:${CHROME_PORT}/json/new?${encodeURIComponent('about:blank')}`);
    const target = JSON.parse(newTarget);
    const client = new CDPClient(target.webSocketDebuggerUrl);
    await client.connect();
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('DOM.enable');
    await client.send('Network.enable');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 1100,
      mobile: false,
      deviceScaleFactor: 1
    });

    await login(client);
    const result = await createBrowserLive(client);

    const shot = `${OUT_DIR}/codex-live-browser-check.png`;
    await client.screenshot(shot, { width: 1440, height: 2200 });
    await cleanupLive(client);

    console.log(JSON.stringify({
      ok: true,
      screenshot: shot,
      result
    }, null, 2));

    client.close();
  } finally {
    chrome.kill('SIGKILL');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
