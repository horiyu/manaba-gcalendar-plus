type OpenCalendarTabsMessage = {
  type: 'MGCP_OPEN_CALENDAR_TABS';
  urls: string[];
};

const isOpenCalendarTabsMessage = (message: unknown): message is OpenCalendarTabsMessage => {
  if (!message || typeof message !== 'object') {
    return false;
  }

  const candidate = message as Partial<OpenCalendarTabsMessage>;
  return candidate.type === 'MGCP_OPEN_CALENDAR_TABS'
    && Array.isArray(candidate.urls)
    && candidate.urls.every((url) => typeof url === 'string' && url.startsWith('https://calendar.google.com/'));
};

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!isOpenCalendarTabsMessage(message)) {
    return false;
  }

  const openerTabId = sender.tab?.id;
  message.urls.forEach((url, index) => {
    const createProperties: chrome.tabs.CreateProperties = {
      active: index === 0,
      url,
    };

    if (openerTabId != null) {
      createProperties.openerTabId = openerTabId;
    }

    chrome.tabs.create(createProperties);
  });

  sendResponse({ opened: message.urls.length });
  return false;
});
