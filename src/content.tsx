type Assignment = {
  id: string;
  title: string;
  course: string;
  type: string;
  url: string;
  deadline: Date;
  deadlineText: string;
};

type Settings = {
  eventDurationMinutes: number;
  timezone: string;
  manabaHost: string;
};

const ADDED_IDS_STORAGE_KEY = 'manabaGCalendarPlus.addedAssignmentIds';
const SETTINGS_STORAGE_KEY = 'manabaGCalendarPlus.settings';
const DEFAULT_SETTINGS: Settings = {
  eventDurationMinutes: 60,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  manabaHost: '',
};
const BUTTON_CLASS = 'mgcp-button';
const SECONDARY_BUTTON_CLASS = 'mgcp-button-secondary';
const DISABLED_BUTTON_CLASS = 'mgcp-button-disabled';
const BULK_CONTAINER_ID = 'mgcp-bulk-calendar-actions';
const INDIVIDUAL_CONTAINER_ID = 'mgcp-individual-calendar-actions';
const INDIVIDUAL_MARK = 'data-mgcp-enhanced';

const log = (...args: unknown[]): void => {
  console.log('[manaba Google Calendar Plus]', ...args);
};

const hasChromeStorage = (): boolean => {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
};

const getStorage = async <T,>(key: string, fallback: T): Promise<T> => {
  if (!hasChromeStorage()) {
    return fallback;
  }

  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      resolve((result[key] as T | undefined) ?? fallback);
    });
  });
};

const setStorage = async <T,>(key: string, value: T): Promise<void> => {
  if (!hasChromeStorage()) {
    return;
  }

  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, () => resolve());
  });
};

const sanitizeSettings = (settings: Partial<Settings>): Settings => {
  const eventDurationMinutes = Number(settings.eventDurationMinutes);

  return {
    eventDurationMinutes: Number.isFinite(eventDurationMinutes) && eventDurationMinutes > 0
      ? Math.min(Math.round(eventDurationMinutes), 24 * 60)
      : DEFAULT_SETTINGS.eventDurationMinutes,
    timezone: settings.timezone?.trim() || DEFAULT_SETTINGS.timezone,
    manabaHost: settings.manabaHost?.trim().toLowerCase() || DEFAULT_SETTINGS.manabaHost,
  };
};

const getSettings = async (): Promise<Settings> => {
  const settings = await getStorage<Partial<Settings>>(SETTINGS_STORAGE_KEY, DEFAULT_SETTINGS);
  return sanitizeSettings(settings);
};

const isEnabledForCurrentSite = (settings: Settings): boolean => {
  if (!window.location.pathname.startsWith('/ct/')) {
    return false;
  }

  if (settings.manabaHost) {
    return window.location.hostname === settings.manabaHost;
  }

  return window.location.hostname.toLowerCase().startsWith('manaba.');
};

const getAddedIds = async (): Promise<string[]> => getStorage<string[]>(ADDED_IDS_STORAGE_KEY, []);

const markAdded = async (ids: string[]): Promise<void> => {
  const current = new Set(await getAddedIds());
  ids.forEach((id) => current.add(id));
  await setStorage(ADDED_IDS_STORAGE_KEY, Array.from(current));
};

