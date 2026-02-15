const DEFAULT_SETTINGS = {
  backendBaseUrl: 'http://127.0.0.1:8000',
  ingestToken: 'dev-ingest-token',
  autoCapture: false,
};

const backendEl = document.getElementById('backendBaseUrl');
const tokenEl = document.getElementById('ingestToken');
const autoCaptureEl = document.getElementById('autoCapture');
const saveButton = document.getElementById('saveButton');
const statusEl = document.getElementById('status');

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#c81e1e' : '#4b5563';
}

async function loadSettings() {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  backendEl.value = settings.backendBaseUrl || DEFAULT_SETTINGS.backendBaseUrl;
  tokenEl.value = settings.ingestToken || DEFAULT_SETTINGS.ingestToken;
  autoCaptureEl.checked = Boolean(settings.autoCapture);
}

async function saveSettings() {
  const payload = {
    backendBaseUrl: backendEl.value.trim() || DEFAULT_SETTINGS.backendBaseUrl,
    ingestToken: tokenEl.value.trim() || DEFAULT_SETTINGS.ingestToken,
    autoCapture: Boolean(autoCaptureEl.checked),
  };
  await chrome.storage.sync.set(payload);
  setStatus('保存成功');
}

saveButton.addEventListener('click', () => {
  saveSettings().catch((error) => setStatus(`保存失败: ${error.message}`, true));
});

loadSettings().catch((error) => setStatus(`加载失败: ${error.message}`, true));
