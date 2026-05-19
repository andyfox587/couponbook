// server/src/schema.js
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.purchase = exports.foodieGroupMembership = exports.merchant = exports.foodieGroup = exports.user = exports.couponRedemption = exports.event = exports.eventSubmission = exports.coupon = exports.eventRsvp = exports.couponSubmission = exports.submissionState = exports.role = exports.purchaseStatus = exports.couponType = exports.attendanceStatus = void 0;
var pg_core_1 = require("drizzle-orm/pg-core");
exports.attendanceStatus = (0, pg_core_1.pgEnum)("attendance_status", ['going', 'waitlist', 'cancelled']);
exports.couponType = (0, pg_core_1.pgEnum)("coupon_type", ['percent', 'amount', 'bogo', 'free_item']);
exports.purchaseStatus = (0, pg_core_1.pgEnum)("purchase_status", ['created', 'pending', 'paid', 'expired', 'refunded']);
exports.role = (0, pg_core_1.pgEnum)("role", ['super_admin', 'merchant', 'customer', "foodie_group_admin"]);
exports.submissionState = (0, pg_core_1.pgEnum)("submission_state", ['pending', 'approved', 'rejected']);
exports.couponSubmission = (0, pg_core_1.pgTable)("coupon_submission", {
    id: (0, pg_core_1.uuid)().defaultRandom().primaryKey().notNull(),
    groupId: (0, pg_core_1.uuid)("group_id").notNull(),
    merchantId: (0, pg_core_1.uuid)("merchant_id"),
    state: (0, exports.submissionState)().notNull(),
    submittedAt: (0, pg_core_1.timestamp)("submitted_at", { mode: 'string' }).defaultNow().notNull(),
    submissionData: (0, pg_core_1.jsonb)("submission_data").notNull(),
    deletedAt: (0, pg_core_1.timestamp)("deleted_at", { mode: 'string' }),
}, function (table) { return [
    (0, pg_core_1.foreignKey)({
        columns: [table.groupId],
        foreignColumns: [exports.foodieGroup.id],
        name: "coupon_submission_group_id_foodie_group_id_fk"
    }),
    (0, pg_core_1.foreignKey)({
        columns: [table.merchantId],
        foreignColumns: [exports.merchant.id],
        name: "coupon_submission_merchant_id_merchant_id_fk"
    }).onDelete("set null"),
]; });
exports.eventRsvp = (0, pg_core_1.pgTable)("event_rsvp", {
    id: (0, pg_core_1.uuid)().defaultRandom().primaryKey().notNull(),
    eventId: (0, pg_core_1.uuid)("event_id").notNull(),
    userId: (0, pg_core_1.uuid)("user_id").notNull(),
    attendees: (0, pg_core_1.integer)().notNull(),
    status: (0, exports.attendanceStatus)().notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { mode: 'string' }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { mode: 'string' }).defaultNow().notNull(),
    deletedAt: (0, pg_core_1.timestamp)("deleted_at", { mode: 'string' }),
}, function (table) { return [
    (0, pg_core_1.foreignKey)({
        columns: [table.eventId],
        foreignColumns: [exports.event.id],
        name: "event_rsvp_event_id_event_id_fk"
    }).onDelete("cascade"),
    (0, pg_core_1.foreignKey)({
        columns: [table.userId],
        foreignColumns: [exports.user.id],
        name: "event_rsvp_user_id_user_id_fk"
    }).onDelete("cascade"),
]; });
exports.coupon = (0, pg_core_1.pgTable)("coupon", {
    id: (0, pg_core_1.uuid)().defaultRandom().primaryKey().notNull(),
    groupId: (0, pg_core_1.uuid)("group_id").notNull(),
    merchantId: (0, pg_core_1.uuid)("merchant_id").notNull(),
    title: (0, pg_core_1.varchar)({ length: 255 }).notNull(),
    description: (0, pg_core_1.text)(),
    couponType: (0, exports.couponType)("coupon_type").notNull(),
    discountValue: (0, pg_core_1.doublePrecision)("discount_value").notNull(),
    validFrom: (0, pg_core_1.timestamp)("valid_from", { mode: 'string' }).notNull(),
    expiresAt: (0, pg_core_1.timestamp)("expires_at", { mode: 'string' }).notNull(),
    qrCodeUrl: (0, pg_core_1.varchar)("qr_code_url", { length: 500 }),
    locked: (0, pg_core_1.boolean)().default(true).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { mode: 'string' }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { mode: 'string' }).defaultNow().notNull(),
    deletedAt: (0, pg_core_1.timestamp)("deleted_at", { mode: 'string' }),
    cuisineType: (0, pg_core_1.varchar)("cuisine_type", { length: 255 }),
}, function (table) { return [
    (0, pg_core_1.foreignKey)({
        columns: [table.groupId],
        foreignColumns: [exports.foodieGroup.id],
        name: "coupon_group_id_foodie_group_id_fk"
    }),
    (0, pg_core_1.foreignKey)({
        columns: [table.merchantId],
        foreignColumns: [exports.merchant.id],
        name: "coupon_merchant_id_merchant_id_fk"
    }),
]; });
exports.eventSubmission = (0, pg_core_1.pgTable)("event_submission", {
    id: (0, pg_core_1.uuid)().defaultRandom().primaryKey().notNull(),
    groupId: (0, pg_core_1.uuid)("group_id").notNull(),
    merchantId: (0, pg_core_1.uuid)("merchant_id"),
    state: (0, exports.submissionState)().notNull(),
    submittedAt: (0, pg_core_1.timestamp)("submitted_at", { mode: 'string' }).defaultNow().notNull(),
    submissionData: (0, pg_core_1.jsonb)("submission_data").notNull(),
    deletedAt: (0, pg_core_1.timestamp)("deleted_at", { mode: 'string' }),
}, function (table) { return [
    (0, pg_core_1.foreignKey)({
        columns: [table.groupId],
        foreignColumns: [exports.foodieGroup.id],
        name: "event_submission_group_id_foodie_group_id_fk"
    }),
    (0, pg_core_1.foreignKey)({
        columns: [table.merchantId],
        foreignColumns: [exports.merchant.id],
        name: "event_submission_merchant_id_merchant_id_fk"
    }).onDelete("set null"),
]; });
exports.event = (0, pg_core_1.pgTable)("event", {
    id: (0, pg_core_1.uuid)().defaultRandom().primaryKey().notNull(),
    groupId: (0, pg_core_1.uuid)("group_id").notNull(),
    merchantId: (0, pg_core_1.uuid)("merchant_id").notNull(),
    name: (0, pg_core_1.varchar)({ length: 255 }).notNull(),
    description: (0, pg_core_1.text)(),
    startDatetime: (0, pg_core_1.timestamp)("start_datetime", { mode: 'string' }).notNull(),
    endDatetime: (0, pg_core_1.timestamp)("end_datetime", { mode: 'string' }),
    location: (0, pg_core_1.varchar)({ length: 255 }),
    capacity: (0, pg_core_1.integer)().notNull(),
    coverImageUrl: (0, pg_core_1.varchar)("cover_image_url", { length: 500 }),
    createdAt: (0, pg_core_1.timestamp)("created_at", { mode: 'string' }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { mode: 'string' }).defaultNow().notNull(),
    deletedAt: (0, pg_core_1.timestamp)("deleted_at", { mode: 'string' }),
}, function (table) { return [
    (0, pg_core_1.foreignKey)({
        columns: [table.groupId],
        foreignColumns: [exports.foodieGroup.id],
        name: "event_group_id_foodie_group_id_fk"
    }),
    (0, pg_core_1.foreignKey)({
        columns: [table.merchantId],
        foreignColumns: [exports.merchant.id],
        name: "event_merchant_id_merchant_id_fk"
    }),
]; });
exports.couponRedemption = (0, pg_core_1.pgTable)("coupon_redemption", {
    id: (0, pg_core_1.uuid)().defaultRandom().primaryKey().notNull(),
    couponId: (0, pg_core_1.uuid)("coupon_id").notNull(),
    userId: (0, pg_core_1.uuid)("user_id").notNull(),
    redeemedAt: (0, pg_core_1.timestamp)("redeemed_at", { mode: 'string' }).defaultNow().notNull(),
    locationMeta: (0, pg_core_1.jsonb)("location_meta"),
    deletedAt: (0, pg_core_1.timestamp)("deleted_at", { mode: 'string' }),
}, function (table) { return [
    (0, pg_core_1.foreignKey)({
        columns: [table.couponId],
        foreignColumns: [exports.coupon.id],
        name: "coupon_redemption_coupon_id_coupon_id_fk"
    }).onDelete("cascade"),
    (0, pg_core_1.foreignKey)({
        columns: [table.userId],
        foreignColumns: [exports.user.id],
        name: "coupon_redemption_user_id_user_id_fk"
    }).onDelete("cascade"),
]; });
exports.user = (0, pg_core_1.pgTable)("user", {
    id: (0, pg_core_1.uuid)().defaultRandom().primaryKey().notNull(),
    cognitoSub: (0, pg_core_1.varchar)("cognito_sub", { length: 255 }).notNull(),
    email: (0, pg_core_1.varchar)({ length: 255 }).notNull(),
    name: (0, pg_core_1.varchar)({ length: 255 }).notNull(),
    role: (0, exports.role)().default('customer').notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { mode: 'string' }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { mode: 'string' }).defaultNow().notNull(),
    deletedAt: (0, pg_core_1.timestamp)("deleted_at", { mode: 'string' }),
}, function (table) { return [
    (0, pg_core_1.unique)("user_cognito_sub_unique").on(table.cognitoSub),
    (0, pg_core_1.unique)("user_email_unique").on(table.email),
]; });
exports.foodieGroup = (0, pg_core_1.pgTable)("foodie_group", {
    id: (0, pg_core_1.uuid)().defaultRandom().primaryKey().notNull(),
    slug: (0, pg_core_1.varchar)({ length: 255 }).notNull(),
    name: (0, pg_core_1.varchar)({ length: 255 }).notNull(),
    description: (0, pg_core_1.text)(),
    location: (0, pg_core_1.varchar)({ length: 255 }),
    bannerImageUrl: (0, pg_core_1.varchar)("banner_image_url", { length: 500 }),
    map: (0, pg_core_1.jsonb)(),
    socialLinks: (0, pg_core_1.jsonb)("social_links"),
    createdAt: (0, pg_core_1.timestamp)("created_at", { mode: 'string' }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { mode: 'string' }).defaultNow().notNull(),
    archivedAt: (0, pg_core_1.timestamp)("archived_at", { mode: 'string' }),
}, function (table) { return [
    (0, pg_core_1.unique)("foodie_group_slug_unique").on(table.slug),
]; });
exports.merchant = (0, pg_core_1.pgTable)("merchant", {
    id: (0, pg_core_1.uuid)().defaultRandom().primaryKey().notNull(),
    name: (0, pg_core_1.varchar)({ length: 255 }).notNull(),
    logoUrl: (0, pg_core_1.varchar)("logo_url", { length: 500 }),
    websiteUrl: (0, pg_core_1.varchar)("website_url", { length: 500 }),
    ownerId: (0, pg_core_1.uuid)("owner_id").notNull(),
    deletedAt: (0, pg_core_1.timestamp)("deleted_at", { mode: 'string' }),
    createdAt: (0, pg_core_1.timestamp)("created_at", { mode: 'string' }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, function (table) { return [
    (0, pg_core_1.foreignKey)({
        columns: [table.ownerId],
        foreignColumns: [exports.user.id],
        name: "merchant_owner_id_user_id_fk"
    }),
]; });
exports.foodieGroupMembership = (0, pg_core_1.pgTable)("foodie_group_membership", {
    id: (0, pg_core_1.uuid)().defaultRandom().primaryKey().notNull(),
    userId: (0, pg_core_1.uuid)("user_id").notNull(),
    groupId: (0, pg_core_1.uuid)("group_id").notNull(),
    role: (0, exports.role)().default('customer').notNull(),
    joinedAt: (0, pg_core_1.timestamp)("joined_at", { mode: 'string' }).defaultNow().notNull(),
    deletedAt: (0, pg_core_1.timestamp)("deleted_at", { mode: 'string' }),
}, function (table) { return [
    (0, pg_core_1.foreignKey)({
        columns: [table.userId],
        foreignColumns: [exports.user.id],
        name: "foodie_group_membership_user_id_user_id_fk"
    }).onDelete("cascade"),
    (0, pg_core_1.foreignKey)({
        columns: [table.groupId],
        foreignColumns: [exports.foodieGroup.id],
        name: "foodie_group_membership_group_id_foodie_group_id_fk"
    }).onDelete("cascade"),
]; });
exports.purchase = (0, pg_core_1.pgTable)("purchase", {
    id: (0, pg_core_1.uuid)().defaultRandom().primaryKey().notNull(),
    userId: (0, pg_core_1.uuid)("user_id").notNull(),
    groupId: (0, pg_core_1.uuid)("group_id").notNull(),
    stripeCheckoutId: (0, pg_core_1.varchar)("stripe_checkout_id", { length: 255 }).notNull(),
    stripeSubscriptionId: (0, pg_core_1.varchar)("stripe_subscription_id", { length: 255 }),
    amountCents: (0, pg_core_1.integer)("amount_cents").notNull(),
    currency: (0, pg_core_1.varchar)({ length: 10 }).notNull(),
    status: (0, exports.purchaseStatus)().notNull(),
    purchasedAt: (0, pg_core_1.timestamp)("purchased_at", { mode: 'string' }).notNull(),
    expiresAt: (0, pg_core_1.timestamp)("expires_at", { mode: 'string' }),
    refundedAt: (0, pg_core_1.timestamp)("refunded_at", { mode: 'string' }),
    createdAt: (0, pg_core_1.timestamp)("created_at", { mode: 'string' }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, function (table) { return [
    (0, pg_core_1.foreignKey)({
        columns: [table.userId],
        foreignColumns: [exports.user.id],
        name: "purchase_user_id_user_id_fk"
    }),
    (0, pg_core_1.foreignKey)({
        columns: [table.groupId],
        foreignColumns: [exports.foodieGroup.id],
        name: "purchase_group_id_foodie_group_id_fk"
    }),
    (0, pg_core_1.unique)("purchase_stripe_checkout_id_unique").on(table.stripeCheckoutId),
]; });
