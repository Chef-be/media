<?php
$stream_name = '';
if (!empty($_GET['stream'])) {
    $stream_name = preg_replace('/[^a-zA-Z0-9_\-]/', '', $_GET['stream']);
}
$token = '';
if (!empty($_GET['token'])) {
    $token = preg_replace('/[^a-zA-Z0-9_\-]/', '', $_GET['token']);
}
$query = http_build_query(array_filter(array(
    'token' => $token
)));
$whip_url = '/chef-live-webrtc/' . rawurlencode($stream_name) . '/whip' . (!empty($query) ? ('?' . $query) : '');
$publisher_js_url = '/chef-live-webrtc/' . rawurlencode($stream_name) . '/publisher.js';
?><!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Chef Live Publisher</title>
<style>
html, body {
  margin: 0;
  padding: 0;
  height: 100%;
  background: #111;
  color: #fff;
  font-family: Arial, sans-serif;
}
#video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  background: #1e1e1e;
}
#controls {
  display: flex;
  min-height: 100%;
  width: 100%;
  box-sizing: border-box;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: #1e1e1e;
}
#panel {
  width: min(100%, 540px);
}
.item {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 16px;
  align-items: center;
  margin: 12px 0;
}
label {
  font-size: 14px;
}
select, input[type="text"] {
  appearance: none;
  width: 100%;
  height: 42px;
  box-sizing: border-box;
  background: #181818;
  color: #fff;
  border: 1px solid #555;
  border-radius: 6px;
  padding: 0 10px;
}
select option {
  color: #000;
}
#audio-voice {
  justify-self: start;
}
#publish-button {
  margin-top: 18px;
  width: 100%;
  height: 48px;
  border: 0;
  border-radius: 8px;
  background: #f5f5f5;
  color: #111;
  font-size: 16px;
  font-weight: 700;
}
#publish-button[disabled] {
  opacity: 0.65;
}
#message {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  padding: 14px 18px;
  box-sizing: border-box;
  text-align: center;
  font-size: 14px;
  font-weight: 700;
  text-shadow: 0 0 5px rgba(0,0,0,0.6);
  pointer-events: none;
}
@media (max-width: 640px) {
  .item {
    grid-template-columns: 1fr;
    gap: 8px;
  }
}
</style>
<script defer src="<?php echo htmlspecialchars($publisher_js_url, ENT_QUOTES, 'UTF-8'); ?>"></script>
</head>
<body>
<video id="video" muted autoplay playsinline></video>

<div id="controls">
  <div id="panel">
    <div class="item">
      <label for="video-device">video device</label>
      <select id="video-device">
        <option value="none">none</option>
      </select>
    </div>
    <div class="item">
      <label for="video-codec">video codec</label>
      <select id="video-codec"></select>
    </div>
    <div class="item">
      <label for="video-bitrate">video bitrate (kbps)</label>
      <input id="video-bitrate" type="text" value="6000">
    </div>
    <div class="item">
      <label for="video-framerate">video framerate (ideal)</label>
      <input id="video-framerate" type="text" value="30">
    </div>
    <div class="item">
      <label for="video-width">video width (ideal)</label>
      <input id="video-width" type="text" value="1280">
    </div>
    <div class="item">
      <label for="video-height">video height (ideal)</label>
      <input id="video-height" type="text" value="720">
    </div>
    <div class="item">
      <label for="audio-device">audio device</label>
      <select id="audio-device">
        <option value="none">none</option>
      </select>
    </div>
    <div class="item">
      <label for="audio-codec">audio codec</label>
      <select id="audio-codec"></select>
    </div>
    <div class="item">
      <label for="audio-bitrate">audio bitrate (kbps)</label>
      <input id="audio-bitrate" type="text" value="128">
    </div>
    <div class="item">
      <label for="audio-voice">optimize for voice</label>
      <input id="audio-voice" type="checkbox">
    </div>
    <button id="publish-button" type="button">publish</button>
  </div>
</div>

<div id="message"></div>

<script>
const whipUrl = <?php echo json_encode($whip_url); ?>;
const video = document.getElementById('video');
const controls = document.getElementById('controls');
const message = document.getElementById('message');
const publishButton = document.getElementById('publish-button');
let publisher = null;
let localStream = null;
let publishAttemptInFlight = false;
const openerOrigin = window.location.origin;

const videoForm = {
  device: document.getElementById('video-device'),
  codec: document.getElementById('video-codec'),
  bitrate: document.getElementById('video-bitrate'),
  framerate: document.getElementById('video-framerate'),
  width: document.getElementById('video-width'),
  height: document.getElementById('video-height')
};

