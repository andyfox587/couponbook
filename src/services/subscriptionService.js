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
 * Initiate a gift subscription checkout for a recipient.
 * @param {string} groupId - Group UUID or slug
 * @param {string} recipientEmail - Email of the gift recipient
 * @returns {{ checkoutUrl: string, sessionId: string, recipientEmail: string }}
 */
export async function initiateGiftCheckout(groupId, recipientEmail) {
  const response = await apiService.post(`/groups/${groupId}/gift`, { recipientEmail });
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
