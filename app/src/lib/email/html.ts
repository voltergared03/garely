// Shared helpers for building HTML emails.
//
// Starts with the escape helper that was copy-pasted verbatim in 4 senders.
// (Unifying the full dark-card email layout across the ~10 senders is a later
// pass — it changes generated markup and wants visual review.)

/** Escape user-supplied text for safe interpolation into email HTML. */
export const esc = (s: unknown): string =>
  String(s ?? '').replace(
    /[&<>]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string,
  );