const audioForm = {
  device: document.getElementById('audio-device'),
  codec: document.getElementById('audio-codec'),
  bitrate: document.getElementById('audio-bitrate'),
  voice: document.getElementById('audio-voice')
};

const setMessage = (str) => {
  message.innerText = str || '';
};

const getPreferredVideoCodec = () => {
  const ua = (navigator.userAgent || '').toLowerCase();
  if (ua.includes('firefox')) {
    return 'vp8/90000';
  }
  return 'h264/90000';
};

const notifyParentWindow = (state, extra) => {
  if (!window.opener || window.opener.closed) {
    return;
  }
  try {
    window.opener.postMessage(Object.assign({
      type: 'chef-live-studio-state',
      state: state,
      stream: new URLSearchParams(window.location.search).get('stream') || ''
    }, extra || {}), openerOrigin);
  } catch (_error) {}
};

const withTimeout = (promise, timeoutMs, timeoutLabel) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => {
        reject(new Error(timeoutLabel || 'timeout'));
      }, timeoutMs);
    })
  ]);
};

const releaseLocalStream = () => {
  if (localStream) {
    try {
      for (const track of localStream.getTracks()) {
        track.stop();
      }
    } catch (_error) {}
  }
  localStream = null;
  if (video.srcObject) {
    try {
      const current = video.srcObject;
      if (current && typeof current.getTracks === 'function') {
        for (const track of current.getTracks()) {
          track.stop();
        }
      }
    } catch (_error) {}
  }
  video.srcObject = null;
};

const addOptionIfMissing = (select, value, label) => {
  for (const opt of select.querySelectorAll('option')) {
    if (opt.value === value) {
      return;
    }
  }
  const opt = document.createElement('option');
  opt.value = value;
  opt.text = label;
  select.appendChild(opt);
};

const loadValuesFromQuery = () => {
  const params = new URLSearchParams(window.location.search);
  const inputs = [...Object.values(videoForm), ...Object.values(audioForm)];
  for (const input of inputs) {
    const value = params.get(input.id);
    if (!value) {
      continue;
    }
    if (input instanceof HTMLInputElement && input.type === 'text') {
      input.value = value;
    } else if (input instanceof HTMLInputElement && input.type === 'checkbox') {
      input.checked = value === 'true';
    } else if (input instanceof HTMLSelectElement) {
      input.value = value;
    }
  }
};

const setupEventListeners = () => {
  const url = new URL(window.location.href);
  const inputs = [...Object.values(videoForm), ...Object.values(audioForm)];
  for (const input of inputs) {
    input.addEventListener('input', () => {
      if (input instanceof HTMLInputElement && input.type === 'checkbox') {
        url.searchParams.set(input.id, input.checked ? 'true' : 'false');
      } else {
        url.searchParams.set(input.id, input.value);
      }
      window.history.replaceState(null, '', url);
    });
  }
};

const populateCodecs = () => {
  const tempPC = new RTCPeerConnection({});
  tempPC.addTransceiver('video', { direction: 'sendonly' });
  tempPC.addTransceiver('audio', { direction: 'sendonly' });

  return tempPC.createOffer().then((desc) => {
    const sdp = (desc.sdp || '').toLowerCase();

    for (const codec of ['av1/90000', 'vp9/90000', 'vp8/90000', 'h264/90000', 'h265/90000']) {
      if (sdp.includes(codec)) {
        addOptionIfMissing(videoForm.codec, codec, codec.split('/')[0].toUpperCase());
      }
    }

    for (const codec of ['opus/48000', 'g722/8000', 'pcmu/8000', 'pcma/8000']) {
      if (sdp.includes(codec)) {
        addOptionIfMissing(audioForm.codec, codec, codec.split('/')[0].toUpperCase());
      }
    }

    tempPC.close();
  }).catch(() => {
    addOptionIfMissing(videoForm.codec, 'h264/90000', 'H264');
    addOptionIfMissing(videoForm.codec, 'vp8/90000', 'VP8');
    addOptionIfMissing(audioForm.codec, 'opus/48000', 'OPUS');
  });
};

const labelForDevice = (device, index) => {
  if (device.label) {
    return device.label;
  }
  if (device.kind === 'videoinput') {
    return 'camera ' + (index + 1);
  }
  if (device.kind === 'audioinput') {
    return 'microphone ' + (index + 1);
  }
  return 'device ' + (index + 1);
};

