const DEFAULT_SETTINGS = {
  backendBaseUrl: 'http://127.0.0.1:8000',
  ingestToken: 'dev-ingest-token',
};

const pageEl = document.getElementById('currentPage');
const contentEl = document.getElementById('content');
const statusEl = document.getElementById('status');
const captureButton = document.getElementById('captureButton');
const openOptionsButton = document.getElementById('openOptions');

let activeTab = null;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#c81e1e' : '#4b5563';
}

async function getSettings() {
  const result = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return {
    backendBaseUrl: String(result.backendBaseUrl || DEFAULT_SETTINGS.backendBaseUrl),
    ingestToken: String(result.ingestToken || DEFAULT_SETTINGS.ingestToken),
  };
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function initialize() {
  activeTab = await getActiveTab();
  if (!activeTab || !activeTab.url) {
    pageEl.textContent = '未找到当前页面';
    captureButton.disabled = true;
    return;
  }

  pageEl.textContent = activeTab.title
    ? `${activeTab.title}\n${activeTab.url}`
    : activeTab.url;

  contentEl.value = activeTab.title || activeTab.url;
}

async function capturePage() {
  if (!activeTab || !activeTab.url) {
    setStatus('未找到当前页面', true);
    return;
  }

  setStatus('发送中...');
  captureButton.disabled = true;

  try {
    const settings = await getSettings();
    const endpoint = `${settings.backendBaseUrl.replace(/\/$/, '')}/api/v1/ingest/browser`;
    const payload = {
      event_type: 'article',
      title: activeTab.title || null,
      content: contentEl.value || activeTab.title || activeTab.url,
      url: activeTab.url,
      metadata: {
        via: 'popup',
      },
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-INGEST-TOKEN': settings.ingestToken,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${response.status} ${text}`);
    }

    const data = await response.json();
    setStatus(`已采集，事件 ID: ${data.id}`);
  } catch (error) {
    setStatus(`采集失败: ${error.message}`, true);
  } finally {
    captureButton.disabled = false;
  }
}

captureButton.addEventListener('click', () => {
  capturePage().catch((error) => {
    setStatus(`采集失败: ${error.message}`, true);
    captureButton.disabled = false;
  });
});

openOptionsButton.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

initialize().catch((error) => {
  setStatus(`初始化失败: ${error.message}`, true);
});