const injectStyles = (): void => {
  if (document.getElementById('mgcp-styles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'mgcp-styles';
  style.textContent = `
    .mgcp-actions {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
      margin: 10px 0;
    }

    .mgcp-inline-actions {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 10px 0;
    }

    .${BUTTON_CLASS} {
      align-items: center;
      appearance: none;
      background: #1a73e8;
      border: 1px solid #1558b0;
      border-radius: 8px;
      box-shadow: 0 1px 2px rgba(0, 0, 0, .14);
      color: #fff !important;
      cursor: pointer;
      display: inline-flex;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 13px;
      font-weight: 700;
      gap: 6px;
      line-height: 1.2;
      min-height: 34px;
      padding: 8px 13px;
      text-decoration: none !important;
      transition: background-color .15s ease, box-shadow .15s ease, transform .15s ease;
      white-space: nowrap;
    }

    .${BUTTON_CLASS}:hover {
      background: #185abc;
      box-shadow: 0 2px 5px rgba(0, 0, 0, .18);
      transform: translateY(-1px);
    }

    .${BUTTON_CLASS}:active {
      box-shadow: 0 1px 2px rgba(0, 0, 0, .18);
      transform: translateY(0);
    }

    .${BUTTON_CLASS}:focus-visible {
      outline: 3px solid rgba(26, 115, 232, .3);
      outline-offset: 2px;
    }

    .${SECONDARY_BUTTON_CLASS} {
      background: #fff;
      border-color: #c7d2e5;
      color: #174ea6 !important;
    }

    .${SECONDARY_BUTTON_CLASS}:hover {
      background: #f3f7ff;
    }

    .${DISABLED_BUTTON_CLASS},
    .${DISABLED_BUTTON_CLASS}:hover {
      background: #edf1f7;
      border-color: #d4dae6;
      box-shadow: none;
      color: #6b7280 !important;
      cursor: default;
      transform: none;
    }

    .mgcp-status {
      color: #536471;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 12px;
      line-height: 1.5;
    }
  `;
  document.head.appendChild(style);
};

const normalizeSpace = (text: string): string => text.replace(/\s+/g, ' ').trim();

const parseManabaDate = (value: string): Date | null => {
  const match = normalizeSpace(value).match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    0,
    0,
  );

  return Number.isNaN(date.getTime()) ? null : date;
};

const parseManabaDates = (value: string): Date[] => {
  const matches = normalizeSpace(value).match(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/g) ?? [];
  const dates: Date[] = [];

  matches.forEach((dateText) => {
    const date = parseManabaDate(dateText);
    if (date) {
      dates.push(date);
    }
  });

  return dates;
};

const formatGoogleDate = (date: Date): string => {
  const pad = (value: number): string => value < 10 ? `0${value}` : String(value);
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
};

const getAssignmentIdFromUrl = (url: string): string => {
  try {
    const parsed = new URL(url, window.location.href);
    return parsed.pathname.replace(/^\/ct\//, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  } catch {
    return url.replace(/[^a-zA-Z0-9_-]/g, '_');
  }
};

const getCourseIdFromUrl = (url: string): string => {
  try {
    const parsed = new URL(url, window.location.href);
    return parsed.pathname.match(/course_(\d+)/)?.[1] ?? '';
  } catch {
    return '';
  }
};

const createCalendarTitle = (assignment: Assignment): string => {
  return assignment.course ? `[${assignment.course}] ${assignment.title}` : assignment.title;
};

const createCalendarUrl = (assignment: Assignment, settings: Settings): string => {
  const start = new Date(assignment.deadline.getTime() - settings.eventDurationMinutes * 60 * 1000);
  const end = assignment.deadline;
  const title = createCalendarTitle(assignment);
  const details = [
    `コース: ${assignment.course}`,
    `種別: ${assignment.type}`,
    `提出締切: ${assignment.deadlineText}`,
    assignment.url,
  ].filter(Boolean).join('\n');

  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text', title);
  url.searchParams.set('dates', `${formatGoogleDate(start)}/${formatGoogleDate(end)}`);
  url.searchParams.set('ctz', settings.timezone);
  url.searchParams.set('details', details);
  url.searchParams.set('location', 'manaba');
  return url.toString();
};

const openCalendarUrl = (url: string): void => {
  window.open(url, '_blank', 'noopener,noreferrer');
};

const openCalendarTabs = async (urls: string[]): Promise<number> => {
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'MGCP_OPEN_CALENDAR_TABS', urls }, (response) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(typeof response?.opened === 'number' ? response.opened : urls.length);
      });
    });
  }

  urls.forEach((url) => openCalendarUrl(url));
  return urls.length;
};

const createButton = (label: string, onClick: () => void | Promise<void>, secondary = false): HTMLButtonElement => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = secondary ? `${BUTTON_CLASS} ${SECONDARY_BUTTON_CLASS}` : BUTTON_CLASS;
  button.textContent = label;
  button.addEventListener('click', () => {
    void onClick();
  });
  return button;
};

const setButtonDone = (button: HTMLButtonElement, label = '追加済み'): void => {
  button.textContent = label;
  button.disabled = true;
  button.classList.add(DISABLED_BUTTON_CLASS);
};

const getInputValue = (form: HTMLFormElement, name: string): string => {
  const input = form.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${name}"]`);
  return input?.value ?? '';
};

const enhanceExistingCalendarForms = async (): Promise<number> => {
  const forms = Array.from(document.querySelectorAll<HTMLFormElement>('form')).filter((form) => {
    return form.method.toUpperCase() === 'GET'
      && /google\.[^/]+\/calendar\/event|calendar\.google\.com\/calendar\/render/.test(form.action)
      && !form.hasAttribute(INDIVIDUAL_MARK);
  });

  if (forms.length === 0) {
    return 0;
  }

  const addedIds = new Set(await getAddedIds());
  forms.forEach((form) => {
    form.setAttribute(INDIVIDUAL_MARK, 'true');
    const assignmentId = getAssignmentIdFromUrl(window.location.href);
    const wrapper = document.createElement('div');
    wrapper.className = 'mgcp-inline-actions';

    const button = createButton('Googleカレンダーに追加', async () => {
      await markAdded([assignmentId]);
      setButtonDone(button);
      if (typeof form.requestSubmit === 'function') {
        form.requestSubmit();
      } else {
        form.submit();
      }
    });

    if (addedIds.has(assignmentId)) {
      setButtonDone(button);
    }

    const originalSubmit = form.querySelector<HTMLInputElement | HTMLButtonElement>(
      'input[type="submit"], button[type="submit"], input[type="image"]',
    );
    if (originalSubmit instanceof HTMLElement) {
      originalSubmit.style.display = 'none';
    }

    const text = getInputValue(form, 'text');
    const status = document.createElement('span');
    status.className = 'mgcp-status';
    status.textContent = text ? 'Googleカレンダーの登録画面を開きます' : '既存の予定追加フォームを使います';

    wrapper.append(button, status);
    form.appendChild(wrapper);
  });

  return forms.length;
};