const populateDevices = () => {
  return navigator.mediaDevices.enumerateDevices().then((devices) => {
    let videoIndex = 0;
    let audioIndex = 0;

    for (const device of devices) {
      if (device.kind === 'videoinput') {
        addOptionIfMissing(videoForm.device, device.deviceId, labelForDevice(device, videoIndex));
        videoIndex += 1;
      } else if (device.kind === 'audioinput') {
        addOptionIfMissing(audioForm.device, device.deviceId, labelForDevice(device, audioIndex));
        audioIndex += 1;
      }
    }

    if (navigator.mediaDevices.getDisplayMedia !== undefined) {
      addOptionIfMissing(videoForm.device, 'screen', 'screen');
    }

    if (videoForm.device.options.length > 1 && videoForm.device.value === 'none') {
      videoForm.device.selectedIndex = 1;
    }
    if (audioForm.device.options.length > 1 && audioForm.device.value === 'none') {
      audioForm.device.selectedIndex = 1;
    }
  });
};

const buildMediaConstraints = () => {
  const videoId = videoForm.device.value;
  const audioId = audioForm.device.value;
  const canProbeGenericVideo = videoForm.device.options.length <= 1;
  const canProbeGenericAudio = audioForm.device.options.length <= 1;

  if (videoId === 'screen') {
    return {
      mode: 'screen',
      constraints: {
        video: {
          width: { ideal: parseInt(videoForm.width.value, 10) || 1280 },
          height: { ideal: parseInt(videoForm.height.value, 10) || 720 },
          frameRate: { ideal: parseInt(videoForm.framerate.value, 10) || 30 },
          cursor: 'always'
        },
        audio: audioId !== 'none'
      }
    };
  }

  let videoOpts = false;
  if (videoId !== 'none') {
    videoOpts = {
      deviceId: videoId ? { ideal: videoId } : undefined,
      width: { ideal: parseInt(videoForm.width.value, 10) || 1280 },
      height: { ideal: parseInt(videoForm.height.value, 10) || 720 },
      frameRate: { ideal: parseInt(videoForm.framerate.value, 10) || 30 }
    };
  } else if (canProbeGenericVideo) {
    videoOpts = {
      width: { ideal: parseInt(videoForm.width.value, 10) || 1280 },
      height: { ideal: parseInt(videoForm.height.value, 10) || 720 },
      frameRate: { ideal: parseInt(videoForm.framerate.value, 10) || 30 }
    };
  }

  let audioOpts = false;
  if (audioId !== 'none') {
    audioOpts = {
      deviceId: audioId ? { ideal: audioId } : undefined
    };
    if (!audioForm.voice.checked) {
      audioOpts.autoGainControl = false;
      audioOpts.echoCancellation = false;
      audioOpts.noiseSuppression = false;
    }
  } else if (canProbeGenericAudio) {
    audioOpts = {};
    if (!audioForm.voice.checked) {
      audioOpts.autoGainControl = false;
      audioOpts.echoCancellation = false;
      audioOpts.noiseSuppression = false;
    }
  }

  return {
    mode: 'camera',
    constraints: {
      video: videoOpts,
      audio: audioOpts
    }
  };
};

const onStream = (stream) => {
  localStream = stream;
  video.srcObject = stream;
  notifyParentWindow('media-opened');
  try {
    if (typeof window.MediaMTXWebRTCPublisher !== 'function') {
      throw new Error("Le module de publication WebRTC n'est pas disponible.");
    }
    publisher = new MediaMTXWebRTCPublisher({
      url: new URL(whipUrl, window.location.origin).toString(),
      stream,
      videoCodec: videoForm.codec.value || 'h264/90000',
      videoBitrate: videoForm.bitrate.value || '6000',
      audioCodec: audioForm.codec.value || 'opus/48000',
      audioBitrate: audioForm.bitrate.value || '128',
      audioVoice: audioForm.voice.checked,
      onError: (err) => {
        releaseLocalStream();
        setMessage(err);
        notifyParentWindow('error', { error: String(err || '') });
        publishButton.disabled = false;
        publishButton.innerText = 'publish';
        controls.style.display = 'flex';
        publishAttemptInFlight = false;
      },
      onConnected: () => {
        setMessage('');
        notifyParentWindow('publishing');
        publishAttemptInFlight = false;
      }
    });
  } catch (err) {
    releaseLocalStream();
    setMessage(err && err.message ? err.message : String(err || 'Erreur de publication.'));
    notifyParentWindow('error', { error: String(err || '') });
    publishButton.disabled = false;
    publishButton.innerText = 'publish';
    controls.style.display = 'flex';
    publishAttemptInFlight = false;
  }
};

