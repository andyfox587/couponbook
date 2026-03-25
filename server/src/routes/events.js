// server/src/routes/events.js
import express from 'express';
import { db } from '../db.js';
import { event, eventRsvp, merchant, user } from '../schema.js';
import { eq, and, isNull, asc, sql } from 'drizzle-orm';
import auth from '../middleware/auth.js';
import { resolveLocalUser, canManageEvent } from '../authz/index.js';

const router = express.Router();

// ────────────────────────────────────────────────────────────────
// Public reads (no auth required)
// ────────────────────────────────────────────────────────────────

// GET /api/v1/events — published, non-deleted
router.get('/', async (req, res, next) => {
  try {
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
        confirmedCount:  sql`(SELECT COALESCE(SUM(er.attendees), 0) FROM event_rsvp er WHERE er.event_id = ${event.id} AND er.status = 'going' AND er.deleted_at IS NULL)`,
      })
      .from(event)
      .leftJoin(merchant, eq(event.merchantId, merchant.id))
      .where(and(eq(event.status, 'published'), isNull(event.deletedAt)));

    res.json(events);
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
        confirmedCount:  sql`(SELECT COALESCE(SUM(er.attendees), 0) FROM event_rsvp er WHERE er.event_id = ${event.id} AND er.status = 'going' AND er.deleted_at IS NULL)`,
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
        confirmedCount:  sql`(SELECT COALESCE(SUM(er.attendees), 0) FROM event_rsvp er WHERE er.event_id = ${event.id} AND er.status = 'going' AND er.deleted_at IS NULL)`,
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

// ────────────────────────────────────────────────────────────────
// RSVP endpoints
// ────────────────────────────────────────────────────────────────

// POST /api/v1/events/:id/rsvp
router.post('/:id/rsvp', async (req, res, next) => {
  const eventId = req.params.id;
  try {
    // Load event
    const [foundEvent] = await db
      .select()
      .from(event)
      .where(and(eq(event.id, eventId), isNull(event.deletedAt)));
    if (!foundEvent) return res.status(404).json({ message: 'Event not found' });

    if (foundEvent.status !== 'published') {
      return res.status(400).json({ error: 'Event is not accepting RSVPs' });
    }
    if (foundEvent.inviteOnly) {
      return res.status(403).json({ error: 'This event is invite-only and cannot be booked' });
    }

    const { attendees = 1, guest_name, guest_email, user_id } = req.body;
    const ticketCount = Number(attendees) || 1;

    if (ticketCount > foundEvent.maxTicketsPerGuest) {
      return res.status(400).json({
        error: `Maximum ${foundEvent.maxTicketsPerGuest} ticket(s) per guest`,
      });
    }

    // Resolve authenticated user from Bearer token if present
    let resolvedUserId = user_id || null;
    const bearerToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (bearerToken) {
      const [tokenUser] = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.cognitoSub, bearerToken))
        .limit(1);
      if (tokenUser) resolvedUserId = tokenUser.id;
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

    // Count confirmed RSVPs to determine capacity
    const confirmed = await db
      .select({ attendees: eventRsvp.attendees })
      .from(eventRsvp)
      .where(
        and(
          eq(eventRsvp.eventId, eventId),
          eq(eventRsvp.status, 'going'),
          isNull(eventRsvp.deletedAt),
        ),
      );
    const confirmedCount = confirmed.reduce((sum, r) => sum + (r.attendees || 0), 0);
    const remaining = foundEvent.capacity > 0 ? foundEvent.capacity - confirmedCount : Infinity;
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
        createdAt:       eventRsvp.createdAt,
        userName:        user.name,
        userEmail:       user.email,
      })
      .from(eventRsvp)
      .leftJoin(user, eq(eventRsvp.userId, user.id))
      .where(and(eq(eventRsvp.eventId, req.params.id), isNull(eventRsvp.deletedAt)))
      .orderBy(asc(eventRsvp.createdAt));

    res.json(attendees);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/events/:id/rsvp/:rsvpId/cancel
router.post('/:id/rsvp/:rsvpId/cancel', async (req, res, next) => {
  const { id: eventId, rsvpId } = req.params;
  try {
    const [rsvp] = await db
      .select()
      .from(eventRsvp)
      .where(and(eq(eventRsvp.id, rsvpId), eq(eventRsvp.eventId, eventId), isNull(eventRsvp.deletedAt)));
    if (!rsvp) return res.status(404).json({ message: 'RSVP not found' });

    const wasConfirmed = rsvp.status === 'going';

    // Soft-delete the RSVP
    await db
      .update(eventRsvp)
      .set({ status: 'cancelled', deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(eq(eventRsvp.id, rsvpId));

    // Promote earliest waitlisted RSVP if a confirmed spot opened up
    if (wasConfirmed) {
      const [earliest] = await db
        .select()
        .from(eventRsvp)
        .where(
          and(
            eq(eventRsvp.eventId, eventId),
            eq(eventRsvp.status, 'waitlist'),
            isNull(eventRsvp.deletedAt),
          ),
        )
        .orderBy(asc(eventRsvp.waitlistPosition))
        .limit(1);

      if (earliest) {
        await db
          .update(eventRsvp)
          .set({ status: 'going', waitlistPosition: null, updatedAt: new Date().toISOString() })
          .where(eq(eventRsvp.id, earliest.id));
      }
    }

    res.json({ message: 'RSVP cancelled' });
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

export default router;