const getAssignmentTypeFromPath = (path: string): string => {
  if (/_query_\d+/.test(path)) {
    return '小テスト';
  }
  if (/_report_\d+/.test(path)) {
    return 'レポート';
  }
  if (/_survey_\d+/.test(path)) {
    return 'アンケート';
  }
  if (/_drill_\d+/.test(path)) {
    return 'ドリル';
  }
  if (/_project_\d+/.test(path)) {
    return 'プロジェクト';
  }
  return '課題';
};

const isIndividualAssignmentPage = (): boolean => {
  return /\/ct\/course_\d+_(query|report|survey|drill|project|exam)_\d+/.test(window.location.pathname);
};

const getIndividualAssignmentTitle = (): string => {
  const selectors = [
    '.myassignments-title',
    '.query-title',
    '.report-title',
    '.survey-title',
    '.drill-title',
    '.pagetitle',
    '.page-title',
    'main h1',
    '.contentbody h1',
    '.contentbody-l h1',
    'h1',
  ];

  for (const selector of selectors) {
    const element = document.querySelector<HTMLElement>(selector);
    const text = normalizeSpace(element?.textContent ?? '');
    if (text && !/^(manaba|コースニュース|未提出の課題一覧)$/i.test(text)) {
      return text;
    }
  }

  return normalizeSpace(document.title.replace(/^manaba\s*-\s*/i, '')) || 'manaba課題';
};

const getIndividualCourseName = (): string => {
  const courseId = getCourseIdFromUrl(window.location.href);
  if (!courseId) {
    return '';
  }

  const courseLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>(`a[href*="/ct/course_${courseId}"]`));
  const exactCourseLink = courseLinks.find((link) => {
    try {
      return new URL(link.href, window.location.href).pathname === `/ct/course_${courseId}`;
    } catch {
      return false;
    }
  });

  const courseName = normalizeSpace(exactCourseLink?.textContent ?? '');
  if (courseName && !/^course_\d+$/.test(courseName)) {
    return courseName;
  }

  return '';
};

const getDeadlineFromLabelledText = (text: string): { deadline: Date; deadlineText: string } | null => {
  if (!/(受付終了|提出期限|締切|期限)/.test(text)) {
    return null;
  }

  const dates = parseManabaDates(text);
  if (dates.length === 0) {
    return null;
  }

  const deadline = dates[dates.length - 1];
  return {
    deadline,
    deadlineText: formatVisibleDeadline(deadline),
  };
};