const explainMediaError = (err) => {
  const name = err && err.name ? err.name : '';
  if (name === 'AbortError') {
    return "Demarrage camera interrompu. Fermez les autres applications ou onglets qui utilisent la camera, puis reessayez.";
  }
  if (name === 'NotReadableError') {
    return "La camera ou le micro est deja utilise par une autre application.";
  }
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return "L'acces camera/micro a ete refuse par le navigateur.";
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return "Aucune camera ou aucun micro disponible n'a ete trouve.";
  }
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return "Le navigateur n'a pas pu ouvrir le peripherique avec ces reglages. Reessayez.";
  }
  return (err && err.toString ? err.toString() : 'Erreur inconnue');
};

const requestMediaStream = async (constraints) => {
  try {
    return await ((constraints.mode === 'screen')
      ? navigator.mediaDevices.getDisplayMedia(constraints.constraints)
      : navigator.mediaDevices.getUserMedia(constraints.constraints));
  } catch (err) {
    const shouldRetryWithBasicConstraints =
      constraints.mode === 'camera' &&
      err &&
      (err.name === 'AbortError' || err.name === 'OverconstrainedError' || err.name === 'ConstraintNotSatisfiedError');

    if (!shouldRetryWithBasicConstraints) {
      throw err;
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
    return navigator.mediaDevices.getUserMedia({
      video: constraints.constraints.video !== false,
      audio: constraints.constraints.audio !== false
    });
  }
};

const onPublish = () => {
  if (publishAttemptInFlight) {
    return;
  }
  if (publisher !== null) {
    publisher.close();
    publisher = null;
  }
  releaseLocalStream();

  const built = buildMediaConstraints();
  if (built.mode !== 'screen' && built.constraints.video === false && built.constraints.audio === false) {
    setMessage('select at least one device');
    return;
  }

  publishAttemptInFlight = true;
  publishButton.disabled = true;
  publishButton.innerText = 'connecting...';
  controls.style.display = 'none';
  video.style.display = 'block';
  setMessage('connecting');

  requestMediaStream(built).then((stream) => {
    publishButton.innerText = 'publish';
    onStream(stream);
  }).catch((err) => {
    releaseLocalStream();
    setMessage(explainMediaError(err));
    notifyParentWindow('error', { error: explainMediaError(err) });
    publishButton.disabled = false;
    publishButton.innerText = 'publish';
    controls.style.display = 'flex';
    video.style.display = 'none';
    publishAttemptInFlight = false;
  });
};

const init = () => {
  if (navigator.mediaDevices === undefined) {
    setMessage("can't access webcams or microphones. Make sure that WebRTC encryption is enabled.");
    return;
  }

  setMessage('loading devices');
  Promise.allSettled([
    withTimeout(populateDevices(), 5000, 'device-enumeration-timeout'),
    withTimeout(populateCodecs(), 5000, 'codec-detection-timeout')
  ]).finally(() => {
    const preferredVideoCodec = getPreferredVideoCodec();
    if (videoForm.codec.options.length === 0) {
      addOptionIfMissing(videoForm.codec, 'h264/90000', 'H264');
      addOptionIfMissing(videoForm.codec, 'vp8/90000', 'VP8');
    }
    if (audioForm.codec.options.length === 0) {
      addOptionIfMissing(audioForm.codec, 'opus/48000', 'OPUS');
    }
    if (videoForm.codec.options.length > 0) {
      const hasPreferredVideoCodec = Array.from(videoForm.codec.options).some((option) => option.value === preferredVideoCodec);
      if (hasPreferredVideoCodec) {
        videoForm.codec.value = preferredVideoCodec;
      } else if (!videoForm.codec.value) {
        videoForm.codec.selectedIndex = 0;
      }
    }
    loadValuesFromQuery();
    setupEventListeners();
    if (videoForm.device.options.length <= 1 && audioForm.device.options.length <= 1) {
      setMessage("Detection auto des peripheriques incomplete. Vous pouvez quand meme cliquer sur publish: le navigateur tentera d'ouvrir camera et micro par defaut.");
      notifyParentWindow('ready', { degraded: true });
    } else {
      setMessage('');
      notifyParentWindow('ready');
    }
    video.style.display = 'none';
    controls.style.display = 'flex';
  });
};

window.addEventListener('load', () => {
  publishButton.addEventListener('click', onPublish);
  init();
});

window.addEventListener('beforeunload', () => {
  notifyParentWindow('closed');
  if (publisher !== null) {
    publisher.close();
  }
  releaseLocalStream();
});
</script>
</body>
</html>
