import { relations } from "drizzle-orm/relations";
import { foodieGroup, couponSubmission, merchant, event, eventRsvp, user, coupon, eventSubmission, couponRedemption, foodieGroupMembership, purchase, merchantBillingProfile, eventOrder, eventRefund, eventGuestToken, eventDispute } from "./schema";

export const couponSubmissionRelations = relations(couponSubmission, ({one}) => ({
	foodieGroup: one(foodieGroup, {
		fields: [couponSubmission.groupId],
		references: [foodieGroup.id]
	}),
	merchant: one(merchant, {
		fields: [couponSubmission.merchantId],
		references: [merchant.id]
	}),
}));

export const foodieGroupRelations = relations(foodieGroup, ({many}) => ({
	couponSubmissions: many(couponSubmission),
	coupons: many(coupon),
	eventSubmissions: many(eventSubmission),
	events: many(event),
	foodieGroupMemberships: many(foodieGroupMembership),
	purchases: many(purchase),
}));

export const merchantRelations = relations(merchant, ({one, many}) => ({
	couponSubmissions: many(couponSubmission),
	coupons: many(coupon),
	eventSubmissions: many(eventSubmission),
	events: many(event),
	eventOrders: many(eventOrder),
	eventDisputes: many(eventDispute),
	billingProfiles: many(merchantBillingProfile),
	user: one(user, {
		fields: [merchant.ownerId],
		references: [user.id]
	}),
}));

export const merchantBillingProfileRelations = relations(merchantBillingProfile, ({one}) => ({
	merchant: one(merchant, {
		fields: [merchantBillingProfile.merchantId],
		references: [merchant.id]
	}),
}));

export const eventRsvpRelations = relations(eventRsvp, ({one}) => ({
	event: one(event, {
		fields: [eventRsvp.eventId],
		references: [event.id]
	}),
	user: one(user, {
		fields: [eventRsvp.userId],
		references: [user.id]
	}),
	eventOrder: one(eventOrder, {
		fields: [eventRsvp.id],
		references: [eventOrder.rsvpId]
	}),
}));

export const eventRelations = relations(event, ({one, many}) => ({
	eventRsvps: many(eventRsvp),
	eventOrders: many(eventOrder),
	eventRefunds: many(eventRefund),
	eventGuestTokens: many(eventGuestToken),
	eventDisputes: many(eventDispute),
	foodieGroup: one(foodieGroup, {
		fields: [event.groupId],
		references: [foodieGroup.id]
	}),
	merchant: one(merchant, {
		fields: [event.merchantId],
		references: [merchant.id]
	}),
}));

export const userRelations = relations(user, ({many}) => ({
	eventRsvps: many(eventRsvp),
	eventOrders: many(eventOrder),
	couponRedemptions: many(couponRedemption),
	merchants: many(merchant),
	foodieGroupMemberships: many(foodieGroupMembership),
	purchases: many(purchase),
}));

export const couponRelations = relations(coupon, ({one, many}) => ({
	foodieGroup: one(foodieGroup, {
		fields: [coupon.groupId],
		references: [foodieGroup.id]
	}),
	merchant: one(merchant, {
		fields: [coupon.merchantId],
		references: [merchant.id]
	}),
	couponRedemptions: many(couponRedemption),
}));

export const eventSubmissionRelations = relations(eventSubmission, ({one}) => ({
	foodieGroup: one(foodieGroup, {
		fields: [eventSubmission.groupId],
		references: [foodieGroup.id]
	}),
	merchant: one(merchant, {
		fields: [eventSubmission.merchantId],
		references: [merchant.id]
	}),
}));

export const couponRedemptionRelations = relations(couponRedemption, ({one}) => ({
	coupon: one(coupon, {
		fields: [couponRedemption.couponId],
		references: [coupon.id]
	}),
	user: one(user, {
		fields: [couponRedemption.userId],
		references: [user.id]
	}),
}));

export const foodieGroupMembershipRelations = relations(foodieGroupMembership, ({one}) => ({
	user: one(user, {
		fields: [foodieGroupMembership.userId],
		references: [user.id]
	}),
	foodieGroup: one(foodieGroup, {
		fields: [foodieGroupMembership.groupId],
		references: [foodieGroup.id]
	}),
}));

export const purchaseRelations = relations(purchase, ({one}) => ({
	user: one(user, {
		fields: [purchase.userId],
		references: [user.id]
	}),
	foodieGroup: one(foodieGroup, {
		fields: [purchase.groupId],
		references: [foodieGroup.id]
	}),
}));

export const eventOrderRelations = relations(eventOrder, ({one, many}) => ({
	event: one(event, {
		fields: [eventOrder.eventId],
		references: [event.id]
	}),
	eventRsvp: one(eventRsvp, {
		fields: [eventOrder.rsvpId],
		references: [eventRsvp.id]
	}),
	user: one(user, {
		fields: [eventOrder.userId],
		references: [user.id]
	}),
	foodieGroup: one(foodieGroup, {
		fields: [eventOrder.groupId],
		references: [foodieGroup.id]
	}),
	merchant: one(merchant, {
		fields: [eventOrder.merchantId],
		references: [merchant.id]
	}),
	eventRefunds: many(eventRefund),
	eventGuestTokens: many(eventGuestToken),
	eventDisputes: many(eventDispute),
}));

export const eventRefundRelations = relations(eventRefund, ({one}) => ({
	eventOrder: one(eventOrder, {
		fields: [eventRefund.eventOrderId],
		references: [eventOrder.id]
	}),
	eventRsvp: one(eventRsvp, {
		fields: [eventRefund.eventRsvpId],
		references: [eventRsvp.id]
	}),
	event: one(event, {
		fields: [eventRefund.eventId],
		references: [event.id]
	}),
	requestedByUser: one(user, {
		fields: [eventRefund.requestedByUserId],
		references: [user.id]
	}),
}));

export const eventGuestTokenRelations = relations(eventGuestToken, ({one}) => ({
	eventOrder: one(eventOrder, {
		fields: [eventGuestToken.eventOrderId],
		references: [eventOrder.id]
	}),
	eventRsvp: one(eventRsvp, {
		fields: [eventGuestToken.eventRsvpId],
		references: [eventRsvp.id]
	}),
	event: one(event, {
		fields: [eventGuestToken.eventId],
		references: [event.id]
	}),
}));

export const eventDisputeRelations = relations(eventDispute, ({one}) => ({
	eventOrder: one(eventOrder, {
		fields: [eventDispute.eventOrderId],
		references: [eventOrder.id]
	}),
	event: one(event, {
		fields: [eventDispute.eventId],
		references: [event.id]
	}),
	merchant: one(merchant, {
		fields: [eventDispute.merchantId],
		references: [merchant.id]
	}),
}));