const formatVisibleDeadline = (date: Date): string => {
  const pad = (value: number): string => value < 10 ? `0${value}` : String(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const getIndividualDeadline = (): { deadline: Date; deadlineText: string } | null => {
  const rows = Array.from(document.querySelectorAll<HTMLTableRowElement>('tr'));
  for (const row of rows) {
    const parsed = getDeadlineFromLabelledText(row.textContent ?? '');
    if (parsed) {
      return parsed;
    }
  }

  const definitionItems = Array.from(document.querySelectorAll<HTMLElement>('dl, .row, .formrow, .item, .section, p, div'));
  for (const item of definitionItems) {
    const text = normalizeSpace(item.textContent ?? '');
    if (text.length > 300) {
      continue;
    }

    const parsed = getDeadlineFromLabelledText(text);
    if (parsed) {
      return parsed;
    }
  }

  return null;
};

const parseIndividualAssignment = (): Assignment | null => {
  if (!isIndividualAssignmentPage()) {
    return null;
  }

  const deadline = getIndividualDeadline();
  if (!deadline) {
    return null;
  }

  const url = window.location.href;
  return {
    id: getAssignmentIdFromUrl(url),
    title: getIndividualAssignmentTitle(),
    course: getIndividualCourseName(),
    type: getAssignmentTypeFromPath(window.location.pathname),
    url,
    deadline: deadline.deadline,
    deadlineText: deadline.deadlineText,
  };
};

const insertIndividualButton = async (settings: Settings): Promise<void> => {
  if (document.getElementById(INDIVIDUAL_CONTAINER_ID)) {
    return;
  }

  const assignment = parseIndividualAssignment();
  if (!assignment) {
    return;
  }

  const container = document.createElement('div');
  container.id = INDIVIDUAL_CONTAINER_ID;
  container.className = 'mgcp-inline-actions';

  const addedIds = new Set(await getAddedIds());
  const button = createButton('Googleカレンダーに追加', async () => {
    await openCalendarTabs([createCalendarUrl(assignment, settings)]);
    await markAdded([assignment.id]);
    setButtonDone(button);
  });

  if (addedIds.has(assignment.id)) {
    setButtonDone(button);
  }

  const status = document.createElement('span');
  status.className = 'mgcp-status';
  status.textContent = `締切: ${assignment.deadlineText}`;

  container.append(button, status);

  const anchor = document.querySelector('.contentbody h1, .contentbody-l h1, main h1, h1')
    ?? document.querySelector('.contentbody, .contentbody-l, main')
    ?? document.body;
  anchor.insertAdjacentElement(anchor.tagName === 'H1' ? 'afterend' : 'afterbegin', container);
};

const parseHomeAssignments = (): Assignment[] => {
  const rows = Array.from(document.querySelectorAll<HTMLTableRowElement>('table.stdlist tr'));
  const assignments: Assignment[] = [];

  rows.forEach((row) => {
    const titleLink = row.querySelector<HTMLAnchorElement>('.myassignments-title a');
    const courseLink = row.querySelector<HTMLAnchorElement>('.mycourse-title a');
    const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>('td'));
    if (!titleLink || cells.length < 5) {
      return;
    }

    const deadlineCell = cells[4];
    const deadlineText = normalizeSpace(deadlineCell?.textContent ?? '');
    const deadline = parseManabaDate(deadlineText);
    if (!deadline) {
      return;
    }

    const url = new URL(titleLink.href, window.location.href).toString();
    assignments.push({
      id: getAssignmentIdFromUrl(url),
      title: normalizeSpace(titleLink.textContent ?? ''),
      course: normalizeSpace(courseLink?.textContent ?? ''),
      type: normalizeSpace(cells[0]?.textContent ?? ''),
      url,
      deadline,
      deadlineText,
    });
  });

  return assignments;
};

const insertBulkButton = async (settings: Settings): Promise<void> => {
  if (!/\/ct\/home_library_query/.test(window.location.pathname) || document.getElementById(BULK_CONTAINER_ID)) {
    return;
  }

  const assignments = parseHomeAssignments();
  if (assignments.length === 0) {
    return;
  }

  const addedIds = new Set(await getAddedIds());
  const pending = assignments.filter((assignment) => !addedIds.has(assignment.id));
  const anchor = document.querySelector('.contentbody-l h1') ?? document.querySelector('.contentbody-l') ?? document.body;
  const container = document.createElement('div');
  container.id = BULK_CONTAINER_ID;
  container.className = 'mgcp-actions';

  const status = document.createElement('span');
  status.className = 'mgcp-status';
  status.textContent = `締切あり ${assignments.length} 件 / 未追加 ${pending.length} 件`;

  const button = createButton(`未追加の締切をまとめて開く (${pending.length})`, async () => {
    if (pending.length === 0) {
      return;
    }

    button.disabled = true;
    const openedCount = await openCalendarTabs(pending.map((assignment) => createCalendarUrl(assignment, settings)));
    await markAdded(pending.map((assignment) => assignment.id));
    setButtonDone(button, '登録画面を開きました');
    status.textContent = `${openedCount} 件のGoogleカレンダー登録画面を開きました`;
  });

  if (pending.length === 0) {
    setButtonDone(button, '追加済みの締切のみ');
  }

  const resetButton = createButton('追加済みをリセット', async () => {
    const current = new Set(await getAddedIds());
    assignments.forEach((assignment) => current.delete(assignment.id));
    await setStorage(ADDED_IDS_STORAGE_KEY, Array.from(current));
    container.remove();
    await insertBulkButton(settings);
  }, true);

  container.append(button, resetButton, status);
  anchor.insertAdjacentElement('afterend', container);
};

const enhancePage = async (): Promise<void> => {
  const settings = await getSettings();
  if (!isEnabledForCurrentSite(settings)) {
    return;
  }

  injectStyles();
  const enhancedFormCount = await enhanceExistingCalendarForms();
  if (enhancedFormCount === 0) {
    await insertIndividualButton(settings);
  }
  await insertBulkButton(settings);
};

const scheduleEnhance = (() => {
  let timer: number | undefined;
  return (): void => {
    if (timer) {
      window.clearTimeout(timer);
    }
    timer = window.setTimeout(() => {
      void enhancePage().catch((error) => log('ページ拡張に失敗しました', error));
    }, 150);
  };
})();

const initContentScript = (): void => {
  log('初期化開始');
  scheduleEnhance();

  const observer = new MutationObserver(() => scheduleEnhance());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initContentScript, { once: true });
} else {
  initContentScript();
}
