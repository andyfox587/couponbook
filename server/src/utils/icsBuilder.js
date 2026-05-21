// server/src/utils/icsBuilder.js
//
// Build an RFC 5545 .ics body for a Viva Spot event RSVP.
//
// The output uses CRLF line endings and 75-octet line folding (those are
// the two parts of the spec that Outlook is strictest about).
//
// Exported:
//   - buildEventIcs({ event, rsvp, order, method, eventUrl, cancellationUrl, organizerEmail })
//   - buildEventIcsUid({ eventId, rsvpId })

const PRODID = '-//Viva Spot//Events//EN';
const DEFAULT_ORGANIZER_EMAIL = 'events@vivaspot.app';

export function buildEventIcsUid({ eventId, rsvpId }) {
  return `event-${eventId}-rsvp-${rsvpId}@vivaspot.app`;
}

// Format a Date (or ISO string) as a UTC ICS timestamp: YYYYMMDDTHHMMSSZ
function formatUtc(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`icsBuilder: invalid date value: ${value}`);
  }
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}` +
    `${pad(date.getUTCMonth() + 1)}` +
    `${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}` +
    `${pad(date.getUTCMinutes())}` +
    `${pad(date.getUTCSeconds())}Z`
  );
}

// Escape a TEXT property value per RFC 5545 section 3.3.11.
function escapeText(value) {
  if (value == null) return '';
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n/g, '\\n')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\n');
}

// Fold a single content line so no physical line is longer than 75 octets,
// per RFC 5545 section 3.1. Folding inserts CRLF + single space ("\r\n ").
// We fold on octets (UTF-8 bytes), not characters, and we never split a
// multi-byte UTF-8 codepoint across the boundary.
function foldLine(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;

  const segments = [];
  let start = 0;
  let limit = 75;

  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);

    // Don't split inside a UTF-8 multi-byte sequence: continuation bytes
    // are 10xxxxxx. Back off until `end` lands on a leading byte (or end).
    if (end < bytes.length) {
      while (end > start && (bytes[end] & 0xc0) === 0x80) end -= 1;
    }

    segments.push(bytes.slice(start, end).toString('utf8'));
    start = end;
    limit = 74; // continuation lines start with a leading space => 74 content octets
  }

  return segments.join('\r\n ');
}

function joinLines(lines) {
  return lines
    .filter((line) => line != null && line !== '')
    .map(foldLine)
    .join('\r\n');
}

function statusForMethod(method) {
  return method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED';
}

function resolveAttendee({ rsvp, order }) {
  const email =
    rsvp?.guestEmail
    || order?.guestEmail
    || null;
  const name = rsvp?.guestName || order?.guestName || null;
  return { email, name };
}

/**
 * Build the .ics body string.
 *
 * @param {object} args
 * @param {object} args.event - { id, name, description, location, startDatetime, endDatetime, slug? }
 * @param {object} args.rsvp  - { id, guestName?, guestEmail?, attendees? }
 * @param {object} [args.order] - { id?, guestName?, guestEmail? }
 * @param {'REQUEST'|'CANCEL'} [args.method='REQUEST']
 * @param {string} [args.eventUrl] - canonical event page url, included in DESCRIPTION
 * @param {string} [args.cancellationUrl] - per-RSVP cancel link, included in DESCRIPTION
 * @param {string} [args.organizerEmail]
 * @param {Date}   [args.now=new Date()]
 * @param {number} [args.sequence=0]
 * @returns {string} ics body with CRLF line endings, no trailing CRLF
 */
export function buildEventIcs({
  event,
  rsvp,
  order = null,
  method = 'REQUEST',
  eventUrl = null,
  cancellationUrl = null,
  organizerEmail = DEFAULT_ORGANIZER_EMAIL,
  now = new Date(),
  sequence = 0,
}) {
  if (!event?.id) throw new Error('icsBuilder: event.id is required');
  if (!rsvp?.id) throw new Error('icsBuilder: rsvp.id is required');
  if (!event.startDatetime) throw new Error('icsBuilder: event.startDatetime is required');

  const upperMethod = String(method).toUpperCase() === 'CANCEL' ? 'CANCEL' : 'REQUEST';
  const uid = buildEventIcsUid({ eventId: event.id, rsvpId: rsvp.id });

  // End time: prefer endDatetime, otherwise default to start + 1h.
  const startMs = new Date(event.startDatetime).getTime();
  const endMs = event.endDatetime
    ? new Date(event.endDatetime).getTime()
    : startMs + 60 * 60 * 1000;

  const descriptionParts = [];
  if (event.description) descriptionParts.push(String(event.description));
  if (eventUrl) descriptionParts.push(`Event details: ${eventUrl}`);
  if (cancellationUrl && upperMethod !== 'CANCEL') {
    descriptionParts.push(`Cancel your RSVP: ${cancellationUrl}`);
  }
  if (upperMethod === 'CANCEL') {
    descriptionParts.push('This RSVP has been cancelled.');
  }
  const description = descriptionParts.join('\n\n');

  const attendee = resolveAttendee({ rsvp, order });

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    `METHOD:${upperMethod}`,
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `SEQUENCE:${Number.isFinite(sequence) ? Math.max(0, Math.floor(sequence)) : 0}`,
    `DTSTAMP:${formatUtc(now)}`,
    `DTSTART:${formatUtc(startMs)}`,
    `DTEND:${formatUtc(endMs)}`,
    `SUMMARY:${escapeText(event.name || 'Event')}`,
    description ? `DESCRIPTION:${escapeText(description)}` : null,
    event.location ? `LOCATION:${escapeText(event.location)}` : null,
    `STATUS:${statusForMethod(upperMethod)}`,
    'TRANSP:OPAQUE',
    organizerEmail
      ? `ORGANIZER;CN=${escapeText('Viva Spot')}:mailto:${organizerEmail}`
      : null,
    attendee.email
      ? (() => {
          const cn = attendee.name ? `;CN=${escapeText(attendee.name)}` : '';
          const partstat = upperMethod === 'CANCEL' ? 'DECLINED' : 'ACCEPTED';
          return `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=${partstat};RSVP=TRUE${cn}:mailto:${attendee.email}`;
        })()
      : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return joinLines(lines);
}

export default buildEventIcs;
