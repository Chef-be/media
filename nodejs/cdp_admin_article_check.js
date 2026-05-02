const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');

const USERNAME = process.env.CHEFBE_ADMIN_USER;
const PASSWORD = process.env.CHEFBE_ADMIN_PASS;
const BASE_URL = 'https://www.chef-be.fr';
const LOGIN_URL = `${BASE_URL}/login`;
const CREATE_URL = `${BASE_URL}/admin-cp/create-article`;
const IMAGE_PATH = '/var/www/vhosts/chef-be.fr/httpdocs/upload/photos/thumbnail.jpg';
const OUT_DIR = '/var/www/vhosts/chef-be.fr/httpdocs/script_backups/codex_shots';
const PROFILE_DIR = '/tmp/codex-chefbe-admin-profile';
const CHROME_PORT = 9222;

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

async function waitForJson(url, retries = 50) {
  let lastError;
  for (let i = 0; i < retries; i += 1) {
    try {
      return await httpGetJson(url);
    } catch (error) {
      lastError = error;
      await delay(200);
    }
  }
  throw lastError;
}

function httpGetText(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
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
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(payload);
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

  async screenshot(filePath, fullPage = true) {
    if (fullPage) {
      const metrics = await this.send('Page.getLayoutMetrics');
      const width = Math.ceil(metrics.contentSize.width || 1400);
      const height = Math.ceil(metrics.contentSize.height || 1000);
      await this.send('Emulation.setDeviceMetricsOverride', {
        mobile: false,
        width,
        height,
        deviceScaleFactor: 1
      });
    }

    const { data } = await this.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true
    });
    fs.writeFileSync(filePath, Buffer.from(data, 'base64'));
  }

  async setFile(selector, files) {
    const { root } = await this.send('DOM.getDocument', { depth: -1, pierce: true });
    const { nodeId } = await this.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector
    });
    if (!nodeId) {
      throw new Error(`File input not found: ${selector}`);
    }
    await this.send('DOM.setFileInputFiles', { nodeId, files });
  }

  close() {
    this.ws.close();
  }
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

    await client.navigate(LOGIN_URL);
    await delay(1500);

    await client.evaluate(`
      (function() {
        var username = document.querySelector('#username');
        var password = document.querySelector('#password');
        username.value = ${JSON.stringify(USERNAME)};
        password.value = ${JSON.stringify(PASSWORD)};
        username.dispatchEvent(new Event('input', { bubbles: true }));
        password.dispatchEvent(new Event('input', { bubbles: true }));
        var remember = document.querySelector('#remember_device');
        if (remember) remember.checked = true;
        document.querySelector('.login-form form input[type="submit"], .login-form form button[type="submit"]').click();
      })();
    `);

    await client.once('Page.loadEventFired', null, 45000);
    await delay(3000);

    const loginState = await client.evaluate(`({
      url: location.href,
      hasLoginForm: !!document.querySelector('.login_page .login-form form, .login-page .login-form form'),
      title: document.title,
      hasAdminLink: !!document.querySelector('a[href*="admin-cp"]')
    })`);

    await client.navigate(CREATE_URL);
    await delay(5000);

    const createState = await client.evaluate(`({
      url: location.href,
      title: document.title,
      tinyMajorVersion: window.tinymce ? window.tinymce.majorVersion : null,
      iframeCount: document.querySelectorAll('iframe').length,
      tinyCount: window.tinymce ? window.tinymce.editors.length : 0,
      hasMceContainer: !!document.querySelector('.mce-container, .tox-tinymce'),
      hasToxEditor: !!document.querySelector('.tox-tinymce'),
      textareaDisplay: document.querySelector('#new-article') ? window.getComputedStyle(document.querySelector('#new-article')).display : null,
      hasCreateForm: !!document.querySelector('.submit-new-article-settings'),
      scrollCheck: (function () {
        var root = document.scrollingElement || document.documentElement;
        root.scrollTop = root.scrollHeight;
        var reached = Math.ceil(root.scrollTop + window.innerHeight) >= Math.ceil(root.scrollHeight - 4);
        return {
          scrollTop: root.scrollTop,
          scrollHeight: root.scrollHeight,
          innerHeight: window.innerHeight,
          reachedBottom: reached
        };
      })()
    })`);

    if (!createState.hasCreateForm) {
      throw new Error(`Admin create page inaccessible after login. Landed on ${createState.url}`);
    }

    const createShot = path.join(OUT_DIR, 'admin-create-article-after.png');
    await client.screenshot(createShot, true);

    const tempTitle = `Codex test article ${Date.now()}`;
    await client.evaluate(`
      (function() {
        document.querySelector('input[name="title"]').value = ${JSON.stringify(tempTitle)};
        document.querySelector('textarea[name="description"]').value = 'Article de test pour verifier le rendu du texte enrichi.';
        document.querySelector('input[name="tags"]').value = 'codex,test';
        if (window.jQuery && window.jQuery('#article-tags').data('tagsinput')) {
          window.jQuery('#article-tags').tagsinput('removeAll');
          window.jQuery('#article-tags').tagsinput('add', 'codex');
          window.jQuery('#article-tags').tagsinput('add', 'test');
        }
        if (window.tinymce && window.tinymce.get('new-article')) {
          window.tinymce.get('new-article').setContent(
            '<h2>Titre de test</h2>' +
            '<p><strong>Texte enrichi</strong> avec <em>mise en forme</em>, <a href="https://www.chef-be.fr">lien</a> et image ci-dessous.</p>' +
            '<blockquote>Bloc de citation de verification.</blockquote>' +
            '<table><tbody><tr><th>Colonne</th><th>Valeur</th></tr><tr><td>A</td><td>B</td></tr></tbody></table>' +
            '<pre><code>console.log("chef-be");</code></pre>'
          );
        }
      })();
    `);

    await client.setFile('#article-image', [IMAGE_PATH]);
    await delay(1500);
    await client.evaluate(`document.querySelector('button[name="draft"]').click();`);
    await delay(6000);

    const articleState = await client.evaluate(`({
      url: location.href,
      title: document.title,
      hasReadText: !!document.querySelector('.read-article-text, .full_text_article_custom'),
      hasTable: !!document.querySelector('.read-article-text table, .full_text_article_custom table'),
      hasBlockquote: !!document.querySelector('.read-article-text blockquote, .full_text_article_custom blockquote'),
      hasPre: !!document.querySelector('.read-article-text pre, .full_text_article_custom pre')
    })`);

    const articleShot = path.join(OUT_DIR, 'article-read-output-after.png');
    await client.screenshot(articleShot, true);

    const report = {
      loginState,
      createState,
      articleState,
      screenshots: {
        create: createShot,
        article: articleShot
      }
    };

    fs.writeFileSync(
      path.join(OUT_DIR, 'admin-article-check.json'),
      JSON.stringify(report, null, 2)
    );

    console.log(JSON.stringify(report, null, 2));
    client.close();
  } finally {
    chrome.kill('SIGKILL');
  }
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});
