import { describe, it, expect } from 'vitest';
import { buildEventIcs, buildEventIcsUid } from '../../../../server/src/utils/icsBuilder.js';

const SAMPLE_EVENT = {
  id: 'evt_123',
  name: 'Taco Tuesday Tasting',
  description: 'Five course taco tasting menu, paired with margaritas.',
  location: '123 Main St, Brooklyn, NY',
  slug: 'taco-tuesday-tasting',
  startDatetime: '2026-06-15T23:00:00Z',
  endDatetime: '2026-06-16T01:30:00Z',
};

const SAMPLE_RSVP = {
  id: 'rsvp_abc',
  guestName: 'Alex Rivera',
  guestEmail: 'alex@example.com',
  attendees: 2,
  status: 'going',
};

function unfold(ics) {
  // RFC 5545 unfolding: CRLF followed by SP or HTAB is a line continuation.
  return ics.replace(/\r\n[ \t]/g, '');
}

function parseProperties(ics) {
  const lines = unfold(ics).split('\r\n');
  const props = {};
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const nameAndParams = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const name = nameAndParams.split(';')[0];
    if (!props[name]) props[name] = [];
    props[name].push({ raw: line, value, paramsRaw: nameAndParams });
  }
  return props;
}

describe('icsBuilder', () => {
  it('builds a valid REQUEST invite with required properties', () => {
    const ics = buildEventIcs({
      event: SAMPLE_EVENT,
      rsvp: SAMPLE_RSVP,
      method: 'REQUEST',
      eventUrl: 'https://vivaspot.app/e/taco-tuesday-tasting',
      cancellationUrl: 'https://vivaspot.app/events/evt_123/cancel?token=xyz',
      now: new Date('2026-05-01T12:00:00Z'),
    });

    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR')).toBe(true);

    const props = parseProperties(ics);
    expect(props.VERSION[0].value).toBe('2.0');
    expect(props.METHOD[0].value).toBe('REQUEST');
    expect(props.UID[0].value).toBe(buildEventIcsUid({ eventId: 'evt_123', rsvpId: 'rsvp_abc' }));
    expect(props.UID[0].value).toBe('event-evt_123-rsvp-rsvp_abc@vivaspot.app');
    expect(props.SEQUENCE[0].value).toBe('0');
    expect(props.DTSTART[0].value).toBe('20260615T230000Z');
    expect(props.DTEND[0].value).toBe('20260616T013000Z');
    expect(props.DTSTAMP[0].value).toBe('20260501T120000Z');
    expect(props.SUMMARY[0].value).toBe('Taco Tuesday Tasting');
    expect(props.LOCATION[0].value).toBe('123 Main St\\, Brooklyn\\, NY');
    expect(props.STATUS[0].value).toBe('CONFIRMED');
    expect(props.ORGANIZER[0].raw).toContain('mailto:events@vivaspot.app');
    expect(props.ATTENDEE[0].raw).toContain('mailto:alex@example.com');
    expect(props.ATTENDEE[0].raw).toContain('PARTSTAT=ACCEPTED');
    expect(props.DESCRIPTION[0].value).toContain('https://vivaspot.app/e/taco-tuesday-tasting');
    expect(props.DESCRIPTION[0].value).toContain('Cancel your RSVP');
  });

  it('produces CRLF line endings and no physical line longer than 75 octets', () => {
    const longDescription = 'A'.repeat(300);
    const ics = buildEventIcs({
      event: { ...SAMPLE_EVENT, description: longDescription },
      rsvp: SAMPLE_RSVP,
      now: new Date('2026-05-01T12:00:00Z'),
    });

    expect(ics).not.toMatch(/[^\r]\n/);

    const physicalLines = ics.split('\r\n');
    for (const line of physicalLines) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }

    const props = parseProperties(ics);
    expect(props.DESCRIPTION[0].value).toContain('A'.repeat(300));
  });

  it('emits METHOD:CANCEL and STATUS:CANCELLED for cancellations', () => {
    const ics = buildEventIcs({
      event: SAMPLE_EVENT,
      rsvp: { ...SAMPLE_RSVP, status: 'cancelled' },
      method: 'CANCEL',
      now: new Date('2026-05-01T12:00:00Z'),
    });

    const props = parseProperties(ics);
    expect(props.METHOD[0].value).toBe('CANCEL');
    expect(props.STATUS[0].value).toBe('CANCELLED');
    expect(props.ATTENDEE[0].raw).toContain('PARTSTAT=DECLINED');
    expect(props.UID[0].value).toBe(buildEventIcsUid({ eventId: 'evt_123', rsvpId: 'rsvp_abc' }));
  });

  it('matches a golden snapshot for a fixed REQUEST invite', () => {
    const ics = buildEventIcs({
      event: {
        id: 'evt_1',
        name: 'Dinner',
        description: 'Five courses.',
        location: '1 Main',
        slug: 'dinner',
        startDatetime: '2026-06-15T23:00:00Z',
        endDatetime: '2026-06-16T01:30:00Z',
      },
      rsvp: { id: 'rsvp_1' },
      method: 'REQUEST',
      eventUrl: 'https://example.com/e/dinner',
      now: new Date('2026-05-01T12:00:00Z'),
    });

    const expected = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Viva Spot//Events//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      'UID:event-evt_1-rsvp-rsvp_1@vivaspot.app',
      'SEQUENCE:0',
      'DTSTAMP:20260501T120000Z',
      'DTSTART:20260615T230000Z',
      'DTEND:20260616T013000Z',
      'SUMMARY:Dinner',
      'DESCRIPTION:Five courses.\\n\\nEvent details: https://example.com/e/dinner',
      'LOCATION:1 Main',
      'STATUS:CONFIRMED',
      'TRANSP:OPAQUE',
      'ORGANIZER;CN=VivaSpot Events:mailto:events@vivaspot.app',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    expect(ics).toBe(expected);
  });

  it('uses the merchant name as ORGANIZER CN when provided', () => {
    const ics = buildEventIcs({
      event: SAMPLE_EVENT,
      rsvp: SAMPLE_RSVP,
      organizerName: 'The Latin Effect',
      now: new Date('2026-05-01T12:00:00Z'),
    });
    const props = parseProperties(ics);
    expect(props.ORGANIZER[0].raw).toContain('CN=The Latin Effect');
    expect(props.ORGANIZER[0].raw).toContain('mailto:events@vivaspot.app');
  });

  it('escapes commas, semicolons, and newlines in TEXT values', () => {
    const ics = buildEventIcs({
      event: {
        ...SAMPLE_EVENT,
        name: 'Wine, Cheese; Tasting',
        description: 'Line one\nLine two',
      },
      rsvp: SAMPLE_RSVP,
      now: new Date('2026-05-01T12:00:00Z'),
    });
    const props = parseProperties(ics);
    expect(props.SUMMARY[0].value).toBe('Wine\\, Cheese\\; Tasting');
    expect(props.DESCRIPTION[0].value).toContain('Line one\\nLine two');
  });

  it('throws when required fields are missing', () => {
    expect(() => buildEventIcs({ event: { id: 'x' }, rsvp: { id: 'y' } })).toThrow(/startDatetime/);
    expect(() => buildEventIcs({ event: SAMPLE_EVENT, rsvp: { } })).toThrow(/rsvp\.id/);
  });
});
