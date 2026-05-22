/**
 * Next.js instrumentation hook — runs once when the server boots.
 *
 * Node-only setup logic lives in ./instrumentation-node and is imported only in
 * the Node.js runtime, so node built-ins never leak into the Edge bundle.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node');
  }
}
