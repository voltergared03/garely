/**
 * Minimal, dependency-free iCalendar (RFC 5545) builder for the per-user
 * subscription feed. Handles TEXT escaping, UTF-8-aware 75-octet line folding
 * (important for Cyrillic titles), CRLF endings, and UTC / all-day stamps.
 */

export interface IcsEvent {
  uid: string;
  start: Date;
  end?: Date;
  allDay?: boolean;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  /** DTSTAMP (last-modified-ish); defaults to `start`. */
  stamp?: Date;
}

const pad = (n: number) => String(n).padStart(2, "0");

const fmtUtc = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

const fmtDate = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;

function esc(s: string): string {
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Fold a content line to ≤75 octets, never splitting a multi-byte char. */
function fold(line: string): string {
  if (Buffer.byteLength(line, "utf8") <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let curBytes = 0;
  let limit = 75; // continuation lines start with a space, so they get 74
  for (const ch of line) {
    const b = Buffer.byteLength(ch, "utf8");
    if (curBytes + b > limit) {
      out.push(cur);
      cur = ch;
      curBytes = b;
      limit = 74;
    } else {
      cur += ch;
      curBytes += b;
    }
  }
  if (cur) out.push(cur);
  return out.map((s, i) => (i === 0 ? s : " " + s)).join("\r\n");
}

const addDay = (d: Date) => {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + 1);
  return x;
};

export function buildCalendar(opts: { name: string; events: IcsEvent[]; prodId?: string }): string {
  const L: string[] = [];
  L.push("BEGIN:VCALENDAR");
  L.push("VERSION:2.0");
  L.push(`PRODID:${opts.prodId || "-//EZmeet//Calendar//EN"}`);
  L.push("CALSCALE:GREGORIAN");
  L.push("METHOD:PUBLISH");
  L.push(fold(`X-WR-CALNAME:${esc(opts.name)}`));
  for (const e of opts.events) {
    L.push("BEGIN:VEVENT");
    L.push(`UID:${e.uid}`);
    L.push(`DTSTAMP:${fmtUtc(e.stamp || e.start)}`);
    if (e.allDay) {
      L.push(`DTSTART;VALUE=DATE:${fmtDate(e.start)}`);
      L.push(`DTEND;VALUE=DATE:${fmtDate(addDay(e.end || e.start))}`);
    } else {
      L.push(`DTSTART:${fmtUtc(e.start)}`);
      if (e.end) L.push(`DTEND:${fmtUtc(e.end)}`);
    }
    L.push(fold(`SUMMARY:${esc(e.summary)}`));
    if (e.description) L.push(fold(`DESCRIPTION:${esc(e.description)}`));
    if (e.location) L.push(fold(`LOCATION:${esc(e.location)}`));
    if (e.url) L.push(fold(`URL:${esc(e.url)}`));
    L.push("END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.join("\r\n") + "\r\n";
}
