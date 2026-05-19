import { pgTable, foreignKey, uuid, timestamp, jsonb, integer, varchar, text, doublePrecision, boolean, unique, pgEnum } from "drizzle-orm/pg-core";
export const attendanceStatus = pgEnum("attendance_status", ['going', 'waitlist', 'cancelled', 'checked_in', 'no_show']);
export const couponType = pgEnum("coupon_type", ['percent', 'amount', 'bogo', 'free_item']);
export const purchaseStatus = pgEnum("purchase_status", ['created', 'pending', 'paid', 'expired', 'refunded']);
export const purchaseProvider = pgEnum("purchase_provider", ['stripe', 'test', 'admin_grant']);
export const billingModel = pgEnum("billing_model", ['one_time', 'subscription']);
export const eventOrderStatus = pgEnum("event_order_status", ['pending_email', 'pending_payment', 'paid', 'payment_failed', 'cancelled', 'refunded', 'partially_refunded', 'expired']);
export const eventRefundStatus = pgEnum("event_refund_status", ['pending', 'succeeded', 'failed', 'declined']);
export const eventTokenPurpose = pgEnum("event_token_purpose", ['email_confirmation', 'cancellation']);
export const eventPaymentProvider = pgEnum("event_payment_provider", ['stripe']);
export const role = pgEnum("role", ['super_admin', 'merchant', 'customer', 'foodie_group_admin']);
export const submissionState = pgEnum("submission_state", ['pending', 'approved', 'rejected']);
export const eventStatus = pgEnum("event_status", ['draft', 'published', 'cancelled']);
export const eventVisibility = pgEnum("event_visibility", ['public', 'members_only', 'invite_only']);
export const couponSubmission = pgTable("coupon_submission", {
    id: uuid().defaultRandom().primaryKey().notNull(),
    groupId: uuid("group_id").notNull(),
    merchantId: uuid("merchant_id"),
    state: submissionState().notNull(),
    submittedAt: timestamp("submitted_at", { mode: 'string' }).defaultNow().notNull(),
    submissionData: jsonb("submission_data").notNull(),
    rejectionMessage: text("rejection_message"),
    deletedAt: timestamp("deleted_at", { mode: 'string' }),
    updatedAt: timestamp("updated_at", { mode: 'string' }),
    reviewedAt: timestamp("reviewed_at", { mode: 'string' }),
}, (table) => [
    foreignKey({
        columns: [table.groupId],
        foreignColumns: [foodieGroup.id],
        name: "coupon_submission_group_id_foodie_group_id_fk"
    }),
    foreignKey({
        columns: [table.merchantId],
        foreignColumns: [merchant.id],
        name: "coupon_submission_merchant_id_merchant_id_fk"
    }).onDelete("set null"),
]);
export const eventRsvp = pgTable("event_rsvp", {
    id: uuid().defaultRandom().primaryKey().notNull(),
    eventId: uuid("event_id").notNull(),
    userId: uuid("user_id"),
    attendees: integer().notNull(),
    status: attendanceStatus().notNull(),
    waitlistPosition: integer("waitlist_position"),
    guestName: varchar("guest_name", { length: 255 }),
    guestEmail: varchar("guest_email", { length: 255 }),
    createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { mode: 'string' }),
}, (table) => [
    foreignKey({
        columns: [table.eventId],
        foreignColumns: [event.id],
        name: "event_rsvp_event_id_event_id_fk"
    }).onDelete("cascade"),
    foreignKey({
        columns: [table.userId],
        foreignColumns: [user.id],
        name: "event_rsvp_user_id_user_id_fk"
    }).onDelete("cascade"),
]);
export const coupon = pgTable("coupon", {
    id: uuid().defaultRandom().primaryKey().notNull(),
    groupId: uuid("group_id").notNull(),
    merchantId: uuid("merchant_id").notNull(),
    title: varchar({ length: 255 }).notNull(),
    description: text(),
    couponType: couponType("coupon_type").notNull(),
    discountValue: doublePrecision("discount_value").notNull(),
    validFrom: timestamp("valid_from", { mode: 'string' }).notNull(),
    expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
    qrCodeUrl: varchar("qr_code_url", { length: 500 }),
    locked: boolean().default(true).notNull(),
    createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { mode: 'string' }),
    cuisineType: varchar("cuisine_type", { length: 255 }),
}, (table) => [
    foreignKey({
        columns: [table.groupId],
        foreignColumns: [foodieGroup.id],
        name: "coupon_group_id_foodie_group_id_fk"
    }),
    foreignKey({
        columns: [table.merchantId],
        foreignColumns: [merchant.id],
        name: "coupon_merchant_id_merchant_id_fk"
    }),
]);
export const eventSubmission = pgTable("event_submission", {
    id: uuid().defaultRandom().primaryKey().notNull(),
    groupId: uuid("group_id").notNull(),
    merchantId: uuid("merchant_id"),
    state: submissionState().notNull(),
    submittedAt: timestamp("submitted_at", { mode: 'string' }).defaultNow().notNull(),
    submissionData: jsonb("submission_data").notNull(),
    rejectionMessage: text("rejection_message"),
    deletedAt: timestamp("deleted_at", { mode: 'string' }),
    updatedAt: timestamp("updated_at", { mode: 'string' }),
    reviewedAt: timestamp("reviewed_at", { mode: 'string' }),
}, (table) => [
    foreignKey({
        columns: [table.groupId],
        foreignColumns: [foodieGroup.id],
        name: "event_submission_group_id_foodie_group_id_fk"
    }),
    foreignKey({
        columns: [table.merchantId],
        foreignColumns: [merchant.id],
        name: "event_submission_merchant_id_merchant_id_fk"
    }).onDelete("set null"),
]);
export const event = pgTable("event", {
    id: uuid().defaultRandom().primaryKey().notNull(),
    groupId: uuid("group_id").notNull(),
    merchantId: uuid("merchant_id").notNull(),
    name: varchar({ length: 255 }).notNull(),
    description: text(),
    startDatetime: timestamp("start_datetime", { mode: 'string' }).notNull(),
    endDatetime: timestamp("end_datetime", { mode: 'string' }),
    location: varchar({ length: 255 }),
    capacity: integer().notNull(),
    coverImageUrl: varchar("cover_image_url", { length: 500 }),
    slug: varchar("slug", { length: 255 }),
    memberAccessToken: varchar("member_access_token", { length: 255 }),
    status: eventStatus("status").default('published').notNull(),
    priceCents: integer("price_cents"),
    membersOnlyPriceCents: integer("members_only_price_cents"),
    isFree: boolean("is_free").default(true).notNull(),
    visibility: eventVisibility("visibility").default('public').notNull(),
    maxTicketsPerGuest: integer("max_tickets_per_guest").default(1).notNull(),
    inviteOnly: boolean("invite_only").default(false).notNull(),
    bannerImageUrl: varchar("banner_image_url", { length: 500 }),
    createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { mode: 'string' }),
}, (table) => [
    foreignKey({
        columns: [table.groupId],
        foreignColumns: [foodieGroup.id],
        name: "event_group_id_foodie_group_id_fk"
    }),
    foreignKey({
        columns: [table.merchantId],
        foreignColumns: [merchant.id],
        name: "event_merchant_id_merchant_id_fk"
    }),
]);
export const couponRedemption = pgTable("coupon_redemption", {
    id: uuid().defaultRandom().primaryKey().notNull(),
    couponId: uuid("coupon_id").notNull(),
    userId: uuid("user_id").notNull(),
    redeemedAt: timestamp("redeemed_at", { mode: 'string' }).defaultNow().notNull(),
    locationMeta: jsonb("location_meta"),
    deletedAt: timestamp("deleted_at", { mode: 'string' }),
}, (table) => [
    foreignKey({
        columns: [table.couponId],
        foreignColumns: [coupon.id],
        name: "coupon_redemption_coupon_id_coupon_id_fk"
    }).onDelete("cascade"),
    foreignKey({
        columns: [table.userId],
        foreignColumns: [user.id],
        name: "coupon_redemption_user_id_user_id_fk"
    }).onDelete("cascade"),
    unique("coupon_redemption_user_coupon_unique").on(table.couponId, table.userId),
]);
export const user = pgTable("user", {
    id: uuid().defaultRandom().primaryKey().notNull(),
    cognitoSub: varchar("cognito_sub", { length: 255 }).notNull(),
    email: varchar({ length: 255 }).notNull(),
    name: varchar({ length: 255 }).notNull(),
    role: role().default('customer').notNull(),
    createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { mode: 'string' }),
    // Anonymization tracking (for GDPR / user removal)
    anonymizedAt: timestamp("anonymized_at", { mode: 'string' }),
    anonymizedByUserId: uuid("anonymized_by_user_id"),
    anonymizedReason: text("anonymized_reason"),
}, (table) => [
    unique("user_cognito_sub_unique").on(table.cognitoSub),
    unique("user_email_unique").on(table.email),
]);
export const foodieGroup = pgTable("foodie_group", {
    id: uuid().defaultRandom().primaryKey().notNull(),
    slug: varchar({ length: 255 }).notNull(),
    name: varchar({ length: 255 }).notNull(),
    description: text(),
    location: varchar({ length: 255 }),
    bannerImageUrl: varchar("banner_image_url", { length: 500 }),
    map: jsonb(),
    socialLinks: jsonb("social_links"),
    billingModel: billingModel("billing_model").default('one_time').notNull(),
    createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
    archivedAt: timestamp("archived_at", { mode: 'string' }),
}, (table) => [
    unique("foodie_group_slug_unique").on(table.slug),
]);
export const merchant = pgTable("merchant", {
    id: uuid().defaultRandom().primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
    logoUrl: varchar("logo_url", { length: 500 }),
    websiteUrl: varchar("website_url", { length: 500 }),
    ownerId: uuid("owner_id").notNull(),
    deletedAt: timestamp("deleted_at", { mode: 'string' }),
    createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
    foreignKey({
        columns: [table.ownerId],
        foreignColumns: [user.id],
        name: "merchant_owner_id_user_id_fk"
    }),
]);
export const merchantBillingProfile = pgTable("merchant_billing_profile", {
    id: uuid().defaultRandom().primaryKey().notNull(),
    merchantId: uuid("merchant_id").notNull(),
    payoutDestinationDetails: jsonb("payout_destination_details"),
    payoutDestinationVerified: boolean("payout_destination_verified").default(false).notNull(),
    stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
    backupPaymentMethodId: varchar("backup_payment_method_id", { length: 255 }),
    backupPaymentMethodLast4: varchar("backup_payment_method_last4", { length: 4 }),
    backupChargeMethodReady: boolean("backup_charge_method_ready").default(false).notNull(),
    paidEventTermsAcceptedAt: timestamp("paid_event_terms_accepted_at", { mode: 'string' }),
    paidEventTermsVersion: varchar("paid_event_terms_version", { length: 64 }),
    paidEventsEnabled: boolean("paid_events_enabled").default(false).notNull(),
    disputeRecoveryEnabled: boolean("dispute_recovery_enabled").default(false).notNull(),
    createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
    foreignKey({
        columns: [table.merchantId],
        foreignColumns: [merchant.id],
        name: "merchant_billing_profile_merchant_id_merchant_id_fk"
    }).onDelete("cascade"),
    unique("merchant_billing_profile_merchant_id_unique").on(table.merchantId),
]);
export const foodieGroupMembership = pgTable("foodie_group_membership", {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid("user_id").notNull(),
    groupId: uuid("group_id").notNull(),
    role: role().default('customer').notNull(),
    joinedAt: timestamp("joined_at", { mode: 'string' }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { mode: 'string' }),
}, (table) => [
    foreignKey({
        columns: [table.userId],
        foreignColumns: [user.id],
        name: "foodie_group_membership_user_id_user_id_fk"
    }).onDelete("cascade"),
    foreignKey({
        columns: [table.groupId],
        foreignColumns: [foodieGroup.id],
        name: "foodie_group_membership_group_id_foodie_group_id_fk"
    }).onDelete("cascade"),
]);
export const purchase = pgTable("purchase", {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid("user_id").notNull(),
    groupId: uuid("group_id").notNull(),
    provider: purchaseProvider().default('stripe').notNull(),
    stripeCheckoutId: varchar("stripe_checkout_id", { length: 255 }),
    stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
    stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
    stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
    stripeChargeId: varchar("stripe_charge_id", { length: 255 }),
    amountCents: integer("amount_cents").notNull(),
    currency: varchar({ length: 10 }).notNull(),
    status: purchaseStatus().notNull(),
    priceSnapshot: jsonb("price_snapshot"),
    metadata: jsonb("metadata"),
    purchasedAt: timestamp("purchased_at", { mode: 'string' }),
    expiresAt: timestamp("expires_at", { mode: 'string' }),
    refundedAt: timestamp("refunded_at", { mode: 'string' }),
    // Gift support
    giftedByUserId: uuid("gifted_by_user_id"),
    // Subscription lifecycle
    subscriptionStatus: varchar("subscription_status", { length: 32 }),
    currentPeriodStart: timestamp("current_period_start", { mode: 'string' }),
    currentPeriodEnd: timestamp("current_period_end", { mode: 'string' }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
    renewalReminderSentAt: timestamp("renewal_reminder_sent_at", { mode: 'string' }),
    createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
    foreignKey({
        columns: [table.userId],
        foreignColumns: [user.id],
        name: "purchase_user_id_user_id_fk"
    }),
    foreignKey({
        columns: [table.groupId],
        foreignColumns: [foodieGroup.id],
        name: "purchase_group_id_foodie_group_id_fk"
    }),
    foreignKey({
        columns: [table.giftedByUserId],
        foreignColumns: [user.id],
        name: "purchase_gifted_by_user_id_user_id_fk"
    }).onDelete("set null"),
    unique("purchase_stripe_checkout_id_unique").on(table.stripeCheckoutId),
]);
export const couponBookPrice = pgTable("coupon_book_price", {
    id: uuid().defaultRandom().primaryKey().notNull(),
    groupId: uuid("group_id").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: varchar({ length: 10 }).default('usd').notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    stripeProductId: varchar("stripe_product_id", { length: 255 }),
    stripePriceId: varchar("stripe_price_id", { length: 255 }),
    stripeProductIdTest: varchar("stripe_product_id_test", { length: 255 }),
    stripePriceIdTest: varchar("stripe_price_id_test", { length: 255 }),
    stripeProductIdLive: varchar("stripe_product_id_live", { length: 255 }),
    stripePriceIdLive: varchar("stripe_price_id_live", { length: 255 }),
    // Recurring price support for subscription billing
    billingInterval: varchar("billing_interval", { length: 10 }),
    billingIntervalCount: integer("billing_interval_count"),
    stripeRecurringPriceIdTest: varchar("stripe_recurring_price_id_test", { length: 255 }),
    stripeRecurringPriceIdLive: varchar("stripe_recurring_price_id_live", { length: 255 }),
    createdByUserId: uuid("created_by_user_id"),
    createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
    archivedAt: timestamp("archived_at", { mode: 'string' }),
}, (table) => [
    foreignKey({
        columns: [table.groupId],
        foreignColumns: [foodieGroup.id],
        name: "coupon_book_price_group_id_foodie_group_id_fk"
    }).onDelete("cascade"),
    foreignKey({
        columns: [table.createdByUserId],
        foreignColumns: [user.id],
        name: "coupon_book_price_created_by_user_id_user_id_fk"
    }).onDelete("set null"),
]);
export const paymentEvent = pgTable("payment_event", {
    id: uuid().defaultRandom().primaryKey().notNull(),
    provider: varchar({ length: 32 }).notNull(),
    eventId: varchar("event_id", { length: 255 }).notNull(),
    eventType: varchar("event_type", { length: 255 }).notNull(),
    receivedAt: timestamp("received_at", { mode: 'string' }).defaultNow().notNull(),
    purchaseId: uuid("purchase_id"),
    eventOrderId: uuid("event_order_id"),
    processedAt: timestamp("processed_at", { mode: 'string' }),
    processingError: text("processing_error"),
    payload: jsonb(),
}, (table) => [
    foreignKey({
        columns: [table.purchaseId],
        foreignColumns: [purchase.id],
        name: "payment_event_purchase_id_purchase_id_fk"
    }).onDelete("set null"),
    foreignKey({
        columns: [table.eventOrderId],
        foreignColumns: [eventOrder.id],
        name: "payment_event_event_order_id_event_order_id_fk"
    }).onDelete("set null"),
    unique("payment_event_event_id_unique").on(table.eventId),
]);
export const eventOrder = pgTable("event_order", {
    id: uuid().defaultRandom().primaryKey().notNull(),
    eventId: uuid("event_id").notNull(),
    rsvpId: uuid("rsvp_id"),
    userId: uuid("user_id"),
    groupId: uuid("group_id").notNull(),
    merchantId: uuid("merchant_id").notNull(),
    provider: eventPaymentProvider().default('stripe').notNull(),
    quantity: integer().notNull(),
    guestName: varchar("guest_name", { length: 255 }),
    guestEmail: varchar("guest_email", { length: 255 }),
    emailConfirmationStatus: varchar("email_confirmation_status", { length: 32 }).default('not_required').notNull(),
    emailConfirmedAt: timestamp("email_confirmed_at", { mode: 'string' }),
    amountCents: integer("amount_cents").notNull(),
    refundedAmountCents: integer("refunded_amount_cents").default(0).notNull(),
    currency: varchar({ length: 10 }).default('usd').notNull(),
    pricingBasis: varchar("pricing_basis", { length: 64 }).notNull(),
    status: eventOrderStatus().notNull(),
    stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
    stripeCheckoutSessionId: varchar("stripe_checkout_session_id", { length: 255 }),
    stripeChargeId: varchar("stripe_charge_id", { length: 255 }),
    stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
    refundPolicyVersion: varchar("refund_policy_version", { length: 64 }).notNull(),
    refundPolicyAcknowledgedAt: timestamp("refund_policy_acknowledged_at", { mode: 'string' }),
    cancellationReason: text("cancellation_reason"),
    cancellationRequestedAt: timestamp("cancellation_requested_at", { mode: 'string' }),
    cancelledAt: timestamp("cancelled_at", { mode: 'string' }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
    foreignKey({
        columns: [table.eventId],
        foreignColumns: [event.id],
        name: "event_order_event_id_event_id_fk"
    }).onDelete("cascade"),
    foreignKey({
        columns: [table.rsvpId],
        foreignColumns: [eventRsvp.id],
        name: "event_order_rsvp_id_event_rsvp_id_fk"
    }).onDelete("set null"),
    foreignKey({
        columns: [table.userId],
        foreignColumns: [user.id],
        name: "event_order_user_id_user_id_fk"
    }).onDelete("set null"),
    foreignKey({
        columns: [table.groupId],
        foreignColumns: [foodieGroup.id],
        name: "event_order_group_id_foodie_group_id_fk"
    }),
    foreignKey({
        columns: [table.merchantId],
        foreignColumns: [merchant.id],
        name: "event_order_merchant_id_merchant_id_fk"
    }),
    unique("event_order_stripe_payment_intent_unique").on(table.stripePaymentIntentId),
]);
export const eventRefund = pgTable("event_refund", {
    id: uuid().defaultRandom().primaryKey().notNull(),
    eventOrderId: uuid("event_order_id").notNull(),
    eventRsvpId: uuid("event_rsvp_id"),
    eventId: uuid("event_id").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: varchar({ length: 10 }).default('usd').notNull(),
    reason: varchar({ length: 64 }).notNull(),
    policyWindow: varchar("policy_window", { length: 64 }).notNull(),
    refundPolicyVersion: varchar("refund_policy_version", { length: 64 }).notNull(),
    status: eventRefundStatus().notNull(),
    stripeRefundId: varchar("stripe_refund_id", { length: 255 }),
    stripeChargeId: varchar("stripe_charge_id", { length: 255 }),
    failureReason: text("failure_reason"),
    requestedByUserId: uuid("requested_by_user_id"),
    requestedByRole: varchar("requested_by_role", { length: 64 }),
    metadata: jsonb("metadata"),
    processedAt: timestamp("processed_at", { mode: 'string' }),
    createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
    foreignKey({
        columns: [table.eventOrderId],
        foreignColumns: [eventOrder.id],
        name: "event_refund_event_order_id_event_order_id_fk"
    }).onDelete("cascade"),
    foreignKey({
        columns: [table.eventRsvpId],
        foreignColumns: [eventRsvp.id],
        name: "event_refund_event_rsvp_id_event_rsvp_id_fk"
    }).onDelete("set null"),
    foreignKey({
        columns: [table.eventId],
        foreignColumns: [event.id],
        name: "event_refund_event_id_event_id_fk"
    }).onDelete("cascade"),
    foreignKey({
        columns: [table.requestedByUserId],
        foreignColumns: [user.id],
        name: "event_refund_requested_by_user_id_user_id_fk"
    }).onDelete("set null"),
    unique("event_refund_stripe_refund_id_unique").on(table.stripeRefundId),
]);
export const eventGuestToken = pgTable("event_guest_token", {
    id: uuid().defaultRandom().primaryKey().notNull(),
    eventOrderId: uuid("event_order_id"),
    eventRsvpId: uuid("event_rsvp_id"),
    eventId: uuid("event_id").notNull(),
    purpose: eventTokenPurpose().notNull(),
    tokenHash: varchar("token_hash", { length: 128 }).notNull(),
    expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
    usedAt: timestamp("used_at", { mode: 'string' }),
    revokedAt: timestamp("revoked_at", { mode: 'string' }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
    foreignKey({
        columns: [table.eventOrderId],
        foreignColumns: [eventOrder.id],
        name: "event_guest_token_event_order_id_event_order_id_fk"
    }).onDelete("cascade"),
    foreignKey({
        columns: [table.eventRsvpId],
        foreignColumns: [eventRsvp.id],
        name: "event_guest_token_event_rsvp_id_event_rsvp_id_fk"
    }).onDelete("cascade"),
    foreignKey({
        columns: [table.eventId],
        foreignColumns: [event.id],
        name: "event_guest_token_event_id_event_id_fk"
    }).onDelete("cascade"),
    unique("event_guest_token_token_hash_unique").on(table.tokenHash),
]);
export const eventDispute = pgTable("event_dispute", {
    id: uuid().defaultRandom().primaryKey().notNull(),
    eventOrderId: uuid("event_order_id"),
    eventId: uuid("event_id").notNull(),
    merchantId: uuid("merchant_id").notNull(),
    stripeDisputeId: varchar("stripe_dispute_id", { length: 255 }).notNull(),
    stripeChargeId: varchar("stripe_charge_id", { length: 255 }),
    amountCents: integer("amount_cents").notNull(),
    currency: varchar({ length: 10 }).default('usd').notNull(),
    status: varchar({ length: 64 }).notNull(),
    disputeFeeCents: integer("dispute_fee_cents"),
    recoveryAmountCents: integer("recovery_amount_cents"),
    recoveryStatus: varchar("recovery_status", { length: 64 }),
    merchantRecoveryPaymentIntentId: varchar("merchant_recovery_payment_intent_id", { length: 255 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
    foreignKey({
        columns: [table.eventOrderId],
        foreignColumns: [eventOrder.id],
        name: "event_dispute_event_order_id_event_order_id_fk"
    }).onDelete("set null"),
    foreignKey({
        columns: [table.eventId],
        foreignColumns: [event.id],
        name: "event_dispute_event_id_event_id_fk"
    }).onDelete("cascade"),
    foreignKey({
        columns: [table.merchantId],
        foreignColumns: [merchant.id],
        name: "event_dispute_merchant_id_merchant_id_fk"
    }),
    unique("event_dispute_stripe_dispute_id_unique").on(table.stripeDisputeId),
]);

export const merchantMembership = pgTable("merchant_membership", {
    id: uuid().defaultRandom().primaryKey().notNull(),
    merchantId: uuid("merchant_id").notNull(),
    userId: uuid("user_id").notNull(),
    addedByUserId: uuid("added_by_user_id"),
    createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { mode: 'string' }),
}, (table) => [
    foreignKey({
        columns: [table.merchantId],
        foreignColumns: [merchant.id],
        name: "merchant_membership_merchant_id_fk"
    }).onDelete("cascade"),
    foreignKey({
        columns: [table.userId],
        foreignColumns: [user.id],
        name: "merchant_membership_user_id_fk"
    }).onDelete("cascade"),
    foreignKey({
        columns: [table.addedByUserId],
        foreignColumns: [user.id],
        name: "merchant_membership_added_by_fk"
    }),
    unique("merchant_membership_user_merchant_unique").on(table.merchantId, table.userId),
]);

// Admin audit log for tracking super admin "god mode" actions
export const adminAuditLog = pgTable("admin_audit_log", {
    id: uuid().defaultRandom().primaryKey().notNull(),
    actorUserId: uuid("actor_user_id").notNull(),
    action: varchar({ length: 100 }).notNull(),
    targetType: varchar("target_type", { length: 50 }).notNull(),
    targetId: varchar("target_id", { length: 255 }).notNull(),
    metadata: jsonb(),
    createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
    foreignKey({
        columns: [table.actorUserId],
        foreignColumns: [user.id],
        name: "admin_audit_log_actor_user_id_user_id_fk"
    }),
]);
