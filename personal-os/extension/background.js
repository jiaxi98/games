const DEFAULT_SETTINGS = {
  backendBaseUrl: 'http://127.0.0.1:8000',
  ingestToken: 'dev-ingest-token',
  autoCapture: false,
};

const MENU_ID = 'personal-os-capture-selection';

async function getSettings() {
  const result = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return {
    backendBaseUrl: String(result.backendBaseUrl || DEFAULT_SETTINGS.backendBaseUrl),
    ingestToken: String(result.ingestToken || DEFAULT_SETTINGS.ingestToken),
    autoCapture: Boolean(result.autoCapture),
  };
}

async function sendEvent(payload) {
  const settings = await getSettings();
  const endpoint = `${settings.backendBaseUrl.replace(/\/$/, '')}/api/v1/ingest/browser`;
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
    throw new Error(`ingest failed: ${response.status} ${text}`);
  }
  return response.json();
}

async function captureSelection(info, tab) {
  if (!info.selectionText || !tab?.url) {
    return;
  }
  await sendEvent({
    event_type: 'selection',
    title: tab.title || null,
    content: info.selectionText,
    url: tab.url,
    metadata: {
      via: 'context_menu',
    },
  });
}

async function maybeAutoCapture(tabId, changeInfo, tab) {
  if (changeInfo.status !== 'complete') {
    return;
  }
  if (!tab?.url || !tab.url.startsWith('http')) {
    return;
  }
  const settings = await getSettings();
  if (!settings.autoCapture) {
    return;
  }
  await sendEvent({
    event_type: 'page_meta',
    title: tab.title || null,
    content: tab.title || tab.url,
    url: tab.url,
    metadata: {
      via: 'auto_capture',
      tab_id: tabId,
    },
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: '发送到 Personal OS',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID) {
    return;
  }
  captureSelection(info, tab).catch((error) => {
    console.error('[Personal OS] context menu capture failed:', error);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  maybeAutoCapture(tabId, changeInfo, tab).catch((error) => {
    console.error('[Personal OS] auto capture failed:', error);
  });
});
