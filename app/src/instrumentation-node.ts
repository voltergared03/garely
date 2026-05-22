import { isSetupComplete, getOrCreateSetupToken } from './lib/setup';

/**
 * Node-only boot logic. Imported from instrumentation.ts ONLY inside the
 * `NEXT_RUNTIME === 'nodejs'` branch, so node built-ins (node:crypto via
 * lib/setup) never end up in the Edge bundle.
 *
 * Prints the one-time setup token + /setup URL on first run.
 */
export async function logSetupTokenIfNeeded() {
  try {
    if (await isSetupComplete()) return;
    const token = await getOrCreateSetupToken();
    const base = (
      process.env.PUBLIC_URL ||
      process.env.NEXTAUTH_URL ||
      `http://localhost:${process.env.PORT || 3000}`
    ).replace(/\/+$/, '');
    const bar = '═'.repeat(62);
    console.log(
      `\n${bar}\n` +
        `  EAM Meet — FIRST-RUN SETUP REQUIRED\n` +
        `\n` +
        `  1) Open:  ${base}/setup\n` +
        `  2) Paste this setup token on the first screen:\n` +
        `\n` +
        `        ${token}\n` +
        `\n` +
        `  The token unlocks /setup and is deleted once setup completes.\n` +
        `${bar}\n`,
    );
  } catch {
    // DB may not be ready at boot — the /setup route generates the token lazily
    // on first access. Never crash the server.
  }
}

// Runs once when this module is first imported (i.e. on Node server boot).
void logSetupTokenIfNeeded();
