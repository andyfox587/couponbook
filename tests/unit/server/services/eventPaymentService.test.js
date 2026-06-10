import { describe, expect, it } from 'vitest';
import {
  calculateRefundQuote,
  EVENT_REFUND_POLICY_VERSION,
  paidEventPaymentsEnabled,
} from '../../../../server/src/services/eventPaymentService.js';

describe('eventPaymentService', () => {
  it('uses the configured paid-event feature flag', () => {
    const previous = process.env.ENABLE_PAID_EVENT_PAYMENTS;
    process.env.ENABLE_PAID_EVENT_PAYMENTS = 'true';
    expect(paidEventPaymentsEnabled()).toBe(true);
    process.env.ENABLE_PAID_EVENT_PAYMENTS = 'false';
    expect(paidEventPaymentsEnabled()).toBe(false);
    if (previous === undefined) delete process.env.ENABLE_PAID_EVENT_PAYMENTS;
    else process.env.ENABLE_PAID_EVENT_PAYMENTS = previous;
  });

  it('calculates the full refund window at least 7 days before the event', () => {
    const now = new Date('2026-04-01T12:00:00.000Z');
    const quote = calculateRefundQuote('2026-04-08T12:00:00.000Z', 4000, now);
    expect(quote.amountCents).toBe(4000);
    expect(quote.refundPercent).toBe(100);
    expect(quote.creditAmountCents).toBe(0);
    expect(quote.policyWindow).toBe('full_refund_7_plus_days');
  });

  it('calculates the 50 percent refund window between 3 and 7 days', () => {
    const now = new Date('2026-04-01T12:00:00.000Z');
    const quote = calculateRefundQuote('2026-04-05T12:00:00.000Z', 4501, now);
    expect(quote.amountCents).toBe(2250);
    expect(quote.refundPercent).toBe(50);
    expect(quote.creditPercent).toBe(100);
    expect(quote.creditAmountCents).toBe(4501);
    expect(quote.policyWindow).toBe('half_refund_3_to_7_days');
  });

  it('declines cash refunds under 72 hours but offers a 50 percent credit', () => {
    const now = new Date('2026-04-01T12:00:00.000Z');
    const quote = calculateRefundQuote('2026-04-04T11:00:00.000Z', 4000, now);
    expect(quote.amountCents).toBe(0);
    expect(quote.refundPercent).toBe(0);
    expect(quote.creditPercent).toBe(50);
    expect(quote.creditAmountCents).toBe(2000);
    expect(quote.policyWindow).toBe('no_refund_under_72_hours');
  });

  it('treats exactly 72 hours out as inside the 50 percent cash window', () => {
    const now = new Date('2026-04-01T12:00:00.000Z');
    const quote = calculateRefundQuote('2026-04-04T12:00:00.000Z', 4000, now);
    expect(quote.refundPercent).toBe(50);
    expect(quote.policyWindow).toBe('half_refund_3_to_7_days');
  });

  it('exports the persisted refund policy version', () => {
    expect(EVENT_REFUND_POLICY_VERSION).toBe('event-refunds-v2');
  });
});
