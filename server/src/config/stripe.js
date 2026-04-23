import Stripe from 'stripe';

/**
 * Validates Stripe environment variables and initializes Stripe client
 * Throws error on startup if required env vars are missing or invalid
 */
function validateStripeEnv() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeMode = process.env.STRIPE_MODE;

  const errors = [];

  // Validate STRIPE_MODE
  if (!stripeMode) {
    errors.push('STRIPE_MODE is missing (must be "test" or "live")');
  } else if (stripeMode !== 'test' && stripeMode !== 'live') {
    errors.push('STRIPE_MODE must be either "test" or "live"');
  }

  // Validate secret key format
  if (!secretKey) {
    errors.push('STRIPE_SECRET_KEY is missing');
  } else if (!secretKey.startsWith('sk_test_') && !secretKey.startsWith('sk_live_')) {
    errors.push('STRIPE_SECRET_KEY must start with "sk_test_" or "sk_live_"');
  }

  // Validate publishable key format
  if (!publishableKey) {
    errors.push('STRIPE_PUBLISHABLE_KEY is missing');
  } else if (!publishableKey.startsWith('pk_test_') && !publishableKey.startsWith('pk_live_')) {
    errors.push('STRIPE_PUBLISHABLE_KEY must start with "pk_test_" or "pk_live_"');
  }

  // Validate webhook secret format
  if (!webhookSecret) {
    errors.push('STRIPE_WEBHOOK_SECRET is missing');
  } else if (!webhookSecret.startsWith('whsec_')) {
    errors.push('STRIPE_WEBHOOK_SECRET must start with "whsec_"');
  }

  // Ensure keys match (both test or both live)
  if (secretKey && publishableKey) {
    const secretIsTest = secretKey.startsWith('sk_test_');
    const publishableIsTest = publishableKey.startsWith('pk_test_');
    if (secretIsTest !== publishableIsTest) {
      errors.push('STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY must both be test keys or both be live keys');
    }
  }

  // Validate that STRIPE_MODE matches the key types
  if (stripeMode && secretKey) {
    const secretIsTest = secretKey.startsWith('sk_test_');
    const secretIsLive = secretKey.startsWith('sk_live_');
    
    if (stripeMode === 'test' && !secretIsTest) {
      errors.push('STRIPE_MODE is "test" but STRIPE_SECRET_KEY is not a test key');
    }
    if (stripeMode === 'live' && !secretIsLive) {
      errors.push('STRIPE_MODE is "live" but STRIPE_SECRET_KEY is not a live key');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Stripe configuration errors:\n${errors.map(e => `  - ${e}`).join('\n')}`);
  }

  return { secretKey, publishableKey, webhookSecret, mode: stripeMode };
}

/**
 * Validates that a Stripe ID matches the current environment mode.
 *
 * NOTE: Stripe resource IDs (prod_*, price_*, plan_*) use the same format in both
 * test and live mode — only API keys (sk_test_/sk_live_) encode the environment.
 * Therefore this function only validates the legacy _test_ infix pattern used by
 * older Stripe CLI fixtures; it no longer attempts to flag regular resource IDs as
 * "live" because that check produced false positives on all real Stripe IDs.
 *
 * @param {string} stripeId - The Stripe ID to validate
 * @param {string} idType - Type of ID for error messages
 */
function validateStripeIdMode(stripeId, idType = 'Stripe ID') {
  if (!stripeId) return;

  const mode = stripeConfig?.mode;
  if (!mode) return;

  // Only flag IDs that explicitly contain the _test_ infix (e.g. old CLI fixture IDs)
  // while running in live mode — a clear copy-paste mistake.
  const isExplicitTestId = stripeId.includes('_test_');
  if (mode === 'live' && isExplicitTestId) {
    throw new Error(`${idType} "${stripeId}" contains "_test_" but STRIPE_MODE is "live". Cannot use test-fixture IDs in production.`);
  }
}

/**
 * Determines whether to use test or live Stripe IDs based on environment
 * @returns {'test'|'live'} The current Stripe mode
 */
function getStripeMode() {
  return stripeConfig?.mode || 'test';
}

// Validate and initialize on module load
let stripe;
let stripeConfig;

try {
  stripeConfig = validateStripeEnv();
  stripe = new Stripe(stripeConfig.secretKey, {
    apiVersion: '2024-12-18.acacia',
  });
  console.log(`✅ Stripe client initialized successfully (mode: ${stripeConfig.mode})`);
} catch (error) {
  // Log but do not re-throw — a misconfigured Stripe should only break Stripe
  // routes, not crash every endpoint on startup.
  console.error('❌ Stripe configuration error (Stripe routes will be unavailable):', error.message);
  stripe = null;
  stripeConfig = null;
}

export { stripe, stripeConfig, validateStripeIdMode, getStripeMode };
export default stripe;
