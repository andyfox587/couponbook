import { getStripeMode, validateStripeIdMode } from '../config/stripe.js';

/**
 * Gets the appropriate Stripe Product ID based on current environment mode
 * @param {Object} priceRecord - Database record with Stripe IDs
 * @returns {string|null} The appropriate Stripe Product ID for current mode
 */
export function getStripeProductId(priceRecord) {
  const mode = getStripeMode();
  
  if (mode === 'live') {
    return priceRecord.stripeProductIdLive || priceRecord.stripeProductId;
  }
  
  // Default to test mode
  return priceRecord.stripeProductIdTest || priceRecord.stripeProductId;
}

/**
 * Gets the appropriate Stripe Price ID based on current environment mode
 * @param {Object} priceRecord - Database record with Stripe IDs
 * @returns {string|null} The appropriate Stripe Price ID for current mode
 */
export function getStripePriceId(priceRecord) {
  const mode = getStripeMode();
  
  if (mode === 'live') {
    return priceRecord.stripePriceIdLive || priceRecord.stripePriceId;
  }
  
  // Default to test mode
  return priceRecord.stripePriceIdTest || priceRecord.stripePriceId;
}

/**
 * Validates and returns Stripe IDs with mode checking
 * Throws an error if IDs don't match the current environment
 * @param {Object} priceRecord - Database record with Stripe IDs
 * @returns {Object} Object with productId and priceId
 * @throws {Error} If IDs don't match environment mode
 */
export function getValidatedStripeIds(priceRecord) {
  const productId = getStripeProductId(priceRecord);
  const priceId = getStripePriceId(priceRecord);
  
  // Validate IDs match environment mode
  if (productId) {
    validateStripeIdMode(productId, 'Stripe Product ID');
  }
  if (priceId) {
    validateStripeIdMode(priceId, 'Stripe Price ID');
  }
  
  return { productId, priceId };
}

/**
 * Gets the appropriate recurring Stripe Price ID for subscription billing
 * @param {Object} priceRecord - Database record with Stripe IDs
 * @returns {string|null} The appropriate recurring Stripe Price ID for current mode
 */
export function getStripeRecurringPriceId(priceRecord) {
  const mode = getStripeMode();
  if (mode === 'live') {
    return priceRecord.stripeRecurringPriceIdLive || null;
  }
  return priceRecord.stripeRecurringPriceIdTest || null;
}

/**
 * Prepares Stripe ID fields for database insert/update based on ID type
 * Automatically detects if IDs are test or live and sets appropriate columns
 * @param {string|null} productId - Stripe Product ID
 * @param {string|null} priceId - Stripe Price ID
 * @param {string|null} recurringPriceId - Optional recurring Stripe Price ID for subscriptions
 * @returns {Object} Object with appropriate column names set
 */
export function prepareStripeIdFields(productId, priceId, recurringPriceId = null) {
  const fields = {};
  
  if (productId) {
    const isTest = productId.includes('_test_');
    if (isTest) {
      fields.stripeProductIdTest = productId;
    } else {
      fields.stripeProductIdLive = productId;
    }
    // Also set legacy field for backward compatibility
    fields.stripeProductId = productId;
  }
  
  if (priceId) {
    const isTest = priceId.includes('_test_');
    if (isTest) {
      fields.stripePriceIdTest = priceId;
    } else {
      fields.stripePriceIdLive = priceId;
    }
    // Also set legacy field for backward compatibility
    fields.stripePriceId = priceId;
  }

  if (recurringPriceId) {
    const isTest = recurringPriceId.includes('_test_');
    if (isTest) {
      fields.stripeRecurringPriceIdTest = recurringPriceId;
    } else {
      fields.stripeRecurringPriceIdLive = recurringPriceId;
    }
  }

  return fields;
}
