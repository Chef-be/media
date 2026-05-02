const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const apiPort = Number(process.env.CHEF_LIVE_API_PORT || 8081);
const engineUrl = String(process.env.CHEF_LIVE_ENGINE_URL || 'http://chef-live-engine:9997').replace(/\/$/, '');
const metricsUrl = String(process.env.CHEF_LIVE_METRICS_URL || 'http://chef-live-engine:9998/metrics').replace(/\/$/, '');
const storageRoot = process.env.STORAGE_ROOT || '/var/lib/chef-live';
const registryPath = path.join(storageRoot, 'streams.json');
const settingsPath = path.join(storageRoot, 'config.json');
const engineConfigPath = path.join(storageRoot, 'mediamtx.yml');

const defaultConfig = {
  chef_live_server_name: 'Chef Live',
  chef_live_public_host: process.env.CHEF_LIVE_PUBLIC_HOST || 'localhost',
  chef_live_api_url: process.env.CHEF_LIVE_PUBLIC_API_URL || `http://127.0.0.1:${apiPort}`,
  chef_live_rtmp_url: process.env.CHEF_LIVE_PUBLIC_RTMP_URL || `rtmp://localhost:${process.env.CHEF_LIVE_RTMP_PORT || 1935}/live`,
  chef_live_hls_url: process.env.CHEF_LIVE_PUBLIC_HLS_URL || `http://localhost:${process.env.CHEF_LIVE_HLS_PORT || 8088}/live`,
  chef_live_webrtc_url: process.env.CHEF_LIVE_PUBLIC_WEBRTC_URL || `http://localhost:${process.env.CHEF_LIVE_WEBRTC_PORT || 8889}/live`,
  chef_live_ingest_app: 'live',
  chef_live_playback_app: 'live',
  chef_live_rtmp_enabled: '1',
  chef_live_hls_enabled: '1',
  chef_live_webrtc_enabled: '1',
  chef_live_low_latency: '1',
  chef_live_ll_hls: '1',
  chef_live_recording_enabled: '0',
  chef_live_recording_format: 'mp4',
  chef_live_dvr_enabled: '0',
  chef_live_adaptive_bitrate: '0',
  chef_live_transcoding_enabled: '0',
  chef_live_transcoding_ladder: '1080p:6000\n720p:3000\n480p:1500',
  chef_live_max_bitrate: '6000',
  chef_live_max_viewers: '0',
  chef_live_hls_segment_count: '7',
  chef_live_hls_segment_duration: '2',
  chef_live_monitor_interval: '15',
  chef_live_retention_days: '7',
  chef_live_storage_driver: 'local',
  chef_live_record_path: '/var/lib/chef-live/records',
  chef_live_token_auth: '0',
  chef_live_publish_allow_list: '',
  chef_live_jwt_secret: '',
  chef_live_webhook_url: '',
  chef_live_webhook_secret: '',
  chef_live_metrics_enabled: '1',
  chef_live_log_level: 'info',
  chef_live_stun_servers: 'stun:stun.l.google.com:19302',
  chef_live_turn_server: '',
  chef_live_turn_username: '',
  chef_live_turn_password: '',
  chef_live_webrtc_udp_ports: '10000-10100'
};

app.use(express.json());

