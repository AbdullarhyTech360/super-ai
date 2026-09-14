import { getPreference } from '@/lib/preferences';

export const getNotificationPermission = (): NotificationPermission | 'unsupported' =>
  typeof window === 'undefined' || !('Notification' in window)
    ? 'unsupported'
    : Notification.permission;

export const requestNotificationPermission = async (): Promise<NotificationPermission | 'unsupported'> => {
  const permission = getNotificationPermission();
  if (permission === 'unsupported') return permission;
  if (permission === 'granted' || permission === 'denied') return permission;
  return Notification.requestPermission();
};

export const isNotificationsEnabled = () =>
  getPreference('notifications') && getNotificationPermission() === 'granted';

export const tryNotify = (title: string, body?: string) => {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    const notification = new Notification(title, {
      body,
      silent: true,
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // Notifications are best-effort; ignore failures.
  }
};

export const playNotificationSound = () => {
  if (!getPreference('soundEnabled')) return;

  const windowWithAudio = window as Window & typeof globalThis;
  const AudioContextClass: typeof AudioContext | undefined =
    windowWithAudio.AudioContext ??
    (windowWithAudio as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;

  try {
    const context = new AudioContextClass();
    const now = context.currentTime;

    const playTone = (frequency: number, start: number, duration: number, gainValue: number) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(gainValue, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.05);
    };

    playTone(880, now, 0.18, 0.12);
    playTone(1174.66, now + 0.16, 0.25, 0.1);

    window.setTimeout(() => {
      void context.close().catch(() => { /* ignore */ });
    }, 800);
  } catch {
    // Audio is best-effort; ignore failures.
  }
};