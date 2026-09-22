export type Preferences = {
  notifications: boolean;
  soundEnabled: boolean;
  language: string;
  /** Ask the model to publish its reasoning and show it while the answer streams. */
  showThinking: boolean;
};

/**
 * Keys for cached chat state. They are shared here because signing out has to
 * clear them, and the Chat page is not the only module that touches them.
 */
export const CHAT_CONVERSATIONS_CACHE_KEY = 'chat.conversations.v1';
export const ACTIVE_CONVERSATION_CACHE_KEY = 'active_conversation_id';

const DEFAULTS: Preferences = {
  notifications: true,
  soundEnabled: true,
  language: 'en',
  showThinking: false,
};

export const getPreferences = (): Preferences => ({
  notifications: localStorage.getItem('notifications_enabled') !== 'false',
  soundEnabled: localStorage.getItem('sound_enabled') !== 'false',
  language: localStorage.getItem('language') || 'en',
  // Opt-in: reasoning summaries cost the model extra time, so nobody pays for
  // them without asking.
  showThinking: localStorage.getItem('show_thinking') === 'true',
});

/**
 * Write the preferences actually supplied.
 *
 * Callers hold a subset of the shape (the settings page knows nothing about the
 * chat thinking toggle), and writing `undefined` for the rest would silently
 * reset them on every save.
 */
export const savePreferences = (preferences: Partial<Preferences>) => {
  if (preferences.notifications !== undefined) {
    localStorage.setItem('notifications_enabled', String(preferences.notifications));
  }
  if (preferences.soundEnabled !== undefined) {
    localStorage.setItem('sound_enabled', String(preferences.soundEnabled));
  }
  if (preferences.language !== undefined) {
    localStorage.setItem('language', preferences.language);
  }
  if (preferences.showThinking !== undefined) {
    localStorage.setItem('show_thinking', String(preferences.showThinking));
  }
};

export const getPreference = <Key extends keyof Preferences>(key: Key): Preferences[Key] =>
  getPreferences()[key];

export { DEFAULTS as DEFAULT_PREFERENCES };