function ensureStorageRoot() {
  fs.mkdirSync(storageRoot, { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureStorageRoot();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function readRegistry() {
  return readJson(registryPath, {});
}

function writeRegistry(registry) {
  writeJson(registryPath, registry);
}

function readConfig() {
  return {
    ...defaultConfig,
    ...readJson(settingsPath, {})
  };
}

function normalizeBoolean(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function sanitizeConfig(input) {
  const config = readConfig();

  Object.keys(defaultConfig).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      const value = input[key];
      config[key] = value === null || value === undefined ? '' : String(value);
    }
  });

  return config;
}

function writeConfig(config) {
  writeJson(settingsPath, config);
  writeEngineConfig(config);
}

function buildPlaybackUrl(config, streamName) {
  return `${String(config.chef_live_hls_url || '').replace(/\/$/, '')}/${streamName}/index.m3u8`;
}

function buildWebRtcUrl(config, streamName) {
  return `${String(config.chef_live_webrtc_url || '').replace(/\/$/, '')}/${streamName}`;
}

function buildPublishUrl(config) {
  return String(config.chef_live_rtmp_url || '').replace(/\/$/, '');
}

function parseCsvList(rawValue) {
  return String(rawValue || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseStunServers(rawValue) {
  return String(rawValue || '')
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function mapRecordFormat(format) {
  return String(format || '').toLowerCase() === 'ts' ? 'mpegts' : 'fmp4';
}

function buildIceServers(config) {
  const servers = [];
  parseStunServers(config.chef_live_stun_servers).forEach((server) => {
    servers.push({ url: server });
  });

  if (String(config.chef_live_turn_server || '').trim()) {
    servers.push({
      url: String(config.chef_live_turn_server).trim(),
      username: String(config.chef_live_turn_username || '').trim(),
      password: String(config.chef_live_turn_password || '').trim()
    });
  }

  return servers;
}

function yamlScalar(value) {
  if (typeof value === 'boolean') {
    return value ? 'yes' : 'no';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  const stringValue = String(value === undefined || value === null ? '' : value);
  return `'${stringValue.replace(/'/g, "''")}'`;
}

function yamlArray(values) {
  return `[${values.map((value) => yamlScalar(value)).join(', ')}]`;
}

function yamlIceServers(config) {
  const servers = buildIceServers(config);
  if (!servers.length) {
    return '';
  }

  const lines = ['webrtcICEServers2:'];
  servers.forEach((server) => {
    lines.push(`  - url: ${yamlScalar(server.url)}`);
    if (server.username) {
      lines.push(`    username: ${yamlScalar(server.username)}`);
    }
    if (server.password) {
      lines.push(`    password: ${yamlScalar(server.password)}`);
    }
  });
  return lines.join('\n');
}

function buildWebRtcAdditionalHosts(config) {
  const hosts = [];
  const publicHost = String(config.chef_live_public_host || '').trim();
  if (publicHost) {
    hosts.push(publicHost);
  }

  const webRtcUrl = String(config.chef_live_webrtc_url || '').trim();
  if (webRtcUrl) {
    try {
      const parsed = new URL(webRtcUrl);
      if (parsed.hostname) {
        hosts.push(parsed.hostname.trim());
      }
    } catch (_error) {
      // Ignore invalid URLs and fall back to the explicit public host.
    }
  }

  return [...new Set(hosts.filter(Boolean))];
}

function buildAuthSection(config) {
  const publishAllowList = parseCsvList(config.chef_live_publish_allow_list);
  const tokenAuthEnabled = normalizeBoolean(config.chef_live_token_auth);
  if (!tokenAuthEnabled && publishAllowList.length === 0) {
    return [
      'authMethod: internal',
      'authInternalUsers:',
      '  - user: any',
      "    pass:",
      '    permissions:',
      '      - action: api',
      '      - action: metrics',
      '      - action: pprof',
      '      - action: publish',
      "        path: '~^.*$'",
      '      - action: read',
      "        path: '~^.*$'"
    ].join('\n');
  }

  return [
    'authMethod: http',
    `authHTTPAddress: ${yamlScalar(`http://chef-live:${apiPort}/auth/mediamtx`)}`,
    'authHTTPExclude:',
    '  - action: api',
    '  - action: metrics',
    '  - action: pprof',
    'authInternalUsers:',
    '  - user: any',
    "    pass:",
    '    permissions:',
    '      - action: api',
    '      - action: metrics',
    '      - action: pprof'
  ].join('\n');
}

function buildPathDefaults(config) {
  const lines = [
    'pathDefaults:',
    '  source: publisher',
    `  maxReaders: ${Number(config.chef_live_max_viewers || 0) || 0}`,
    '  overridePublisher: true',
    `  record: ${normalizeBoolean(config.chef_live_recording_enabled) ? 'yes' : 'no'}`,
    `  recordPath: ${yamlScalar(String(config.chef_live_record_path || '/var/lib/chef-live/records') + '/%path/%Y-%m-%d_%H-%M-%S-%f')}`,
    `  recordFormat: ${yamlScalar(mapRecordFormat(config.chef_live_recording_format))}`,
    '  recordPartDuration: 1s',
    '  recordSegmentDuration: 1h',
    `  recordDeleteAfter: ${Number(config.chef_live_retention_days || 0) > 0 ? `${Number(config.chef_live_retention_days)}d` : '0s'}`
  ];

  if (String(config.chef_live_webhook_url || '').trim()) {
    lines.push(`  runOnReady: ${yamlScalar(`wget -qO- --header='X-Chef-Live-Event: ready' --header='X-Chef-Live-Secret: ${String(config.chef_live_webhook_secret || '').replace(/'/g, '')}' --post-data='' '${String(config.chef_live_webhook_url).replace(/'/g, '')}' >/dev/null 2>&1 || true`)}`);
    lines.push('  runOnReadyRestart: false');
    lines.push(`  runOnNotReady: ${yamlScalar(`wget -qO- --header='X-Chef-Live-Event: stopped' --header='X-Chef-Live-Secret: ${String(config.chef_live_webhook_secret || '').replace(/'/g, '')}' --post-data='' '${String(config.chef_live_webhook_url).replace(/'/g, '')}' >/dev/null 2>&1 || true`)}`);
  }

  return lines.join('\n');
}

function generateMediaMtxConfig(config) {
  const iceServersBlock = yamlIceServers(config);
  const additionalHosts = buildWebRtcAdditionalHosts(config);
  const hlsVariant = normalizeBoolean(config.chef_live_ll_hls) ? 'lowLatency' : 'fmp4';
  const partsDuration = normalizeBoolean(config.chef_live_low_latency) ? '200ms' : '1s';

  return [
    `logLevel: ${yamlScalar(String(config.chef_live_log_level || 'info').toLowerCase())}`,
    'logDestinations: [stdout]',
    '',
    buildAuthSection(config),
    '',
    'api: yes',
    "apiAddress: ':9997'",
    `metrics: ${normalizeBoolean(config.chef_live_metrics_enabled) ? 'yes' : 'no'}`,
    "metricsAddress: ':9998'",
    '',
    `rtmp: ${normalizeBoolean(config.chef_live_rtmp_enabled) ? 'yes' : 'no'}`,
    "rtmpAddress: ':1935'",
    '',
    `hls: ${normalizeBoolean(config.chef_live_hls_enabled) ? 'yes' : 'no'}`,
    "hlsAddress: ':8888'",
    'hlsAlwaysRemux: yes',
    `hlsVariant: ${yamlScalar(hlsVariant)}`,
    `hlsSegmentCount: ${Number(config.chef_live_hls_segment_count || 6) || 6}`,
    `hlsSegmentDuration: ${Number(config.chef_live_hls_segment_duration || 2) || 2}s`,
    `hlsPartDuration: ${yamlScalar(partsDuration)}`,
    `hlsDirectory: ${normalizeBoolean(config.chef_live_dvr_enabled) ? yamlScalar('/var/lib/chef-live/hls') : "''"}`,
    '',
    `webrtc: ${normalizeBoolean(config.chef_live_webrtc_enabled) ? 'yes' : 'no'}`,
    "webrtcAddress: ':8889'",
    "webrtcLocalUDPAddress: ':10000'",
    "webrtcLocalTCPAddress: ':10000'",
    `webrtcAdditionalHosts: ${yamlArray(additionalHosts)}`,
    iceServersBlock,
    '',
    buildPathDefaults(config),
    '',
    'paths:',
    '  all_others: {}'
  ].filter(Boolean).join('\n') + '\n';
}

function writeEngineConfig(config) {
  ensureStorageRoot();
  fs.writeFileSync(engineConfigPath, generateMediaMtxConfig(config));
}

function getConfigSummary(config) {
  return {
    chef_live_server_name: config.chef_live_server_name,
    chef_live_public_host: config.chef_live_public_host,
    chef_live_rtmp_url: config.chef_live_rtmp_url,
    chef_live_hls_url: config.chef_live_hls_url,
    chef_live_webrtc_url: config.chef_live_webrtc_url,
    chef_live_recording_enabled: config.chef_live_recording_enabled,
    chef_live_transcoding_enabled: config.chef_live_transcoding_enabled,
    chef_live_log_level: config.chef_live_log_level
  };
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    let payload = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch (_error) {
      payload = { raw: text };
    }
    return {
      ok: response.ok,
      status: response.status,
      data: payload
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    return {
      ok: response.ok,
      status: response.status,
      data: await response.text()
    };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeListPayload(payload) {
  if (!payload) {
    return [];
  }
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload.items)) {
    return payload.items;
  }
  if (payload.items && typeof payload.items === 'object') {
    return Object.keys(payload.items).map((key) => ({
      name: key,
      ...payload.items[key]
    }));
  }
  return [];
}

async function getRuntimeState() {
  const config = readConfig();
  const registry = readRegistry();
  const runtime = {
    service_ok: true,
    engine_api_ok: false,
    metrics_ok: false,
    summary: {
      registered_streams: Object.keys(registry).length,
      active_paths: 0,
      ready_paths: 0,
      recording_enabled: normalizeBoolean(config.chef_live_recording_enabled),
      transcoding_enabled: normalizeBoolean(config.chef_live_transcoding_enabled),
      metrics_enabled: normalizeBoolean(config.chef_live_metrics_enabled)
    },
    paths: [],
    metrics: {},
    config: getConfigSummary(config)
  };

  try {
    const pathsResponse = await fetchJson(`${engineUrl}/v3/paths/list`);
    if (pathsResponse.ok) {
      runtime.engine_api_ok = true;
      runtime.paths = normalizeListPayload(pathsResponse.data).map((item) => ({
        name: item.name || item.path || '',
        ready: !!item.ready,
        readers: Number(item.readers || item.readersCount || 0) || 0,
        source: item.source ? String(item.source).replace(/^sourceRedirect /, '') : '',
        bytesReceived: Number(item.bytesReceived || 0) || 0
      }));
      runtime.summary.active_paths = runtime.paths.length;
      runtime.summary.ready_paths = runtime.paths.filter((item) => item.ready).length;
    }
  } catch (_error) {
    runtime.engine_api_ok = false;
  }

  if (normalizeBoolean(config.chef_live_metrics_enabled)) {
    try {
      const metricsResponse = await fetchText(metricsUrl);
      if (metricsResponse.ok) {
        runtime.metrics_ok = true;
        const metrics = {};
        metricsResponse.data.split('\n').forEach((line) => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) {
            return;
          }
          const parts = trimmed.split(/\s+/);
          if (parts.length >= 2) {
            metrics[parts[0]] = parts[parts.length - 1];
          }
        });
        runtime.metrics = metrics;
      }
    } catch (_error) {
      runtime.metrics_ok = false;
    }
  }

  return runtime;
}

function ipToLong(ip) {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
    return null;
  }
  return ip.split('.').reduce((acc, octet) => {
    const value = Number(octet);
    if (value < 0 || value > 255) {
      return null;
    }
    return acc === null ? null : ((acc << 8) >>> 0) + value;
  }, 0);
}

function isIpAllowed(ip, allowList) {
  if (!allowList.length) {
    return true;
  }

  const ipLong = ipToLong(ip);

  return allowList.some((entry) => {
    if (entry === ip) {
      return true;
    }
    if (!entry.includes('/')) {
      return false;
    }
    const [rangeIp, bitsRaw] = entry.split('/');
    const rangeLong = ipToLong(rangeIp);
    const bits = Number(bitsRaw);
    if (ipLong === null || rangeLong === null || Number.isNaN(bits) || bits < 0 || bits > 32) {
      return false;
    }
    const mask = bits === 0 ? 0 : ((0xffffffff << (32 - bits)) >>> 0);
    return (ipLong & mask) === (rangeLong & mask);
  });
}

function extractToken(payload) {
  if (payload.token) {
    return String(payload.token).trim();
  }
  if (payload.password) {
    return String(payload.password).trim();
  }
  if (payload.query) {
    const params = new URLSearchParams(String(payload.query));
    return (params.get('token') || params.get('jwt') || '').trim();
  }
  return '';
}

function normalizeStreamPath(pathValue, appName = 'live') {
  let normalized = String(pathValue || '').trim();
  if (!normalized) {
    return '';
  }

  normalized = normalized.replace(/^\/+|\/+$/g, '');

  if (normalized.indexOf(appName + '/') === 0) {
    normalized = normalized.substring(appName.length + 1);
  }

  normalized = normalized.replace(/\/(publish|whip|whep)$/i, '');
  return normalized.replace(/^\/+|\/+$/g, '');
}

function isStudioTokenValid(payload, config, registry) {
  const providedToken = extractToken(payload);
  if (!providedToken) {
    return false;
  }

  const streamName = normalizeStreamPath(payload.path, config.chef_live_ingest_app || 'live');
  if (!streamName || !registry[streamName] || !registry[streamName].browser_token) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(String(registry[streamName].browser_token)),
    Buffer.from(providedToken)
  );
}

app.post('/auth/mediamtx', (req, res) => {
  const config = readConfig();
  const registry = readRegistry();
  const payload = req.body || {};
  const action = String(payload.action || '').trim();
  const ip = String(payload.ip || '').trim();
  const hasValidStudioToken = isStudioTokenValid(payload, config, registry);

  if (hasValidStudioToken) {
    res.status(204).end();
    return;
  }

  if (action === 'publish') {
    const allowList = parseCsvList(config.chef_live_publish_allow_list);
    if (!isIpAllowed(ip, allowList)) {
      res.status(403).json({ ok: false, error: 'IP non autorisée pour publier.' });
      return;
    }
  }

  if (normalizeBoolean(config.chef_live_token_auth)) {
    const expectedToken = String(config.chef_live_jwt_secret || '').trim();
    const providedToken = extractToken(payload);
    if (!expectedToken || providedToken !== expectedToken) {
      res.status(403).json({ ok: false, error: 'Jeton Chef Live invalide.' });
      return;
    }
  }

  res.status(204).end();
});

app.get('/health', async (_req, res) => {
  const config = readConfig();
  const runtime = await getRuntimeState();
  res.json({
    ok: true,
    service: 'chef-live',
    version: '0.3.0',
    apiPort,
    engineUrl,
    rtmpPort: Number(process.env.CHEF_LIVE_RTMP_PORT || 1935),
    hlsPort: Number(process.env.CHEF_LIVE_HLS_PORT || 8088),
    webrtcPort: Number(process.env.CHEF_LIVE_WEBRTC_PORT || 8889),
    config: getConfigSummary(config),
    runtime: runtime.summary,
    engine_api_ok: runtime.engine_api_ok,
    metrics_ok: runtime.metrics_ok
  });
});

app.get('/config', (_req, res) => {
  res.json({
    ok: true,
    config: readConfig()
  });
});

app.put('/config', (req, res) => {
  const config = sanitizeConfig(req.body || {});
  writeConfig(config);
  res.json({
    ok: true,
    config
  });
});

app.get('/runtime', async (_req, res) => {
  res.json({
    ok: true,
    runtime: await getRuntimeState()
  });
});

app.get('/streams', (_req, res) => {
  res.json({
    ok: true,
    streams: readRegistry()
  });
});

app.post('/streams', (req, res) => {
  const streamName = String(req.body.stream_name || '').trim();
  if (!streamName) {
    res.status(400).json({ ok: false, error: 'stream_name is required' });
    return;
  }

  const config = readConfig();
  const registry = readRegistry();
  const stream = {
    stream_name: streamName,
    title: String(req.body.title || '').trim(),
    user_id: Number(req.body.user_id || 0),
    post_id: Number(req.body.post_id || 0),
    stream_key: streamName,
    browser_token: crypto.randomBytes(24).toString('hex'),
    publish_url: buildPublishUrl(config),
    playback_url: buildPlaybackUrl(config, streamName),
    webrtc_url: buildWebRtcUrl(config, streamName),
    provider: 'chef_live',
    created_at: new Date().toISOString()
  };

  registry[streamName] = stream;
  writeRegistry(registry);

  res.json({
    ok: true,
    ...stream
  });
});

app.delete('/streams/:streamName', (req, res) => {
  const registry = readRegistry();
  delete registry[req.params.streamName];
  writeRegistry(registry);
  res.json({
    ok: true,
    stream_name: req.params.streamName
  });
});

ensureStorageRoot();
writeEngineConfig(readConfig());

app.listen(apiPort, '0.0.0.0', () => {
  console.log(`chef-live bootstrap listening on ${apiPort}`);
});
