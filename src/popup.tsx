import React from 'react';
import { createRoot } from 'react-dom/client';
import './popup.css';

type Settings = {
  eventDurationMinutes: number;
  timezone: string;
  manabaHost: string;
};

const SETTINGS_STORAGE_KEY = 'manabaGCalendarPlus.settings';
const DEFAULT_SETTINGS: Settings = {
  eventDurationMinutes: 60,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  manabaHost: '',
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

const App: React.FC = () => {
  const [settings, setSettings] = React.useState<Settings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    chrome.storage.local.get(SETTINGS_STORAGE_KEY, (result) => {
      setSettings(sanitizeSettings(result[SETTINGS_STORAGE_KEY] as Partial<Settings> | undefined ?? {}));
    });
  }, []);

  const updateField = (field: keyof Settings, value: string): void => {
    setSaved(false);
    setSettings((current) => ({
      ...current,
      [field]: field === 'manabaHost' || field === 'timezone' ? value : Number(value),
    }));
  };

  const saveSettings = (): void => {
    const nextSettings = sanitizeSettings(settings);
    chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: nextSettings }, () => {
      setSettings(nextSettings);
      setSaved(true);
    });
  };

  const resetSettings = (): void => {
    chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: DEFAULT_SETTINGS }, () => {
      setSettings(DEFAULT_SETTINGS);
      setSaved(true);
    });
  };

  return (
    <main className="popup">
      <h1>manaba Googleカレンダー＋</h1>

      <label className="field">
        <span>manabaのホスト</span>
        <input
          type="text"
          value={settings.manabaHost}
          placeholder="空欄なら manaba.* で有効"
          onChange={(event) => updateField('manabaHost', event.target.value)}
        />
      </label>

      <label className="field">
        <span>タイムゾーン</span>
        <input
          type="text"
          value={settings.timezone}
          onChange={(event) => updateField('timezone', event.target.value)}
        />
      </label>

      <label className="field">
        <span>締切前の予定時間（分）</span>
        <input
          type="number"
          min="1"
          max="1440"
          value={settings.eventDurationMinutes}
          onChange={(event) => updateField('eventDurationMinutes', event.target.value)}
        />
      </label>

      <p className="note">一覧ページの一括追加は、未追加の締切ごとにGoogleカレンダー登録画面を別タブで開きます。</p>

      <div className="actions">
        <button type="button" className="primary" onClick={saveSettings}>保存</button>
        <button type="button" onClick={resetSettings}>初期値に戻す</button>
      </div>

      {saved && <p className="saved">保存しました</p>}
    </main>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
