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
const PROFILE_DIR = '/tmp/codex-chefbe-admin-profile-extended';
const CHROME_PORT = 9224;

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

  async screenshot(filePath) {
    const metrics = await this.send('Page.getLayoutMetrics');
    await this.send('Emulation.setDeviceMetricsOverride', {
      mobile: false,
      width: Math.ceil(metrics.contentSize.width || 1440),
      height: Math.ceil(metrics.contentSize.height || 1200),
      deviceScaleFactor: 1
    });
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
    await this.send('DOM.setFileInputFiles', { nodeId, files });
  }

  close() {
    this.ws.close();
  }
}

async function main() {
  if (!USERNAME || !PASSWORD) {
    throw new Error('Missing credentials');
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
  ], { stdio: 'ignore' });

  try {
    await waitForJson(`http://127.0.0.1:${CHROME_PORT}/json/version`);
    const target = JSON.parse(await httpPutText(`http://127.0.0.1:${CHROME_PORT}/json/new?about:blank`));
    const client = new CDPClient(target.webSocketDebuggerUrl);
    await client.connect();
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('DOM.enable');
    await client.send('Network.enable');

    await client.navigate(LOGIN_URL);
    await delay(1500);
    await client.evaluate(`
      (function () {
        var username = document.querySelector('#username');
        var password = document.querySelector('#password');
        username.value = ${JSON.stringify(USERNAME)};
        password.value = ${JSON.stringify(PASSWORD)};
        username.dispatchEvent(new Event('input', { bubbles: true }));
        password.dispatchEvent(new Event('input', { bubbles: true }));
        document.querySelector('.login-form form input[type="submit"], .login-form form button[type="submit"]').click();
      })();
    `);
    await client.once('Page.loadEventFired', null, 45000);
    await delay(2500);

    await client.navigate(CREATE_URL);
    await delay(5000);

    const tempTitle = `Codex extended article ${Date.now()}`;
    const content = `
      <h2>Validation avancee</h2>
      <p><strong>Texte enrichi</strong> avec lien <a href="https://www.chef-be.fr">Chef-be</a>.</p>
      <p><img src="${BASE_URL}/upload/photos/thumbnail.jpg" alt="thumb" style="float:right;max-width:260px;margin:0 0 16px 16px;"></p>
      <p>Paragraphe d'habillage autour de l'image pour verifier l'alignement a droite.</p>
      <ul>
        <li>Niveau 1
          <ul>
            <li>Niveau 2</li>
            <li>Deuxieme element</li>
          </ul>
        </li>
        <li>Suite</li>
      </ul>
      <blockquote>Bloc de citation pour le controle visuel.</blockquote>
      <div class="video-wrap"><iframe width="560" height="315" src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="embed" frameborder="0" allowfullscreen></iframe></div>
      <p class="MsoNormal" style="margin-bottom:0cm;line-height:normal;background:white"><span style="font-size:12pt;color:#222222">Contenu type Word colle pour verifier l'affichage.</span></p>
      <table><tbody><tr><th>Colonne</th><th>Valeur</th></tr><tr><td>A</td><td>B</td></tr></tbody></table>
      <pre><code>console.log("extended");</code></pre>
    `;

    await client.evaluate(`
      (function () {
        document.querySelector('input[name="title"]').value = ${JSON.stringify(tempTitle)};
        document.querySelector('textarea[name="description"]').value = 'Validation avancee du rendu du texte enrichi.';
        if (window.jQuery && window.jQuery('#article-tags').data('tagsinput')) {
          window.jQuery('#article-tags').tagsinput('removeAll');
          window.jQuery('#article-tags').tagsinput('add', 'validation');
          window.jQuery('#article-tags').tagsinput('add', 'editor');
        } else {
          document.querySelector('input[name="tags"]').value = 'validation,editor';
        }
        window.tinymce.get('new-article').setContent(${JSON.stringify(content)});
      })();
    `);

    await client.setFile('#article-image', [IMAGE_PATH]);
    await delay(1000);
    await client.evaluate(`document.querySelector('button[name="draft"]').click();`);
    await delay(6000);

    const articleState = await client.evaluate(`({
      url: location.href,
      hasFloatImage: !!document.querySelector('.read-article-text img[style*="float"], .full_text_article_custom img[style*="float"]'),
      hasNestedList: !!document.querySelector('.read-article-text ul ul, .full_text_article_custom ul ul'),
      hasIframe: !!document.querySelector('.read-article-text iframe, .full_text_article_custom iframe'),
      hasWordLikeParagraph: !!Array.from(document.querySelectorAll('.read-article-text p, .full_text_article_custom p')).find(function (el) { return el.textContent.indexOf('Contenu type Word colle') !== -1; }),
      hasTable: !!document.querySelector('.read-article-text table, .full_text_article_custom table'),
      hasCode: !!document.querySelector('.read-article-text pre, .full_text_article_custom pre')
    })`);

    const shot = path.join(OUT_DIR, 'article-read-output-extended.png');
    await client.screenshot(shot);

    const report = {
      title: tempTitle,
      articleState,
      screenshot: shot
    };
    fs.writeFileSync(path.join(OUT_DIR, 'admin-article-extended-check.json'), JSON.stringify(report, null, 2));
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
