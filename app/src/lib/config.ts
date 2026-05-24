import { prisma } from './prisma';

/** Read multiple SystemConfig keys at once → { key: value }. Missing keys are absent. */
export async function readConfig(keys: string[]): Promise<Record<string, string>> {
  const rows = await (prisma as any).systemConfig.findMany({ where: { key: { in: keys } } });
  const m: Record<string, string> = {};
  for (const r of rows) m[r.key] = r.value ?? '';
  return m;
}

/** Upsert multiple SystemConfig keys. */
export async function writeConfig(updates: Record<string, string>): Promise<void> {
  for (const [key, value] of Object.entries(updates)) {
    await (prisma as any).systemConfig.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
}

/** DeepSeek connection config — DB first, env fallback, sane defaults. */
export async function getDeepSeekConfig(): Promise<{ apiKey: string; baseUrl: string; model: string }> {
  const m = await readConfig(['DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL', 'DEEPSEEK_MODEL']);
  return {
    apiKey: m.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY || '',
    baseUrl: (m.DEEPSEEK_BASE_URL || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, ''),
    model: m.DEEPSEEK_MODEL || process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  };
}

/** Google OAuth credentials — DB first (set via /setup), env fallback. */
export async function getGoogleConfig(): Promise<{ clientId: string; clientSecret: string }> {
  const m = await readConfig(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']);
  return {
    clientId: m.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: m.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '',
  };
}

/** Defaults for workspace + pricing config (used when a key is not set). */
export const CONFIG_DEFAULTS: Record<string, string> = {
  WS_NAME: 'EZmeet',
  WS_DOMAIN: '',
  WS_TIMEZONE: 'Europe/Kyiv',
  WS_LANGUAGE: 'uk',
  WS_GUEST_ACCESS: 'true',
  WS_AI_SUMMARY: 'true',
  WS_LIVE_TRANSCRIPTION: 'true',
  WS_RECORD_ALL: 'false',
  WS_REQUIRE_2FA: 'false',
  WS_MAX_PARTICIPANTS: '20',
  WS_MAX_DURATION_MIN: '240',
  WS_RETENTION_DAYS: '0',
  PRICE_DEEPSEEK_IN: '0.27',
  PRICE_DEEPSEEK_OUT: '1.10',
  PRICE_DEEPGRAM_MIN: '0.0043',
  EMAIL_LIMIT: '3000',
};

/** Read a numeric config value with default fallback. */
export function num(map: Record<string, string>, key: string): number {
  const v = map[key];
  const n = v !== undefined && v !== '' ? Number(v) : Number(CONFIG_DEFAULTS[key]);
  return Number.isFinite(n) ? n : Number(CONFIG_DEFAULTS[key]) || 0;
}
