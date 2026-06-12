// server/src/routes/events.js
import express from 'express';
import { db } from '../db.js';
import { event, eventCredit, eventRsvp, merchant, user, eventOrder } from '../schema.js';
import { eq, and, isNull, asc, desc, sql, or, gte } from 'drizzle-orm';
import auth from '../middleware/auth.js';
import { optional as optionalAuth } from '../middleware/auth.js';
import { resolveLocalUser, canManageEvent, canViewEventStats, hasEntitlement } from '../authz/index.js';
import QRCode from 'qrcode';
import {
  assertMerchantPaidEventReady,
  buildCheckinUrl,
  calculateRefundQuote,
  cancelRsvpWithRefund,
  createEventRefundForOrder,
  createPaidEventOrder,
  findEventOrderForRsvp,
  findValidGuestToken,
  getMerchantName,
  makeTicketCode,
  markGuestTokenUsed,
  paidEventPaymentsEnabled,
} from '../services/eventPaymentService.js';
import { buildEventIcs } from '../utils/icsBuilder.js';
import { resolveBaseUrl } from '../utils/appUrl.js';

const router = express.Router();

// ────────────────────────────────────────────────────────────────
// Public reads (no auth required)
// ────────────────────────────────────────────────────────────────

// GET /api/v1/events — published, non-deleted
router.get('/', async (req, res, next) => {
  try {
    const groupId = String(req.query.group_id || '').trim() || null;
    const filters = [
      eq(event.status, 'published'),
      isNull(event.deletedAt),
      or(
        gte(event.endDatetime, sql`NOW()`),
        and(isNull(event.endDatetime), gte(event.startDatetime, sql`NOW()`)),
      ),
    ];
    if (groupId) {
      filters.push(eq(event.groupId, groupId));
    }

    const events = await db
      .select({
        id:              event.id,
        groupId:         event.groupId,
        merchantId:      event.merchantId,
        name:            event.name,
        description:     event.description,
        startDatetime:   event.startDatetime,
        endDatetime:     event.endDatetime,
        location:        event.location,
        capacity:        event.capacity,
        coverImageUrl:   event.coverImageUrl,
        bannerImageUrl:  event.bannerImageUrl,
        slug:            event.slug,
        isFree:          event.isFree,
        priceCents:      event.priceCents,
        visibility:      event.visibility,
        maxTicketsPerGuest: event.maxTicketsPerGuest,
        inviteOnly:      event.inviteOnly,
        status:          event.status,
        createdAt:       event.createdAt,
        merchantName:    merchant.name,
        merchantLogoUrl: merchant.logoUrl,
        confirmedCount:  sql`(SELECT COALESCE(SUM(er.attendees), 0) FROM event_rsvp er WHERE er.event_id = ${event.id} AND er.status::text IN ('going', 'checked_in') AND er.deleted_at IS NULL)`,
      })
      .from(event)
      .leftJoin(merchant, eq(event.merchantId, merchant.id))
      .where(and(...filters))
      .orderBy(asc(event.startDatetime));

    res.json(events);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/events/merchant-insights — per-event RSVP summary for the merchant's events
// MUST be before /:id
router.get('/merchant-insights', auth(), resolveLocalUser, async (req, res, next) => {
  try {
    const dbUser = req.dbUser;
    const rows = await db
      .select({
        eventId:       event.id,
        eventName:     event.name,
        merchantName:  merchant.name,
        startDatetime: event.startDatetime,
        status:        event.status,
        capacity:      event.capacity,
        confirmedRsvps: sql`COALESCE(SUM(CASE WHEN ${eventRsvp.status}::text IN ('going','checked_in') THEN ${eventRsvp.attendees} ELSE 0 END), 0)`.as('confirmed_rsvps'),
        waitlistCount:  sql`COALESCE(SUM(CASE WHEN ${eventRsvp.status}::text = 'waitlist' THEN ${eventRsvp.attendees} ELSE 0 END), 0)`.as('waitlist_count'),
        totalRsvps:     sql`COALESCE(SUM(CASE WHEN ${eventRsvp.status}::text != 'cancelled' THEN ${eventRsvp.attendees} ELSE 0 END), 0)`.as('total_rsvps'),
      })
      .from(event)
      .innerJoin(merchant, eq(event.merchantId, merchant.id))
      .leftJoin(eventRsvp, and(eq(eventRsvp.eventId, event.id), isNull(eventRsvp.deletedAt)))
      .where(and(eq(merchant.ownerId, dbUser.id), isNull(event.deletedAt)))
      .groupBy(event.id, event.name, merchant.name, event.startDatetime, event.status, event.capacity)
      .orderBy(desc(event.startDatetime));

    res.json(rows.map(r => ({
      eventId:       r.eventId,
      eventName:     r.eventName,
      merchantName:  r.merchantName,
      startDatetime: r.startDatetime,
      status:        r.status,
      capacity:      Number(r.capacity),
      confirmedRsvps: Number(r.confirmedRsvps),
      waitlistCount:  Number(r.waitlistCount),
      totalRsvps:     Number(r.totalRsvps),
    })));
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/events/mine — events owned by the authed merchant
// MUST be before /:id to avoid Express matching 'mine' as an id param
router.get('/mine', auth(), resolveLocalUser, async (req, res, next) => {
  try {
    const dbUser = req.dbUser;
    const rows = await db
      .select({
        id:            event.id,
        name:          event.name,
        startDatetime: event.startDatetime,
        endDatetime:   event.endDatetime,
        location:      event.location,
        slug:          event.slug,
        status:        event.status,
        capacity:      event.capacity,
        createdAt:     event.createdAt,
        merchantName:  merchant.name,
      })
      .from(event)
      .leftJoin(merchant, eq(event.merchantId, merchant.id))
      .where(
        and(
          eq(merchant.ownerId, dbUser.id),
          isNull(event.deletedAt),
        ),
      );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/events/my-rsvps — upcoming active RSVPs for the signed-in customer
// MUST be before /:id to avoid Express matching 'my-rsvps' as an id param
router.get('/my-rsvps', auth(), resolveLocalUser, async (req, res, next) => {
  try {
    const dbUser = req.dbUser;
    const rows = await db
      .select({
        id:               eventRsvp.id,
        eventId:          eventRsvp.eventId,
        attendees:        eventRsvp.attendees,
        status:           eventRsvp.status,
        waitlistPosition: eventRsvp.waitlistPosition,
        ticketCode:       eventRsvp.ticketCode,
        createdAt:        eventRsvp.createdAt,
        eventName:        event.name,
        eventSlug:        event.slug,
        startDatetime:    event.startDatetime,
        endDatetime:      event.endDatetime,
        location:         event.location,
        eventStatus:      event.status,
        merchantName:     merchant.name,
        merchantLogoUrl:  merchant.logoUrl,
        orderId:          eventOrder.id,
        orderStatus:      eventOrder.status,
        orderAmountCents: eventOrder.amountCents,
        orderCurrency:    eventOrder.currency,
      })
      .from(eventRsvp)
      .innerJoin(event, eq(eventRsvp.eventId, event.id))
      .leftJoin(merchant, eq(event.merchantId, merchant.id))
      .leftJoin(eventOrder, eq(eventOrder.rsvpId, eventRsvp.id))
      .where(
        and(
          eq(eventRsvp.userId, dbUser.id),
          sql`${eventRsvp.status}::text IN ('going', 'waitlist', 'checked_in')`,
          isNull(eventRsvp.deletedAt),
          isNull(event.deletedAt),
          eq(event.status, 'published'),
          or(
            gte(event.endDatetime, sql`NOW()`),
            and(isNull(event.endDatetime), gte(event.startDatetime, sql`NOW()`)),
          ),
        ),
      )
      .orderBy(asc(event.startDatetime), asc(eventRsvp.createdAt));

    res.json(rows.map(row => ({
      id:               row.id,
      eventId:          row.eventId,
      attendees:        Number(row.attendees),
      status:           row.status,
      waitlistPosition: row.waitlistPosition,
      ticketCode:       row.ticketCode || null,
      createdAt:        row.createdAt,
      eventName:        row.eventName,
      eventSlug:        row.eventSlug,
      startDatetime:    row.startDatetime,
      endDatetime:      row.endDatetime,
      location:         row.location,
      eventStatus:      row.eventStatus,
      merchantName:     row.merchantName,
      merchantLogoUrl:  row.merchantLogoUrl,
      order: row.orderId ? {
        id:          row.orderId,
        status:      row.orderStatus,
        amountCents: Number(row.orderAmountCents || 0),
        currency:    row.orderCurrency,
      } : null,
    })));
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/events/my-credits — the signed-in user's event credits
router.get('/my-credits', auth(), resolveLocalUser, async (req, res, next) => {
  try {
    const dbUser = req.dbUser;
    const rows = await db
      .select({
        id:           eventCredit.id,
        amountCents:  eventCredit.amountCents,
        currency:     eventCredit.currency,
        status:       eventCredit.status,
        expiresAt:    eventCredit.expiresAt,
        redeemedAt:   eventCredit.redeemedAt,
        createdAt:    eventCredit.createdAt,
        merchantName: merchant.name,
      })
      .from(eventCredit)
      .leftJoin(merchant, eq(eventCredit.merchantId, merchant.id))
      .where(
        or(
          eq(eventCredit.userId, dbUser.id),
          dbUser.email ? eq(eventCredit.guestEmail, dbUser.email) : sql`false`,
        ),
      )
      .orderBy(asc(eventCredit.expiresAt));

    res.json(rows.map((row) => ({
      ...row,
      amountCents: Number(row.amountCents),
      // An expired-but-not-yet-swept credit should read as expired.
      status: row.status === 'active' && new Date(row.expiresAt) <= new Date() ? 'expired' : row.status,
    })));
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/events/tickets/:code/qr.png — ticket QR image (no auth: the
// code itself is the bearer secret; this just renders it as a scannable QR).
// Embedded as <img> in confirmation emails and the in-app ticket view.
router.get('/tickets/:code/qr.png', async (req, res, next) => {
  try {
    const code = String(req.params.code || '').trim();
    if (!/^[a-f0-9]{16,32}$/i.test(code)) {
      return res.status(400).json({ error: 'Invalid ticket code' });
    }

    const [rsvp] = await db
      .select({ id: eventRsvp.id, eventId: eventRsvp.eventId })
      .from(eventRsvp)
      .where(eq(eventRsvp.ticketCode, code))
      .limit(1);
    if (!rsvp) return res.status(404).json({ error: 'Ticket not found' });

    const png = await QRCode.toBuffer(buildCheckinUrl(rsvp.eventId, code), {
      type: 'png',
      width: 480,
      margin: 2,
      errorCorrectionLevel: 'M',
    });
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'private, max-age=3600');
    res.send(png);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/events/:id/checkin/:code — door staff looks up a scanned ticket.
// Merchant/admin only. Read-only: shows who the ticket belongs to + status.
router.get('/:id/checkin/:code', auth(), resolveLocalUser, async (req, res, next) => {
  try {
    const allowed = await canManageEvent(req.dbUser, req.params.id);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });

    const code = String(req.params.code || '').trim();
    const [rsvp] = await db
      .select()
      .from(eventRsvp)
      .where(and(eq(eventRsvp.ticketCode, code), eq(eventRsvp.eventId, req.params.id)))
      .limit(1);
    if (!rsvp) return res.status(404).json({ error: 'Ticket not found for this event' });

    const cancelled = rsvp.status === 'cancelled' || !!rsvp.deletedAt;
    res.json({
      rsvpId: rsvp.id,
      guestName: rsvp.guestName || null,
      guestEmail: rsvp.guestEmail || null,
      attendees: Number(rsvp.attendees) || 1,
      status: cancelled ? 'cancelled' : rsvp.status,
      admit: !cancelled && (rsvp.status === 'going' || rsvp.status === 'checked_in'),
      alreadyCheckedIn: rsvp.status === 'checked_in',
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/events/:id/checkin/:code — mark the scanned ticket checked in.
// Merchant/admin only. Rejects cancelled tickets and flags double check-ins.
router.post('/:id/checkin/:code', auth(), resolveLocalUser, async (req, res, next) => {
  try {
    const allowed = await canManageEvent(req.dbUser, req.params.id);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });

    const code = String(req.params.code || '').trim();
    const [rsvp] = await db
      .select()
      .from(eventRsvp)
      .where(and(eq(eventRsvp.ticketCode, code), eq(eventRsvp.eventId, req.params.id)))
      .limit(1);
    if (!rsvp) return res.status(404).json({ error: 'Ticket not found for this event' });

    if (rsvp.status === 'cancelled' || rsvp.deletedAt) {
      return res.status(409).json({ error: 'Ticket was cancelled — do not admit', status: 'cancelled' });
    }
    if (rsvp.status === 'checked_in') {
      return res.status(409).json({ error: 'Ticket already checked in', status: 'already_checked_in' });
    }
    if (rsvp.status !== 'going') {
      return res.status(409).json({ error: `Ticket is not admissible (status: ${rsvp.status})`, status: rsvp.status });
    }

    const [updated] = await db
      .update(eventRsvp)
      .set({ status: 'checked_in', updatedAt: new Date().toISOString() })
      .where(eq(eventRsvp.id, rsvp.id))
      .returning();

    res.json({
      checkedIn: true,
      rsvpId: updated.id,
      guestName: updated.guestName || null,
      attendees: Number(updated.attendees) || 1,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/events/:id/my-rsvp — current user's active RSVP for one event
router.get('/:id/my-rsvp', auth(), resolveLocalUser, async (req, res, next) => {
  try {
    const [rsvp] = await db
      .select({
        id:               eventRsvp.id,
        eventId:          eventRsvp.eventId,
        userId:           eventRsvp.userId,
        attendees:        eventRsvp.attendees,
        status:           eventRsvp.status,
        waitlistPosition: eventRsvp.waitlistPosition,
        ticketCode:       eventRsvp.ticketCode,
        createdAt:        eventRsvp.createdAt,
        updatedAt:        eventRsvp.updatedAt,
        orderId:          eventOrder.id,
        orderStatus:      eventOrder.status,
        orderAmountCents: eventOrder.amountCents,
        orderCurrency:    eventOrder.currency,
      })
      .from(eventRsvp)
      .leftJoin(eventOrder, eq(eventOrder.rsvpId, eventRsvp.id))
      .where(
        and(
          eq(eventRsvp.eventId, req.params.id),
          eq(eventRsvp.userId, req.dbUser.id),
          sql`${eventRsvp.status}::text IN ('going', 'waitlist', 'checked_in')`,
          isNull(eventRsvp.deletedAt),
        ),
      )
      .limit(1);

    if (!rsvp) return res.json(null);

    res.json({
      id:               rsvp.id,
      eventId:          rsvp.eventId,
      userId:           rsvp.userId,
      attendees:        Number(rsvp.attendees),
      status:           rsvp.status,
      waitlistPosition: rsvp.waitlistPosition,
      ticketCode:       rsvp.ticketCode || null,
      createdAt:        rsvp.createdAt,
      updatedAt:        rsvp.updatedAt,
      order: rsvp.orderId ? {
        id:          rsvp.orderId,
        status:      rsvp.orderStatus,
        amountCents: Number(rsvp.orderAmountCents || 0),
        currency:    rsvp.orderCurrency,
      } : null,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/events/slug/:slug — public read by slug
router.get('/slug/:slug', async (req, res, next) => {
  try {
    const [found] = await db
      .select({
        id:              event.id,
        groupId:         event.groupId,
        merchantId:      event.merchantId,
        name:            event.name,
        description:     event.description,
        startDatetime:   event.startDatetime,
        endDatetime:     event.endDatetime,
        location:        event.location,
        capacity:        event.capacity,
        coverImageUrl:   event.coverImageUrl,
        bannerImageUrl:  event.bannerImageUrl,
        slug:            event.slug,
        isFree:          event.isFree,
        priceCents:      event.priceCents,
        membersOnlyPriceCents: event.membersOnlyPriceCents,
        memberAccessToken: event.memberAccessToken,
        visibility:      event.visibility,
        maxTicketsPerGuest: event.maxTicketsPerGuest,
        inviteOnly:      event.inviteOnly,
        status:          event.status,
        createdAt:       event.createdAt,
        merchantName:    merchant.name,
        merchantLogoUrl: merchant.logoUrl,
        confirmedCount:  sql`(SELECT COALESCE(SUM(er.attendees), 0) FROM event_rsvp er WHERE er.event_id = ${event.id} AND er.status::text IN ('going', 'checked_in') AND er.deleted_at IS NULL)`,
      })
      .from(event)
      .leftJoin(merchant, eq(event.merchantId, merchant.id))
      .where(
        and(
          eq(event.slug, req.params.slug),
          eq(event.status, 'published'),
          isNull(event.deletedAt),
        ),
      );

    if (!found) return res.status(404).json({ message: 'Event not found' });

    const memberToken = req.query.member_token || req.headers['x-member-token'];
    if (found.visibility === 'members_only' && found.memberAccessToken) {
      if (!memberToken || memberToken !== found.memberAccessToken) {
        found.membersOnlyPriceCents = null;
      }
    }
    delete found.memberAccessToken;

    res.json(found);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/events/:id — public read by id (published only)
router.get('/:id', async (req, res, next) => {
  try {
    const [found] = await db
      .select({
        id:              event.id,
        groupId:         event.groupId,
        merchantId:      event.merchantId,
        name:            event.name,
        description:     event.description,
        startDatetime:   event.startDatetime,
        endDatetime:     event.endDatetime,
        location:        event.location,
        capacity:        event.capacity,
        coverImageUrl:   event.coverImageUrl,
        bannerImageUrl:  event.bannerImageUrl,
        slug:            event.slug,
        isFree:          event.isFree,
        priceCents:      event.priceCents,
        membersOnlyPriceCents: event.membersOnlyPriceCents,
        memberAccessToken: event.memberAccessToken,
        visibility:      event.visibility,
        maxTicketsPerGuest: event.maxTicketsPerGuest,
        inviteOnly:      event.inviteOnly,
        status:          event.status,
        createdAt:       event.createdAt,
        merchantName:    merchant.name,
        merchantLogoUrl: merchant.logoUrl,
        confirmedCount:  sql`(SELECT COALESCE(SUM(er.attendees), 0) FROM event_rsvp er WHERE er.event_id = ${event.id} AND er.status::text IN ('going', 'checked_in') AND er.deleted_at IS NULL)`,
      })
      .from(event)
      .leftJoin(merchant, eq(event.merchantId, merchant.id))
      .where(and(eq(event.id, req.params.id), eq(event.status, 'published'), isNull(event.deletedAt)));

    if (!found) return res.status(404).json({ message: 'Event not found' });

    // Hide member-only pricing unless the correct token is provided
    const memberToken = req.query.member_token || req.headers['x-member-token'];
    if (found.visibility === 'members_only' && found.memberAccessToken) {
      if (!memberToken || memberToken !== found.memberAccessToken) {
        found.membersOnlyPriceCents = null;
      }
    }
    delete found.memberAccessToken;

    res.json(found);
  } catch (err) {
    next(err);
  }
});

// ────────────────────────────────────────────────────────────────
// Authenticated management
// ────────────────────────────────────────────────────────────────

// PUT /api/v1/events/:id — merchant/admin updates their event
router.put('/:id', auth(), resolveLocalUser, async (req, res, next) => {
  try {
    const allowed = await canManageEvent(req.dbUser, req.params.id);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });

    const {
      name, description, start_datetime, end_datetime,
      location, capacity, status, is_free, price_cents,
      members_only_price_cents, visibility, max_tickets_per_guest,
      invite_only, cover_image_url, banner_image_url,
    } = req.body;

    const updates = { updatedAt: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (start_datetime !== undefined) updates.startDatetime = new Date(start_datetime);
    if (end_datetime !== undefined) updates.endDatetime = end_datetime ? new Date(end_datetime) : null;
    if (location !== undefined) updates.location = location;
    if (capacity !== undefined) updates.capacity = Number(capacity);
    if (status !== undefined) updates.status = status;
    if (is_free !== undefined) updates.isFree = Boolean(is_free);
    if (price_cents !== undefined) updates.priceCents = price_cents ? Math.round(Number(price_cents)) : null;
    if (members_only_price_cents !== undefined) {
      updates.membersOnlyPriceCents = members_only_price_cents ? Math.round(Number(members_only_price_cents)) : null;
    }
    if (visibility !== undefined) updates.visibility = visibility;
    if (max_tickets_per_guest !== undefined) updates.maxTicketsPerGuest = Number(max_tickets_per_guest);
    if (invite_only !== undefined) updates.inviteOnly = Boolean(invite_only);
    if (cover_image_url !== undefined) updates.coverImageUrl = cover_image_url;
    if (banner_image_url !== undefined) updates.bannerImageUrl = banner_image_url;

    const [currentEvent] = await db
      .select({ merchantId: event.merchantId, isFree: event.isFree, priceCents: event.priceCents, status: event.status })
      .from(event)
      .where(and(eq(event.id, req.params.id), isNull(event.deletedAt)))
      .limit(1);
    if (!currentEvent) return res.status(404).json({ message: 'Event not found' });

    const nextIsFree = updates.isFree !== undefined ? updates.isFree : currentEvent.isFree;
    const nextPriceCents = updates.priceCents !== undefined ? updates.priceCents : currentEvent.priceCents;
    const nextStatus = updates.status !== undefined ? updates.status : currentEvent.status;
    const enablingPaidTicketing = nextStatus === 'published' && nextIsFree === false && Number(nextPriceCents || 0) > 0;
    if (enablingPaidTicketing) {
      if (!paidEventPaymentsEnabled()) {
        return res.status(503).json({ error: 'Paid event payments are not enabled' });
      }
      try {
        await assertMerchantPaidEventReady({ merchantId: currentEvent.merchantId });
      } catch (err) {
        return res.status(err.status || 409).json({ error: err.message, code: err.code });
      }
    }

    const [updated] = await db
      .update(event)
      .set(updates)
      .where(eq(event.id, req.params.id))
      .returning();

    if (!updated) return res.status(404).json({ message: 'Event not found' });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/events/:id — soft delete
router.delete('/:id', auth(), resolveLocalUser, async (req, res, next) => {
  try {
    const allowed = await canManageEvent(req.dbUser, req.params.id);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });

    const [deleted] = await db
      .update(event)
      .set({ deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(and(eq(event.id, req.params.id), isNull(event.deletedAt)))
      .returning();

    if (!deleted) return res.status(404).json({ message: 'Event not found' });
    res.json({ message: 'Event deleted' });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/events/:id/cancel — merchant/admin customer-facing event cancellation
router.post('/:id/cancel', auth(), resolveLocalUser, async (req, res, next) => {
  const eventId = req.params.id;
  try {
    const allowed = await canManageEvent(req.dbUser, eventId);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });

    const [foundEvent] = await db
      .select()
      .from(event)
      .where(and(eq(event.id, eventId), isNull(event.deletedAt)))
      .limit(1);
    if (!foundEvent) return res.status(404).json({ message: 'Event not found' });

    const now = new Date().toISOString();
    await db
      .update(event)
      .set({ status: 'cancelled', updatedAt: now })
      .where(eq(event.id, eventId));

    const activeRsvps = await db
      .select()
      .from(eventRsvp)
      .where(
        and(
          eq(eventRsvp.eventId, eventId),
          sql`${eventRsvp.status}::text IN ('going', 'checked_in', 'waitlist')`,
          isNull(eventRsvp.deletedAt),
        ),
      );

    const results = [];
    for (const rsvp of activeRsvps) {
      const order = await findEventOrderForRsvp({ rsvpId: rsvp.id });
      try {
        const result = await cancelRsvpWithRefund({
          rsvp,
          eventRow: foundEvent,
          order,
          requestedByUserId: req.dbUser.id,
          requestedByRole: 'merchant',
          reason: 'event_cancelled',
        });
        results.push({
          rsvpId: rsvp.id,
          orderId: order?.id || null,
          refundAmountCents: result.refund?.amountCents ?? 0,
          refundStatus: result.refund?.status || null,
        });
      } catch (err) {
        results.push({ rsvpId: rsvp.id, orderId: order?.id || null, error: err.message });
      }
    }

    const paidOrdersWithoutRsvps = await db
      .select()
      .from(eventOrder)
      .where(and(eq(eventOrder.eventId, eventId), eq(eventOrder.status, 'paid'), isNull(eventOrder.rsvpId)));

    for (const order of paidOrdersWithoutRsvps) {
      try {
        const amountCents = order.amountCents - Number(order.refundedAmountCents || 0);
        const refund = await createEventRefundForOrder({
          order,
          eventRow: foundEvent,
          amountCents,
          policyWindow: 'merchant_event_cancelled_full_refund',
          reason: 'event_cancelled',
          requestedByUserId: req.dbUser.id,
          requestedByRole: 'merchant',
        });
        results.push({ rsvpId: null, orderId: order.id, refundAmountCents: refund.amountCents, refundStatus: refund.status });
      } catch (err) {
        results.push({ rsvpId: null, orderId: order.id, error: err.message });
      }
    }

    res.json({
      message: 'Event cancelled',
      eventId,
      refundedCount: results.filter((r) => r.refundAmountCents > 0 && !r.error).length,
      results,
    });
  } catch (err) {
    next(err);
  }
});

// ────────────────────────────────────────────────────────────────
// RSVP endpoints
// ────────────────────────────────────────────────────────────────

// POST /api/v1/events/:id/rsvp
router.post('/:id/rsvp', optionalAuth(), async (req, res, next) => {
  const eventId = req.params.id;
  try {
    // Load event (select only needed columns to avoid schema mismatches)
    const [foundEvent] = await db
      .select({
        id:                 event.id,
        groupId:            event.groupId,
        name:               event.name,
        capacity:           event.capacity,
        status:             event.status,
        visibility:         event.visibility,
        maxTicketsPerGuest: event.maxTicketsPerGuest,
        inviteOnly:         event.inviteOnly,
        isFree:             event.isFree,
        priceCents:         event.priceCents,
        membersOnlyPriceCents: event.membersOnlyPriceCents,
        startDatetime:      event.startDatetime,
        merchantId:         event.merchantId,
      })
      .from(event)
      .where(and(eq(event.id, eventId), isNull(event.deletedAt)));
    if (!foundEvent) return res.status(404).json({ message: 'Event not found' });

    if (foundEvent.status !== 'published') {
      return res.status(400).json({ error: 'Event is not accepting RSVPs' });
    }
    if (foundEvent.inviteOnly) {
      return res.status(403).json({ error: 'This event is invite-only and cannot be booked' });
    }

    // Resolve authenticated user from verified JWT (set by optionalAuth)
    let resolvedUserId = null;
    let dbUser = null;
    if (req.user?.sub) {
      const [tokenUser] = await db
        .select({ id: user.id, role: user.role })
        .from(user)
        .where(eq(user.cognitoSub, req.user.sub))
        .limit(1);
      if (tokenUser) {
        resolvedUserId = tokenUser.id;
        dbUser = tokenUser;
      }
    }

    // Members-only events require authentication + coupon book purchase
    if (foundEvent.visibility === 'members_only') {
      if (!resolvedUserId) {
        return res.status(401).json({ error: 'You must be signed in to RSVP for this members-only event' });
      }
      const entitled = await hasEntitlement(dbUser, foundEvent.groupId);
      if (!entitled) {
        return res.status(403).json({ error: 'You must purchase the coupon book to RSVP for this members-only event' });
      }
    }

    const { attendees = 1, guest_name, guest_email } = req.body;
    const ticketCount = Number(attendees) || 1;

    if (ticketCount > foundEvent.maxTicketsPerGuest) {
      return res.status(400).json({
        error: `Maximum ${foundEvent.maxTicketsPerGuest} ticket(s) per guest`,
      });
    }

    // Block duplicate RSVPs for authenticated users
    if (resolvedUserId) {
      const [existing] = await db
        .select({ id: eventRsvp.id })
        .from(eventRsvp)
        .where(
          and(
            eq(eventRsvp.eventId, eventId),
            eq(eventRsvp.userId, resolvedUserId),
            isNull(eventRsvp.deletedAt),
          ),
        )
        .limit(1);
      if (existing) {
        return res.status(409).json({ error: 'You have already RSVP\'d to this event' });
      }
    }

    // Block duplicate guest RSVPs by email
    if (!resolvedUserId && guest_email) {
      const [existingGuest] = await db
        .select({ id: eventRsvp.id })
        .from(eventRsvp)
        .where(
          and(
            eq(eventRsvp.eventId, eventId),
            eq(eventRsvp.guestEmail, guest_email),
            isNull(eventRsvp.deletedAt),
          ),
        )
        .limit(1);
      if (existingGuest) {
        return res.status(409).json({ error: 'An RSVP with this email already exists for this event' });
      }
    }

    const isPaidEvent = foundEvent.isFree === false && Number(foundEvent.priceCents || 0) > 0;

    if (isPaidEvent) {
      const duplicateFilters = [
        eq(eventOrder.eventId, eventId),
        sql`${eventOrder.status}::text IN ('pending_payment', 'paid')`,
      ];
      if (resolvedUserId) {
        duplicateFilters.push(eq(eventOrder.userId, resolvedUserId));
      } else if (guest_email) {
        duplicateFilters.push(sql`LOWER(${eventOrder.guestEmail}) = LOWER(${guest_email})`);
      }

      if (duplicateFilters.length > 2) {
        const [existingPaidOrder] = await db
          .select({ id: eventOrder.id })
          .from(eventOrder)
          .where(and(...duplicateFilters))
          .limit(1);
        if (existingPaidOrder) {
          return res.status(409).json({ error: 'An active paid ticket order already exists for this event' });
        }
      }
    }

    // Count confirmed RSVPs to determine capacity
    const confirmed = await db
      .select({ attendees: eventRsvp.attendees })
      .from(eventRsvp)
      .where(
        and(
          eq(eventRsvp.eventId, eventId),
            sql`${eventRsvp.status}::text IN ('going', 'checked_in')`,
          isNull(eventRsvp.deletedAt),
        ),
      );
    const confirmedCount = confirmed.reduce((sum, r) => sum + (r.attendees || 0), 0);
    let heldPaidSeats = 0;
    if (isPaidEvent) {
      const heldOrders = await db
        .select({ quantity: eventOrder.quantity })
        .from(eventOrder)
        .where(and(eq(eventOrder.eventId, eventId), eq(eventOrder.status, 'pending_payment')));
      heldPaidSeats = heldOrders.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    }
    const remaining = foundEvent.capacity > 0 ? foundEvent.capacity - confirmedCount - heldPaidSeats : Infinity;
    const status = remaining >= ticketCount ? 'going' : 'waitlist';

    // Assign waitlist position if needed
    let waitlistPosition = null;
    if (status === 'waitlist') {
      const waitlisted = await db
        .select({ waitlistPosition: eventRsvp.waitlistPosition })
        .from(eventRsvp)
        .where(
          and(
            eq(eventRsvp.eventId, eventId),
            eq(eventRsvp.status, 'waitlist'),
            isNull(eventRsvp.deletedAt),
          ),
        );
      const maxPos = waitlisted.reduce((m, r) => Math.max(m, r.waitlistPosition || 0), 0);
      waitlistPosition = maxPos + 1;
    }

    if (isPaidEvent && status === 'waitlist') {
      return res.status(409).json({ error: 'No paid tickets are currently available for this event' });
    }

    if (isPaidEvent && status === 'going') {
      if (!paidEventPaymentsEnabled()) {
        return res.status(503).json({ error: 'Paid event payments are not enabled' });
      }
      if (!resolvedUserId && !guest_email) {
        return res.status(400).json({ error: 'Guest email is required for paid event tickets' });
      }

      const refundPolicyAcknowledgedAt = req.body.refund_policy_acknowledged_at
        || (req.body.refund_policy_accepted ? new Date().toISOString() : null);

      try {
        const payment = await createPaidEventOrder({
          eventRow: foundEvent,
          dbUser,
          attendees: ticketCount,
          guestName: guest_name || null,
          guestEmail: guest_email || dbUser?.email || null,
          refundPolicyAcknowledgedAt,
          baseUrl: resolveBaseUrl(req),
          useCredit: typeof req.body.use_credit === 'boolean' ? req.body.use_credit : null,
        });

        if (payment.requiresCreditDecision) {
          // No order was created — the guest must choose whether to spend
          // their event credit. Frontend prompts, then resubmits with
          // use_credit: true|false.
          return res.status(200).json({
            requiresCreditDecision: true,
            credit: payment.credit,
            ticketTotalCents: payment.ticketTotalCents,
            currency: payment.currency,
          });
        }

        if (payment.paidWithCredit) {
          return res.status(201).json({
            requiresPayment: false,
            paidWithCredit: true,
            status: 'paid',
            orderId: payment.order.id,
            rsvpId: payment.order.rsvpId || null,
            creditAppliedCents: payment.creditAppliedCents,
            amountCents: payment.amountCents,
            currency: payment.currency,
          });
        }

        return res.status(201).json({
          requiresPayment: true,
          status: 'pending_payment',
          orderId: payment.order.id,
          checkoutUrl: payment.checkoutUrl,
          checkoutSessionId: payment.checkoutSessionId,
          amountCents: payment.amountCents,
          currency: payment.currency,
        });
      } catch (err) {
        return res.status(err.status || 500).json({ error: err.message, code: err.code });
      }
    }

    const [rsvp] = await db
      .insert(eventRsvp)
      .values({
        eventId,
        userId:          resolvedUserId,
        attendees:       ticketCount,
        status,
        waitlistPosition,
        guestName:       guest_name || null,
        guestEmail:      guest_email || null,
        // Every RSVP gets a QR ticket code; check-in only admits 'going',
        // so waitlisted codes are inert until promotion.
        ticketCode:      makeTicketCode(),
      })
      .returning();

    res.status(201).json(rsvp);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/events/:id/attendees — merchant/admin only
router.get('/:id/attendees', auth(), resolveLocalUser, async (req, res, next) => {
  try {
    const allowed = await canManageEvent(req.dbUser, req.params.id);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });

    // Cancelled RSVPs set deletedAt, but door staff need to SEE them (so a
    // cancelled guest presenting an old QR is recognizably denied) — include
    // them alongside live rows instead of hiding them.
    const attendees = await db
      .select({
        id:              eventRsvp.id,
        eventId:         eventRsvp.eventId,
        userId:          eventRsvp.userId,
        attendees:       eventRsvp.attendees,
        status:          eventRsvp.status,
        waitlistPosition: eventRsvp.waitlistPosition,
        guestName:       eventRsvp.guestName,
        guestEmail:      eventRsvp.guestEmail,
        ticketCode:      eventRsvp.ticketCode,
        createdAt:       eventRsvp.createdAt,
        userName:        user.name,
        userEmail:       user.email,
      })
      .from(eventRsvp)
      .leftJoin(user, eq(eventRsvp.userId, user.id))
      .where(and(
        eq(eventRsvp.eventId, req.params.id),
        or(isNull(eventRsvp.deletedAt), eq(eventRsvp.status, 'cancelled')),
      ))
      .orderBy(asc(eventRsvp.createdAt));

    res.json(attendees);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/rsvp/cancel-by-token', async (req, res, next) => {
  try {
    const token = String(req.query.token || '').trim();
    const tokenRow = await findValidGuestToken({ rawToken: token, purpose: 'cancellation' });
    if (!tokenRow || tokenRow.eventId !== req.params.id) {
      return res.status(404).json({ error: 'Cancellation link is invalid or expired' });
    }

    const [rsvp] = await db.select().from(eventRsvp).where(eq(eventRsvp.id, tokenRow.eventRsvpId)).limit(1);
    const [foundEvent] = await db.select().from(event).where(eq(event.id, tokenRow.eventId)).limit(1);
    const order = tokenRow.eventOrderId ? await findEventOrderForRsvp({ rsvpId: tokenRow.eventRsvpId }) : null;

    // Quote what the guest would receive if they cancel right now, so the
    // cancel page can show cash/credit amounts before they confirm.
    const refundQuote = foundEvent && order && order.status === 'paid'
      ? calculateRefundQuote(
          foundEvent.startDatetime,
          order.amountCents - Number(order.refundedAmountCents || 0),
        )
      : null;

    res.json({
      valid: true,
      event: foundEvent ? {
        id: foundEvent.id,
        name: foundEvent.name,
        startDatetime: foundEvent.startDatetime,
      } : null,
      rsvp: rsvp ? {
        id: rsvp.id,
        attendees: rsvp.attendees,
        status: rsvp.status,
        guestEmail: rsvp.guestEmail,
      } : null,
      order: order ? {
        id: order.id,
        amountCents: order.amountCents,
        refundedAmountCents: order.refundedAmountCents,
        status: order.status,
      } : null,
      refundQuote,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/rsvp/cancel-by-token', async (req, res, next) => {
  try {
    const token = String(req.body?.token || '').trim();
    const tokenRow = await findValidGuestToken({ rawToken: token, purpose: 'cancellation' });
    if (!tokenRow || tokenRow.eventId !== req.params.id || !tokenRow.eventRsvpId) {
      return res.status(403).json({ error: 'Cancellation link is invalid or expired' });
    }

    const [rsvp] = await db
      .select()
      .from(eventRsvp)
      .where(and(eq(eventRsvp.id, tokenRow.eventRsvpId), eq(eventRsvp.eventId, req.params.id), isNull(eventRsvp.deletedAt)))
      .limit(1);
    if (!rsvp) return res.status(404).json({ message: 'RSVP not found' });

    const [foundEvent] = await db
      .select()
      .from(event)
      .where(and(eq(event.id, req.params.id), isNull(event.deletedAt)))
      .limit(1);
    if (!foundEvent) return res.status(404).json({ message: 'Event not found' });

    const order = await findEventOrderForRsvp({ rsvpId: rsvp.id });
    const compensation = req.body?.compensation === 'credit' ? 'credit' : 'cash';
    const result = await cancelRsvpWithRefund({
      rsvp,
      eventRow: foundEvent,
      order,
      requestedByRole: 'guest',
      reason: 'customer_cancelled',
      compensation,
    });
    await markGuestTokenUsed({ tokenId: tokenRow.id });

    res.json({
      message: 'RSVP cancelled',
      cancelled: true,
      refundAmountCents: result.refund?.amountCents ?? 0,
      refundStatus: result.refund?.status || null,
      refundPolicyWindow: result.refundQuote?.policyWindow || null,
      refundPolicyReason: result.refundQuote?.reason || null,
      creditAmountCents: result.credit?.amountCents ?? 0,
      creditExpiresAt: result.credit?.expiresAt || null,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/events/:id/rsvp/:rsvpId/cancel-preview — what would the guest
// receive if they cancelled right now? Powers the in-page confirm dialog.
// Auth: RSVP owner or event manager.
router.get('/:id/rsvp/:rsvpId/cancel-preview', auth(), resolveLocalUser, async (req, res, next) => {
  const { id: eventId, rsvpId } = req.params;
  try {
    const [rsvp] = await db
      .select()
      .from(eventRsvp)
      .where(and(eq(eventRsvp.id, rsvpId), eq(eventRsvp.eventId, eventId), isNull(eventRsvp.deletedAt)))
      .limit(1);
    if (!rsvp) return res.status(404).json({ message: 'RSVP not found' });

    const managerAllowed = await canManageEvent(req.dbUser, eventId);
    const ownerAllowed = rsvp.userId && rsvp.userId === req.dbUser?.id;
    if (!managerAllowed && !ownerAllowed) {
      return res.status(403).json({ error: 'Not authorized to preview this cancellation' });
    }

    const [foundEvent] = await db
      .select()
      .from(event)
      .where(and(eq(event.id, eventId), isNull(event.deletedAt)))
      .limit(1);
    if (!foundEvent) return res.status(404).json({ message: 'Event not found' });

    const order = await findEventOrderForRsvp({ rsvpId });
    const refundQuote = order && order.status === 'paid'
      ? calculateRefundQuote(
          foundEvent.startDatetime,
          order.amountCents - Number(order.refundedAmountCents || 0),
        )
      : null;

    res.json({
      rsvpId: rsvp.id,
      attendees: Number(rsvp.attendees) || 1,
      order: order ? { id: order.id, amountCents: order.amountCents, status: order.status, currency: order.currency } : null,
      refundQuote,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/events/:id/rsvp/:rsvpId/calendar.ics
// Auth: a signed-in user who owns the RSVP. The n8n email flow does not call
// this route; it receives the .ics body inline in the notification webhook
// payload, so no out-of-band token mechanism is needed.
router.get('/:id/rsvp/:rsvpId/calendar.ics', auth(), resolveLocalUser, async (req, res, next) => {
  const { id: eventId, rsvpId } = req.params;
  try {
    const [rsvp] = await db
      .select()
      .from(eventRsvp)
      .where(and(eq(eventRsvp.id, rsvpId), eq(eventRsvp.eventId, eventId)))
      .limit(1);
    if (!rsvp) return res.status(404).json({ message: 'RSVP not found' });

    const [foundEvent] = await db
      .select()
      .from(event)
      .where(and(eq(event.id, eventId), isNull(event.deletedAt)))
      .limit(1);
    if (!foundEvent) return res.status(404).json({ message: 'Event not found' });

    if (!rsvp.userId || rsvp.userId !== req.dbUser?.id) {
      return res.status(403).json({ error: 'Not authorized to download this calendar invite' });
    }

    const order = await findEventOrderForRsvp({ rsvpId });
    const method = rsvp.status === 'cancelled' || rsvp.deletedAt ? 'CANCEL' : 'REQUEST';
    const base = resolveBaseUrl(req).replace(/\/$/, '');
    const eventUrl = foundEvent.slug ? `${base}/e/${foundEvent.slug}` : `${base}/events/${foundEvent.id}`;

    const icsBody = buildEventIcs({
      event: foundEvent,
      rsvp,
      order,
      method,
      eventUrl,
      organizerName: await getMerchantName({ merchantId: foundEvent.merchantId }),
    });

    const filename = `vivaspot-${foundEvent.slug || foundEvent.id}.ics`;
    res.setHeader('Content-Type', `text/calendar; method=${method}; charset=utf-8`);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.send(icsBody);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/events/:id/rsvp/:rsvpId/cancel
// Requires either authenticated ownership/management or a valid guest cancellation token.
router.post('/:id/rsvp/:rsvpId/cancel', optionalAuth(), async (req, res, next) => {
  const { id: eventId, rsvpId } = req.params;
  try {
    const [rsvp] = await db
      .select()
      .from(eventRsvp)
      .where(and(eq(eventRsvp.id, rsvpId), eq(eventRsvp.eventId, eventId), isNull(eventRsvp.deletedAt)));
    if (!rsvp) return res.status(404).json({ message: 'RSVP not found' });

    const [foundEvent] = await db
      .select()
      .from(event)
      .where(and(eq(event.id, eventId), isNull(event.deletedAt)))
      .limit(1);
    if (!foundEvent) return res.status(404).json({ message: 'Event not found' });

    let dbUser = null;
    if (req.user?.sub) {
      [dbUser] = await db.select().from(user).where(eq(user.cognitoSub, req.user.sub)).limit(1);
    }

    let requestedByRole = 'guest';
    let guestTokenRow = null;
    if (req.body?.token) {
      guestTokenRow = await findValidGuestToken({
        rawToken: req.body.token,
        purpose: 'cancellation',
      });
      if (!guestTokenRow || guestTokenRow.eventRsvpId !== rsvp.id) {
        return res.status(403).json({ error: 'Invalid or expired cancellation token' });
      }
    } else {
      const managerAllowed = dbUser ? await canManageEvent(dbUser, eventId) : false;
      const ownerAllowed = dbUser && rsvp.userId && rsvp.userId === dbUser.id;
      if (!managerAllowed && !ownerAllowed) {
        return res.status(401).json({ error: 'Sign in or provide a valid cancellation token to cancel this RSVP' });
      }
      requestedByRole = managerAllowed && !ownerAllowed ? 'merchant' : 'customer';
    }

    const order = await findEventOrderForRsvp({ rsvpId });
    const result = await cancelRsvpWithRefund({
      rsvp,
      eventRow: foundEvent,
      order,
      requestedByUserId: dbUser?.id || null,
      requestedByRole,
      reason: requestedByRole === 'merchant' ? 'merchant_cancelled_rsvp' : 'customer_cancelled',
      compensation: req.body?.compensation === 'credit' ? 'credit' : 'cash',
    });

    if (guestTokenRow) {
      await markGuestTokenUsed({ tokenId: guestTokenRow.id });
    }

    res.json({
      message: 'RSVP cancelled',
      cancelled: true,
      refundAmountCents: result.refund?.amountCents ?? 0,
      refundStatus: result.refund?.status || null,
      refundPolicyWindow: result.refundQuote?.policyWindow || null,
      refundPolicyReason: result.refundQuote?.reason || null,
      creditAmountCents: result.credit?.amountCents ?? 0,
      creditExpiresAt: result.credit?.expiresAt || null,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/events/:id/rsvp/:rsvpId/promote — admin promotes a waitlisted RSVP
router.post('/:id/rsvp/:rsvpId/promote', auth(), resolveLocalUser, async (req, res, next) => {
  const { id: eventId, rsvpId } = req.params;
  try {
    const allowed = await canManageEvent(req.dbUser, eventId);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });

    const [rsvp] = await db
      .select()
      .from(eventRsvp)
      .where(and(eq(eventRsvp.id, rsvpId), eq(eventRsvp.eventId, eventId), isNull(eventRsvp.deletedAt)));
    if (!rsvp) return res.status(404).json({ message: 'RSVP not found' });

    if (rsvp.status !== 'waitlist') {
      return res.status(400).json({ error: `Cannot promote an RSVP with status '${rsvp.status}'` });
    }

    const [foundEvent] = await db
      .select({ id: event.id, capacity: event.capacity, isFree: event.isFree, priceCents: event.priceCents })
      .from(event)
      .where(and(eq(event.id, eventId), isNull(event.deletedAt)));
    if (!foundEvent) return res.status(404).json({ message: 'Event not found' });

    if (foundEvent.isFree === false && Number(foundEvent.priceCents || 0) > 0) {
      return res.status(409).json({ error: 'Paid event waitlist promotion requires collecting payment first' });
    }

    if (foundEvent.capacity > 0) {
      const confirmed = await db
        .select({ attendees: eventRsvp.attendees })
        .from(eventRsvp)
        .where(
          and(
            eq(eventRsvp.eventId, eventId),
            sql`${eventRsvp.status}::text IN ('going', 'checked_in')`,
            isNull(eventRsvp.deletedAt),
          ),
        );
      const confirmedCount = confirmed.reduce((sum, row) => sum + (row.attendees || 0), 0);
      const remaining = foundEvent.capacity - confirmedCount;
      if (remaining < (rsvp.attendees || 1)) {
        return res.status(400).json({ error: 'No remaining capacity to promote this attendee' });
      }
    }

    const [promoted] = await db
      .update(eventRsvp)
      .set({ status: 'going', waitlistPosition: null, updatedAt: new Date().toISOString() })
      .where(eq(eventRsvp.id, rsvpId))
      .returning();

    res.json(promoted);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/events/:id/rsvp/:rsvpId/status — manager updates attendance outcome
router.patch('/:id/rsvp/:rsvpId/status', auth(), resolveLocalUser, async (req, res, next) => {
  const { id: eventId, rsvpId } = req.params;
  try {
    const allowed = await canManageEvent(req.dbUser, eventId);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });

    const status = String(req.body?.status || '').trim();
    const allowedStatuses = new Set(['checked_in', 'no_show', 'cancelled', 'going', 'waitlist']);
    if (!allowedStatuses.has(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    const [existing] = await db
      .select()
      .from(eventRsvp)
      .where(and(eq(eventRsvp.id, rsvpId), eq(eventRsvp.eventId, eventId), isNull(eventRsvp.deletedAt)));
    if (!existing) return res.status(404).json({ message: 'RSVP not found' });

    if (status === 'waitlist') {
      const waitlisted = await db
        .select({ waitlistPosition: eventRsvp.waitlistPosition })
        .from(eventRsvp)
        .where(and(eq(eventRsvp.eventId, eventId), eq(eventRsvp.status, 'waitlist'), isNull(eventRsvp.deletedAt)));
      const maxPos = waitlisted.reduce((m, row) => Math.max(m, row.waitlistPosition || 0), 0);
      const [updated] = await db
        .update(eventRsvp)
        .set({ status: 'waitlist', waitlistPosition: maxPos + 1, updatedAt: new Date().toISOString() })
        .where(eq(eventRsvp.id, rsvpId))
        .returning();
      return res.json(updated);
    }

    const [updated] = await db
      .update(eventRsvp)
      .set({ status, waitlistPosition: null, updatedAt: new Date().toISOString() })
      .where(eq(eventRsvp.id, rsvpId))
      .returning();
    return res.json(updated);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/events/:id/stats — aggregate performance stats (no PII)
// Accessible by: super_admin, merchant owner, or foodie group admin for the event's group
router.get('/:id/stats', auth(), resolveLocalUser, async (req, res, next) => {
  const { id: eventId } = req.params;
  try {
    const allowed = await canViewEventStats(req.dbUser, eventId);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });

    const [foundEvent] = await db
      .select({ id: event.id, capacity: event.capacity, name: event.name })
      .from(event)
      .where(and(eq(event.id, eventId), isNull(event.deletedAt)));
    if (!foundEvent) return res.status(404).json({ message: 'Event not found' });

    const rows = await db
      .select({ status: eventRsvp.status, attendees: eventRsvp.attendees })
      .from(eventRsvp)
      .where(and(eq(eventRsvp.eventId, eventId), isNull(eventRsvp.deletedAt)));

    const totals = {
      totalRsvps: 0,
      confirmedSeats: 0,
      waitlistCount: 0,
      cancellations: 0,
      checkedIns: 0,
      noShows: 0,
    };

    for (const row of rows) {
      const attendees = Number(row.attendees || 0);
      totals.totalRsvps += attendees;
      if (row.status === 'going') totals.confirmedSeats += attendees;
      if (row.status === 'checked_in') {
        totals.confirmedSeats += attendees;
        totals.checkedIns += attendees;
      }
      if (row.status === 'waitlist') totals.waitlistCount += attendees;
      if (row.status === 'cancelled') totals.cancellations += attendees;
      if (row.status === 'no_show') totals.noShows += attendees;
    }

    const attendanceBase = totals.checkedIns + totals.noShows;
    const attendanceRate = attendanceBase > 0 ? Number((totals.checkedIns / attendanceBase).toFixed(4)) : 0;
    const capacityFillPercent = foundEvent.capacity > 0
      ? Number(Math.min(1, totals.confirmedSeats / foundEvent.capacity).toFixed(4))
      : null;

    return res.json({
      eventId,
      eventName: foundEvent.name,
      capacity: foundEvent.capacity,
      ...totals,
      attendanceRate,
      capacityFillPercent,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
