#!/usr/bin/env node

/**
 * Validates Stripe API keys by making a test API call
 * Usage: node scripts/validate-stripe-keys.js
 */

import Stripe from 'stripe';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.development') });

async function validateStripeKeys() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY?.trim();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

  console.log('🔍 Validating Stripe configuration...\n');

  // Check if keys exist
  if (!secretKey) {
    console.error('❌ STRIPE_SECRET_KEY is missing');
    return false;
  }
  if (!publishableKey) {
    console.error('❌ STRIPE_PUBLISHABLE_KEY is missing');
    return false;
  }
  if (!webhookSecret) {
    console.error('❌ STRIPE_WEBHOOK_SECRET is missing');
    return false;
  }

  // Validate format
  const formatErrors = [];
  if (!secretKey.startsWith('sk_test_') && !secretKey.startsWith('sk_live_')) {
    formatErrors.push('STRIPE_SECRET_KEY must start with "sk_test_" or "sk_live_"');
  }
  if (!publishableKey.startsWith('pk_test_') && !publishableKey.startsWith('pk_live_')) {
    formatErrors.push('STRIPE_PUBLISHABLE_KEY must start with "pk_test_" or "pk_live_"');
  }
  if (!webhookSecret.startsWith('whsec_')) {
    formatErrors.push('STRIPE_WEBHOOK_SECRET must start with "whsec_"');
  }

  if (formatErrors.length > 0) {
    console.error('❌ Format validation failed:');
    formatErrors.forEach(err => console.error(`   - ${err}`));
    return false;
  }

  // Check if keys match (both test or both live)
  const secretIsTest = secretKey.startsWith('sk_test_');
  const publishableIsTest = publishableKey.startsWith('pk_test_');
  if (secretIsTest !== publishableIsTest) {
    console.error('❌ STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY must both be test keys or both be live keys');
    return false;
  }

  console.log('✅ Format validation passed\n');

  // Test API connection
  console.log('🔌 Testing Stripe API connection...');
  try {
    const stripe = new Stripe(secretKey, {
      apiVersion: '2024-12-18.acacia',
    });

    // Make a simple API call to verify the key works
    const account = await stripe.account.retrieve();
    console.log(`✅ API connection successful`);
    console.log(`   Account ID: ${account.id}`);
    console.log(`   Account type: ${account.type}`);
    console.log(`   Keys are: ${secretIsTest ? 'TEST' : 'LIVE'} keys\n`);

    return true;
  } catch (error) {
    console.error('❌ API connection failed:');
    console.error(`   ${error.message}`);
    if (error.type === 'StripeAuthenticationError') {
      console.error('   This usually means the secret key is invalid or has been revoked');
    }
    return false;
  }
}

// Run validation
validateStripeKeys()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
