export type Preferences = {
  notifications: boolean;
  soundEnabled: boolean;
  language: string;
};

const DEFAULTS: Preferences = {
  notifications: true,
  soundEnabled: true,
  language: 'en',
};

export const getPreferences = (): Preferences => ({
  notifications: localStorage.getItem('notifications_enabled') !== 'false',
  soundEnabled: localStorage.getItem('sound_enabled') !== 'false',
  language: localStorage.getItem('language') || 'en',
});

export const savePreferences = (preferences: Preferences) => {
  localStorage.setItem('notifications_enabled', String(preferences.notifications));
  localStorage.setItem('sound_enabled', String(preferences.soundEnabled));
  localStorage.setItem('language', preferences.language);
};

export const getPreference = <Key extends keyof Preferences>(key: Key): Preferences[Key] =>
  getPreferences()[key];

export { DEFAULTS as DEFAULT_PREFERENCES };