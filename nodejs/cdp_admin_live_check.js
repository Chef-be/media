const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');

const USERNAME = process.env.CHEFBE_ADMIN_USER;
const PASSWORD = process.env.CHEFBE_ADMIN_PASS;
const BASE_URL = process.env.CHEFBE_BASE_URL || 'https://www.chef-be.fr';
const LOGIN_URL = `${BASE_URL}/login`;
const LIVE_URL = `${BASE_URL}/admin-cp/live`;
const OUT_DIR = '/var/www/vhosts/chef-be.fr/httpdocs/tmp_screens';
const PROFILE_DIR = '/tmp/codex-chefbe-admin-live-profile';
const CHROME_PORT = 9226;

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
    const height = options.height || 1800;
    const mobile = !!options.mobile;
    const deviceScaleFactor = options.deviceScaleFactor || 1;

    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      mobile,
      deviceScaleFactor
    });

    if (mobile) {
      await this.send('Emulation.setTouchEmulationEnabled', {
        enabled: true,
        configuration: 'mobile'
      });
    } else {
      await this.send('Emulation.setTouchEmulationEnabled', {
        enabled: false
      });
    }

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
  await delay(2500);
}

async function captureLive(client) {
  await client.navigate(LIVE_URL);
  await delay(3000);

  const pageState = await client.evaluate(`
    (function () {
      return {
        title: document.title,
        providerLabel: !!Array.from(document.querySelectorAll('label, h6')).find(function (node) {
          return /Chef Live|Provider par défaut/.test(node.textContent || '');
        }),
        providerValue: (document.querySelector('#live_provider') || {}).value || null
      };
    })();
  `);

  if (!pageState.providerLabel) {
    throw new Error('Live admin controls not found on page');
  }

  await client.evaluate(`
    (function () {
      var provider = document.querySelector('#live_provider');
      if (provider) {
        provider.value = 'chef_live';
        provider.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (typeof ChefLiveHealth === 'function') {
        ChefLiveHealth();
      }
    })();
  `);

  await delay(3000);

  const healthText = await client.evaluate(`
    (function () {
      var alert = document.querySelector('.chef-live-health-alert');
      return alert ? alert.textContent.trim() : '';
    })();
  `);

  const desktopPath = path.join(OUT_DIR, 'admin-live-real-desktop.png');
  const mobilePath = path.join(OUT_DIR, 'admin-live-real-mobile.png');

  await client.screenshot(desktopPath, {
    width: 1440,
    height: 2200,
    mobile: false
  });

  await client.screenshot(mobilePath, {
    width: 430,
    height: 2200,
    mobile: true,
    deviceScaleFactor: 2
  });

  return {
    title: pageState.title,
    providerValue: pageState.providerValue,
    healthText,
    desktopPath,
    mobilePath
  };
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
    '--ignore-certificate-errors',
    '--hide-scrollbars',
    `--user-data-dir=${PROFILE_DIR}`
  ], {
    stdio: 'ignore'
  });

  try {
    await waitForJson(`http://127.0.0.1:${CHROME_PORT}/json/version`);
    const target = JSON.parse(await httpPutText(`http://127.0.0.1:${CHROME_PORT}/json/new?about:blank`));
    const client = new CDPClient(target.webSocketDebuggerUrl);
    await client.connect();
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('DOM.enable');
    await client.send('Network.enable');

    await login(client);
    const result = await captureLive(client);
    console.log(JSON.stringify(result, null, 2));
    client.close();
  } finally {
    chrome.kill('SIGKILL');
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
