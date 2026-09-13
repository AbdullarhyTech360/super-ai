export interface ChatTheme {
  id: string;
  label: string;
  areaBg: string;
  userBg: string;
  userText: string;
  userBorder: string;
  aiBg: string;
  aiText: string;
  aiBorder: string;
  swatchUser: string;
  swatchAi: string;
}

export const CHAT_THEMES: ChatTheme[] = [
  {
    id: 'default',
    label: 'Default',
    areaBg: 'linear-gradient(180deg, hsl(var(--secondary) / 0.55), hsl(var(--background)))',
    userBg: 'hsl(var(--secondary) / 0.7)',
    userText: 'hsl(var(--foreground))',
    userBorder: 'hsl(var(--border) / 0.6)',
    aiBg: 'hsl(var(--card))',
    aiText: 'hsl(var(--foreground))',
    aiBorder: 'hsl(var(--border) / 0.6)',
    swatchUser: 'hsl(var(--secondary))',
    swatchAi: 'hsl(var(--card))',
  },
  {
    id: 'aurora',
    label: 'Aurora',
    areaBg: 'linear-gradient(135deg, hsl(258 85% 60% / 0.4), hsl(220 91% 58% / 0.3)), hsl(var(--background))',
    userBg: 'linear-gradient(135deg, hsl(258 85% 60%), hsl(220 91% 58%))',
    userText: '#ffffff',
    userBorder: 'hsl(258 85% 70% / 0.5)',
    aiBg: 'hsl(224 40% 12% / 0.88)',
    aiText: 'hsl(213 31% 91%)',
    aiBorder: 'hsl(220 91% 65% / 0.4)',
    swatchUser: '#7a5cff',
    swatchAi: '#2e7bff',
  },
  {
    id: 'sunset',
    label: 'Sunset',
    areaBg: 'linear-gradient(135deg, hsl(20 92% 58% / 0.4), hsl(330 85% 60% / 0.3)), hsl(var(--background))',
    userBg: 'linear-gradient(135deg, hsl(15 92% 58%), hsl(330 85% 60%))',
    userText: '#ffffff',
    userBorder: 'hsl(20 92% 65% / 0.5)',
    aiBg: 'hsl(340 50% 15% / 0.88)',
    aiText: 'hsl(30 30% 94%)',
    aiBorder: 'hsl(20 92% 65% / 0.4)',
    swatchUser: '#f97316',
    swatchAi: '#e11d84',
  },
  {
    id: 'ocean',
    label: 'Ocean',
    areaBg: 'linear-gradient(135deg, hsl(190 95% 45% / 0.35), hsl(210 90% 55% / 0.3)), hsl(var(--background))',
    userBg: 'linear-gradient(135deg, hsl(190 95% 45%), hsl(210 90% 55%))',
    userText: '#ffffff',
    userBorder: 'hsl(190 95% 60% / 0.5)',
    aiBg: 'hsl(195 45% 13% / 0.88)',
    aiText: 'hsl(185 50% 92%)',
    aiBorder: 'hsl(180 90% 55% / 0.4)',
    swatchUser: '#0ec5dc',
    swatchAi: '#0ea5e9',
  },
  {
    id: 'midnight',
    label: 'Midnight',
    areaBg: 'linear-gradient(135deg, hsl(255 85% 60% / 0.42), hsl(240 80% 60% / 0.35)), hsl(var(--background))',
    userBg: 'linear-gradient(135deg, hsl(255 80% 55%), hsl(240 80% 60%))',
    userText: '#ffffff',
    userBorder: 'hsl(255 85% 65% / 0.5)',
    aiBg: 'hsl(245 35% 10% / 0.88)',
    aiText: 'hsl(240 60% 94%)',
    aiBorder: 'hsl(255 85% 60% / 0.35)',
    swatchUser: '#5b6cff',
    swatchAi: '#6366f1',
  },
  {
    id: 'emerald',
    label: 'Emerald',
    areaBg: 'linear-gradient(135deg, hsl(155 80% 42% / 0.35), hsl(170 85% 38% / 0.3)), hsl(var(--background))',
    userBg: 'linear-gradient(135deg, hsl(155 80% 42%), hsl(170 85% 38%))',
    userText: '#ffffff',
    userBorder: 'hsl(155 80% 55% / 0.5)',
    aiBg: 'hsl(160 40% 11% / 0.88)',
    aiText: 'hsl(160 45% 92%)',
    aiBorder: 'hsl(155 75% 50% / 0.4)',
    swatchUser: '#10b981',
    swatchAi: '#0d9488',
  },
  {
    id: 'blush',
    label: 'Blush',
    areaBg: 'linear-gradient(140deg, hsl(15 100% 96% / 0.95), hsl(320 90% 94% / 0.95), hsl(265 85% 93% / 0.95))',
    userBg: 'linear-gradient(135deg, hsl(335 90% 80%), hsl(270 80% 82%))',
    userText: 'hsl(270 45% 22%)',
    userBorder: 'hsl(310 70% 82% / 0.9)',
    aiBg: 'hsl(0 0% 100% / 0.85)',
    aiText: 'hsl(270 35% 20%)',
    aiBorder: 'hsl(320 60% 86% / 0.9)',
    swatchUser: '#f9a8d4',
    swatchAi: '#f3e8f9',
  },
  {
    id: 'mist',
    label: 'Mist',
    areaBg: 'linear-gradient(140deg, hsl(210 95% 95% / 0.95), hsl(165 90% 94% / 0.95), hsl(260 85% 94% / 0.95))',
    userBg: 'linear-gradient(135deg, hsl(200 85% 78%), hsl(160 75% 78%))',
    userText: 'hsl(190 50% 18%)',
    userBorder: 'hsl(190 70% 80% / 0.9)',
    aiBg: 'hsl(0 0% 100% / 0.85)',
    aiText: 'hsl(210 35% 18%)',
    aiBorder: 'hsl(190 60% 84% / 0.9)',
    swatchUser: '#7dd3fc',
    swatchAi: '#eef7f5',
  },
];

export const DEFAULT_CHAT_THEME_ID = 'default';

export const getChatTheme = (id: string | null | undefined): ChatTheme =>
  CHAT_THEMES.find((theme) => theme.id === id) ?? CHAT_THEMES[0];