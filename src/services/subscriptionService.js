/**
 * src/services/subscriptionService.js
 *
 * API helpers for subscription and gift flows.
 */

import apiService from './apiService.js';

/**
 * Get the group's current price (includes billingInterval for subscription groups).
 * @param {string} groupId - Group UUID or slug
 */
export async function getGroupPrice(groupId) {
  const response = await apiService.get(`/groups/${groupId}/price`);
  return response.data;
}

/**
 * Initiate a gift checkout for a recipient. With multi-tier pricing the
 * gifter can pick any active tier (monthly / 6mo / annual); omitting
 * `couponBookPriceId` falls back to the group's default tier on the server.
 * @param {string} groupId - Group UUID or slug
 * @param {string} recipientEmail - Email of the gift recipient
 * @param {{ couponBookPriceId?: string }} [opts]
 * @returns {{ checkoutUrl: string, sessionId: string, recipientEmail: string }}
 */
export async function initiateGiftCheckout(groupId, recipientEmail, opts = {}) {
  const body = { recipientEmail };
  if (opts.couponBookPriceId) body.couponBookPriceId = opts.couponBookPriceId;
  const response = await apiService.post(`/groups/${groupId}/gift`, body);
  return response.data;
}

/**
 * List pricing tiers for a group. By default only published tiers are
 * returned; admins can pass { includeDrafts: true } to also see suggested
 * draft tiers from the seed script.
 * @param {string} groupId - Group UUID or slug
 * @param {{ includeDrafts?: boolean }} [opts]
 * @returns {Promise<{ groupId: string, billingModel: string, tiers: Array }>}
 */
export async function listGroupPrices(groupId, opts = {}) {
  const qs = opts.includeDrafts ? '?include=all' : '';
  const response = await apiService.get(`/groups/${groupId}/prices${qs}`);
  return response.data;
}

/**
 * Create a new pricing tier on a group. Admins use this from the tier list
 * editor. Pass status='draft' to skip Stripe Price creation, or 'active' to
 * create the Stripe Price(s) immediately.
 * @param {string} groupId
 * @param {object} tier - { label, amountCents, billingInterval, billingIntervalCount, status, isDefault, sortOrder, currency }
 */
export async function createTier(groupId, tier) {
  const response = await apiService.post(`/groups/${groupId}/prices`, tier);
  return response.data;
}

/**
 * Patch a tier's label / sort / default / status. Use this to publish a
 * draft (status: 'active') or to promote a tier to the group's default.
 * @param {string} groupId
 * @param {string} priceId
 * @param {object} patch - subset of { label, sortOrder, isDefault, status }
 */
export async function updateTier(groupId, priceId, patch) {
  const response = await apiService.patch(`/groups/${groupId}/prices/${priceId}`, patch);
  return response.data;
}

/**
 * Archive a tier so it disappears from the user-facing plan picker.
 * Existing Stripe subscriptions on that tier keep renewing.
 */
export async function archiveTier(groupId, priceId) {
  const response = await apiService.delete(`/groups/${groupId}/prices/${priceId}`);
  return response.data;
}

/**
 * Convenience: promote a tier to the group's default. Equivalent to
 * updateTier(groupId, priceId, { isDefault: true }).
 */
export async function setDefaultTier(groupId, priceId) {
  return updateTier(groupId, priceId, { isDefault: true });
}

/**
 * Kick off a Stripe Checkout for a group's coupon book. Pass an explicit
 * `couponBookPriceId` for multi-tier subscription groups so the server lines
 * up the right Stripe Price; omit it to fall back to the default tier.
 * @param {string} groupId
 * @param {{ couponBookPriceId?: string }} [opts]
 */
export async function startCheckout(groupId, opts = {}) {
  const body = {};
  if (opts.couponBookPriceId) body.couponBookPriceId = opts.couponBookPriceId;
  const response = await apiService.post(`/groups/${groupId}/checkout`, body);
  return response.data;
}

/**
 * Get the current user's active purchases (includes subscription status).
 * @returns {Array} List of purchase objects with subscription fields
 */
export async function getMyPurchases() {
  const response = await apiService.get('/groups/my/purchases');
  return response.data;
}

/**
 * Check if the current user has access to a specific group.
 * @param {string} groupId - Group UUID or slug
 * @returns {{ hasAccess: boolean }}
 */
export async function checkGroupAccess(groupId) {
  const response = await apiService.get(`/groups/${groupId}/access`);
  return response.data;
}

/**
 * Determine the display label for a subscription billing interval.
 * @param {string|null} interval - 'month' or 'year'
 * @param {number|null} count - interval count
 * @returns {string}
 */
export function formatBillingCadence(interval, count) {
  if (!interval) return 'One-time';
  if (interval === 'month') {
    if (count === 1) return 'Monthly';
    if (count === 6) return 'Every 6 months';
    if (count === 12) return 'Yearly';
    return `Every ${count} months`;
  }
  if (interval === 'year') {
    if (count === 1) return 'Yearly';
    return `Every ${count} years`;
  }
  return 'Subscription';
}

/**
 * Returns true if a purchase is an active subscription.
 */
export function isActiveSubscription(purchase) {
  return purchase?.subscriptionStatus === 'active' && purchase?.status === 'paid';
}

/**
 * Create a Stripe Customer Portal session and return its hosted URL. The UI
 * should redirect the browser to the returned URL so the customer can manage
 * their subscription (update card, cancel, view invoices).
 * @param {string} groupId - Group UUID or slug of the subscription being managed
 * @returns {Promise<{ portalUrl: string }>}
 */
export async function createBillingPortalSession(groupId) {
  const response = await apiService.post(`/groups/${groupId}/billing-portal`, {});
  return response.data;
}

/**
 * Returns true if a subscription is in the past-due grace window.
 */
export function isPastDueGrace(purchase) {
  if (purchase?.subscriptionStatus !== 'past_due') return false;
  const periodEnd = purchase?.currentPeriodEnd;
  if (!periodEnd) return false;
  const graceCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  return new Date(periodEnd) > graceCutoff;
}
