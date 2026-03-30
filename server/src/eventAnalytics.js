import { db } from './db.js';
import { event, eventRsvp, eventSubmission, merchant, foodieGroup } from './schema.js';
import { and, asc, count, desc, eq, gte, isNull, sql } from 'drizzle-orm';

function buildCutoff(days = 30) {
  const safeDays = Number.isFinite(Number(days)) && Number(days) > 0 ? Number(days) : 30;
  return new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000).toISOString();
}

function toNumber(value) {
  return Number(value || 0);
}

/**
 * Group-scoped event RSVP overview for foodie group admins.
 * Parallels getFoodieGroupRedemptionOverview for coupons.
 */
export async function getFoodieGroupEventOverview(groupId, days = 30) {
  const cutoff = buildCutoff(days);

  const rsvpFilters = and(
    eq(event.groupId, groupId),
    eq(event.status, 'published'),
    isNull(event.deletedAt),
    isNull(eventRsvp.deletedAt),
    sql`${eventRsvp.status}::text IN ('going', 'checked_in')`,
    gte(eventRsvp.createdAt, cutoff),
  );

  const [totalRows, topEventRows, upcomingRows] = await Promise.all([
    db
      .select({
        rsvpsLast30Days: sql`COALESCE(SUM(${eventRsvp.attendees}), 0)`.as('rsvps_last_30_days'),
      })
      .from(eventRsvp)
      .innerJoin(event, eq(event.id, eventRsvp.eventId))
      .where(rsvpFilters),

    db
      .select({
        eventId: event.id,
        eventName: event.name,
        merchantName: merchant.name,
        startDatetime: event.startDatetime,
        rsvps: sql`COALESCE(SUM(${eventRsvp.attendees}), 0)`.as('rsvps'),
      })
      .from(eventRsvp)
      .innerJoin(event, eq(event.id, eventRsvp.eventId))
      .innerJoin(merchant, eq(merchant.id, event.merchantId))
      .where(rsvpFilters)
      .groupBy(event.id, event.name, merchant.name, event.startDatetime)
      .orderBy(desc(sql`COALESCE(SUM(${eventRsvp.attendees}), 0)`), asc(event.name), asc(event.id))
      .limit(1),

    db
      .select({ count: count() })
      .from(event)
      .where(
        and(
          eq(event.groupId, groupId),
          eq(event.status, 'published'),
          isNull(event.deletedAt),
          gte(event.startDatetime, new Date().toISOString()),
        ),
      ),
  ]);

  const topEvent = topEventRows[0]
    ? {
        eventId: topEventRows[0].eventId,
        eventName: topEventRows[0].eventName,
        merchantName: topEventRows[0].merchantName,
        startDatetime: topEventRows[0].startDatetime,
        rsvps: toNumber(topEventRows[0].rsvps),
      }
    : null;

  return {
    rsvpsLast30Days: toNumber(totalRows[0]?.rsvpsLast30Days),
    topEvent,
    upcomingPublishedEvents: upcomingRows[0]?.count ?? 0,
  };
}

/**
 * Group-scoped event submission counts by state.
 */
export async function getEventSubmissionCounts(groupId) {
  const rows = await db
    .select({
      state: eventSubmission.state,
      count: count(),
    })
    .from(eventSubmission)
    .where(
      and(
        eq(eventSubmission.groupId, groupId),
        isNull(eventSubmission.deletedAt),
      ),
    )
    .groupBy(eventSubmission.state);

  const result = { pending: 0, approved: 0, rejected: 0 };
  for (const row of rows) {
    if (row.state in result) {
      result[row.state] = Number(row.count);
    }
  }
  return result;
}
