<!-- src/views/Profile.vue -->
<template>
  <div class="profile-page container">
    <!-- NOT AUTHENTICATED STATE -->
    <section v-if="!isAuthenticated" class="section-card signin-card">
      <h1>Your Account</h1>
      <p class="subtitle">
        You need to be signed in to view your profile, coupon books, and redemptions.
      </p>

      <button class="btn primary" @click="signInNow">
        Sign In to Your Account
      </button>

      <p class="muted tiny">
        You’ll be redirected to the secure sign-in page and brought back here after.
      </p>
    </section>

    <!-- AUTHENTICATED STATE -->
    <template v-else>
      <!-- Header -->
      <header class="profile-header">
        <h1>Your Account</h1>
        <p class="subtitle">
          Manage your profile, coupon books, and redemptions.
        </p>
      </header>

      <!-- Top: User Information / Account Overview -->
      <section class="section-card account-card">
        <div class="account-header">
          <div>
            <h2>Account Overview</h2>
            <p class="muted">
              Signed in as <strong>{{ user?.email || '—' }}</strong>
            </p>
          </div>

          <span v-if="roleLabel" class="role-pill">
            {{ roleLabel }}
          </span>
        </div>

        <!-- Loading state while user is being fetched -->
        <div v-if="loadingUser" class="loading">Loading…</div>

        <!-- Error / missing state -->
        <div v-else-if="!user" class="loading">
          Unable to load profile.
        </div>

        <!-- User info once loaded -->
        <div v-else class="user-info">
          <div class="user-meta">
            <p><strong>Name:</strong> {{ user.name || 'Not set' }}</p>
            <p><strong>User ID:</strong> {{ user.id }}</p>
          </div>

          <button class="btn tertiary" @click="signOutNow">
            <i class="pi pi-sign-out icon-spacing-sm"></i>Sign Out
          </button>
        </div>
      </section>

      <!-- Role-based content layout -->
      <div v-if="user" class="profile-grid">
        <!-- CUSTOMER VIEW -->
        <template v-if="role === 'customer'">
          <!-- Coupon Activity -->
          <section class="section-card">
            <h2>Coupon Activity</h2>
            <p class="muted">
              Your personal stats for VivaSpot Coupon Book.
            </p>

            <div v-if="customerStats.error" class="muted tiny error-text" style="margin-bottom:0.5rem;">
              {{ customerStats.error }}
            </div>

            <div class="stat-row">
              <div class="stat-card">
                <span class="stat-number">
                  <span v-if="customerStats.loading">…</span>
                  <span v-else>
                    {{ customerStats.couponsRedeemed != null ? customerStats.couponsRedeemed : '—' }}
                  </span>
                </span>
                <span class="stat-label">Coupons Redeemed</span>
              </div>

              <div class="stat-card">
                <span class="stat-number">
                  <span v-if="customerStats.loading">…</span>
                  <span v-else>
                    {{ customerStats.activeCouponBooks != null ? customerStats.activeCouponBooks : '—' }}
                  </span>
                </span>
                <span class="stat-label">Active Coupon Books</span>
              </div>
            </div>
          </section>

          <!-- Upcoming RSVPs -->
          <section class="section-card" data-test="customer-rsvps-section">
            <ComingSoonOverlay v-if="!eventsEnabled">
              <div class="rsvps-coming-soon-placeholder">
                <h2>My RSVPs</h2>
                <p class="muted">
                  See your upcoming event RSVPs and manage attendance from your account.
                </p>
                <p class="muted">You do not have any upcoming RSVPs yet.</p>
              </div>
            </ComingSoonOverlay>
            <template v-else>
              <h2>My RSVPs</h2>
              <p class="muted">
                See your upcoming event RSVPs and manage attendance from your account.
              </p>

              <div v-if="customerRsvps.error" class="muted tiny error-text" style="margin-bottom:0.5rem;">
                {{ customerRsvps.error }}
              </div>

              <div v-if="customerRsvps.loading" class="loading">Loading RSVPs…</div>

              <p v-else-if="!customerRsvps.items.length" class="muted">
                You do not have any upcoming RSVPs yet.
              </p>

              <ul v-else class="rsvp-list">
                <li v-for="rsvp in customerRsvps.items" :key="rsvp.id" class="rsvp-item">
                  <div class="rsvp-copy">
                    <div class="rsvp-title-row">
                      <strong>{{ rsvp.eventName }}</strong>
                      <span class="status-badge" :class="rsvpBadgeClass(rsvp.status)">
                        {{ rsvpBadgeLabel(rsvp) }}
                      </span>
                    </div>
                    <div class="muted tiny">
                      <span v-if="rsvp.merchantName">{{ rsvp.merchantName }} · </span>
                      {{ formatDateDateTime(rsvp.startDatetime) }}
                      <span v-if="rsvp.location"> · {{ rsvp.location }}</span>
                    </div>
                    <div class="muted tiny">
                      {{ rsvp.attendees }} {{ rsvp.attendees === 1 ? 'guest' : 'guests' }}
                      <span v-if="rsvp.order"> · {{ formatRsvpOrder(rsvp.order) }}</span>
                    </div>
                  </div>
                  <div class="rsvp-actions">
                    <button type="button" class="btn tertiary compact" @click="goToRsvpEvent(rsvp)">
                      View Event
                    </button>
                    <button
                      v-if="rsvp.ticketCode"
                      type="button"
                      class="btn tertiary compact"
                      @click="ticketShownRsvpId = ticketShownRsvpId === rsvp.id ? null : rsvp.id"
                    >
                      {{ ticketShownRsvpId === rsvp.id ? 'Hide Ticket' : 'Show Ticket' }}
                    </button>
                    <button
                      type="button"
                      class="btn danger compact"
                      @click="cancellingRsvp = rsvp"
                    >
                      Cancel RSVP
                    </button>
                  </div>
                  <div v-if="ticketShownRsvpId === rsvp.id && rsvp.ticketCode" class="rsvp-ticket">
                    <QRCode :value="ticketCheckinUrl(rsvp)" :size="160" level="M" />
                    <p class="muted tiny">Show this QR code at the door.</p>
                  </div>
                </li>
              </ul>
            </template>

            <CancelRsvpModal
              v-if="cancellingRsvp"
              :event-id="cancellingRsvp.eventId"
              :rsvp-id="cancellingRsvp.id"
              :event-name="cancellingRsvp.eventName"
              @close="cancellingRsvp = null"
              @cancelled="onRsvpCancelled"
            />
          </section>

          <!-- Purchased Coupon Books -->
          <section class="section-card">
            <h2>Purchased Coupon Books</h2>

            <p class="muted" v-if="!customerStats.loading && !customerStats.purchases.length">
              Once you unlock a foodie group, it will show up here with purchase and expiry info.
            </p>

            <!-- Skeleton while loading -->
            <ul v-if="customerStats.loading" class="skeleton-list">
              <li class="skeleton-item"></li>
              <li class="skeleton-item"></li>
              <li class="skeleton-item"></li>
            </ul>

            <!-- Actual list -->
            <ul v-else-if="customerStats.purchases.length" class="purchases-list">
              <li v-for="p in customerStats.purchases" :key="p.id" class="purchase-item">
                <div class="purchase-main">
                  <strong>{{ p.groupName }}</strong>
                  <span class="muted tiny">
                    · Purchased {{ formatDateMedium(p.purchasedAt) }}
                  </span>
                  <!-- Access-type badge: always render one so the user knows
                       how they got access (subscription / gift / admin grant
                       / one-time purchase). -->
                  <span class="status-badge" :class="purchaseBadgeClass(p)">
                    {{ purchaseBadgeLabel(p) }}
                  </span>
                  <span v-if="p.cancelAtPeriodEnd" class="status-badge canceling-badge">
                    Cancels at period end
                  </span>
                </div>
                <div class="muted tiny">
                  Status: {{ p.status }}
                  <span v-if="p.subscriptionStatus === 'active' && p.currentPeriodEnd">
                    · Renews {{ formatDateMedium(p.currentPeriodEnd) }}
                  </span>
                  <span v-else-if="p.expiresAt">
                    · Expires {{ formatDateMedium(p.expiresAt) }}
                  </span>
                  <span v-else>
                    · Perpetual access
                  </span>
                </div>
                <div v-if="p.stripeCustomerId && p.subscriptionStatus" class="purchase-actions">
                  <button
                    type="button"
                    class="btn btn-sm btn-secondary"
                    :disabled="billingPortalLoadingId === p.id"
                    @click="openBillingPortal(p)"
                  >
                    {{ billingPortalLoadingId === p.id ? 'Opening…' : 'Manage Billing' }}
                  </button>
                </div>
              </li>
            </ul>
          </section>

          <!-- Event Credits (issued in lieu of cash refunds on cancellations) -->
          <section v-if="customerCredits.items.length || customerCredits.error" class="section-card">
            <h2>Event Credits</h2>
            <p v-if="customerCredits.error" class="muted tiny error-text">{{ customerCredits.error }}</p>
            <ul v-else class="purchases-list">
              <li v-for="c in customerCredits.items" :key="c.id" class="purchase-item">
                <div class="purchase-main">
                  <strong>{{ formatCreditAmount(c) }}</strong>
                  <span class="muted tiny" v-if="c.merchantName"> · at {{ c.merchantName }}</span>
                  <span class="status-badge" :class="c.status === 'active' ? 'subscription-badge' : 'canceled-badge'">
                    {{ c.status === 'active' ? 'Active' : c.status === 'redeemed' ? 'Used' : 'Expired' }}
                  </span>
                </div>
                <div class="muted tiny">
                  <span v-if="c.status === 'active'">
                    Valid until {{ formatDateMedium(c.expiresAt) }} — applied automatically at your next event checkout at this restaurant.
                  </span>
                  <span v-else-if="c.status === 'redeemed' && c.redeemedAt">
                    Used {{ formatDateMedium(c.redeemedAt) }}
                  </span>
                  <span v-else>
                    Expired {{ formatDateMedium(c.expiresAt) }}
                  </span>
                </div>
              </li>
            </ul>
          </section>
        </template>


        <!-- MERCHANT VIEW -->
        <template v-else-if="role === 'merchant'">
          <!-- Merchant Profile / Restaurants -->
          <section class="section-card">
            <h2>Your Restaurants</h2>
            <p class="muted">
              Manage each restaurant’s profile. Logo upload will be per restaurant and
              reused on all coupons for that location.
            </p>

            <!-- No restaurants yet -->
            <div v-if="merchants.length === 0" class="muted small" style="margin-top: 0.75rem;">
              You don’t have any restaurants linked to your account yet.
            </div>

            <!-- List of restaurants -->
            <div v-else class="merchant-list">
              <article v-for="m in merchants" :key="m.id" class="merchant-card">
                <div class="merchant-card-header">
                  <div class="merchant-logo-placeholder">
                    <!-- If logo exists, show image, else initials -->
                    <img v-if="m.logo_url" :src="m.logo_url" :alt="m.name || 'Merchant logo'"
                      class="merchant-logo-img" />
                    <span v-else class="initials">
                      {{ (m.name || 'VS').trim().charAt(0).toUpperCase() }}
                    </span>
                  </div>
                  <div style="flex:1;">
                    <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                      <h3 style="margin:0;">{{ m.name }}</h3>
                      <span v-if="m.access === 'admin'" class="access-badge admin-access-badge">Admin</span>
                    </div>
                    <p class="muted tiny">
                      Merchant ID: {{ m.id }}
                    </p>
                  </div>
                </div>

                <div class="merchant-card-body">
                  <div class="website-edit-row">
                    <label :for="`website-${m.id}`" class="website-label">Website</label>
                    <div class="website-input-group">
                      <i class="pi pi-globe website-input-icon" aria-hidden="true"></i>
                      <input
                        :id="`website-${m.id}`"
                        type="url"
                        class="website-input"
                        placeholder="https://example.com"
                        v-model="websiteDrafts[m.id]"
                        :disabled="websiteSavingId === m.id"
                        @keyup.enter="saveMerchantWebsite(m)"
                      />
                    </div>
                    <button
                      type="button"
                      class="btn btn-primary btn-compact"
                      :disabled="websiteSavingId === m.id || !isWebsiteDirty(m)"
                      @click="saveMerchantWebsite(m)"
                    >
                      {{ websiteSavingId === m.id ? 'Saving…' : 'Save' }}
                    </button>
                  </div>
                  <p
                    v-if="websiteSaveError && websiteSaveErrorMerchantId === m.id"
                    class="muted tiny error-text"
                    style="margin-top: 0.25rem;"
                  >
                    {{ websiteSaveError }}
                  </p>
                  <p
                    v-else-if="websiteSavedMerchantId === m.id"
                    class="muted tiny"
                    style="margin-top: 0.25rem;"
                  >
                    Website saved.
                  </p>

                  <!-- Logo upload controls -->
                  <div class="logo-upload-row">
                    <label class="file-label">
                      <span class="file-label-text">
                        <i class="pi pi-upload icon-spacing-sm"></i>{{ m.logo_url ? 'Change Logo' : 'Upload Logo' }}
                      </span>
                      <input type="file" accept="image/*" @change="onLogoFileChange(m, $event)" />
                    </label>

                    <span v-if="uploadingLogoId === m.id" class="muted tiny" style="margin-left: 0.5rem;">
                      Uploading…
                    </span>
                  </div>

                  <p v-if="logoUploadError && uploadErrorMerchantId === m.id" class="muted tiny error-text"
                    style="margin-top: 0.25rem;">
                    {{ logoUploadError }}
                  </p>

                  <p class="muted tiny" style="margin-top: 0.5rem;">
                    Recommended: square PNG or JPG, up to 5 MB. This logo will be used on
                    all coupons for this restaurant.
                  </p>

                  <!-- Admins section -->
                  <div class="merchant-admins-section">
                    <div class="merchant-admins-header">
                      <strong>Admins</strong>
                      <button class="btn-action" @click="openAddAdminModal(m.id)">
                        <i class="pi pi-user-plus icon-spacing-sm"></i>Add Admin
                      </button>
                    </div>
                    <div v-if="merchantAdminsLoading[m.id]" class="muted tiny">Loading…</div>
                    <ul v-else-if="merchantAdmins[m.id] && merchantAdmins[m.id].length" class="admin-member-list">
                      <li v-for="admin in merchantAdmins[m.id]" :key="admin.userId" class="admin-member-row">
                        <span class="admin-initials">{{ (admin.name || admin.email || 'A').charAt(0).toUpperCase() }}</span>
                        <span class="admin-info">
                          <span class="admin-name">{{ admin.name }}</span>
                          <span class="admin-email muted tiny">{{ admin.email }}</span>
                        </span>
                        <button
                          class="btn-action danger-action"
                          :disabled="removingAdminId === admin.userId"
                          @click="removeMerchantAdmin(m.id, admin.userId)"
                        >
                          <i class="pi pi-times"></i>
                        </button>
                      </li>
                    </ul>
                    <p v-else class="muted tiny">No additional admins yet.</p>
                  </div>
                </div>
              </article>
            </div>
          </section>

          <!-- Merchant Tools -->
          <section class="section-card">
            <h2>Merchant Tools</h2>
            <p class="muted">
              These tools apply to all restaurants linked to your account. Later we’ll
              add filters so you can focus on a single location at a time.
            </p>

            <p v-if="merchantOverviewError" class="tiny error-text" style="margin-top: 0.5rem;">
              {{ merchantOverviewError }}
            </p>

            <div class="stat-row" style="margin-top: 1rem; margin-bottom: 1rem;">
              <div class="stat-card">
                <span class="stat-number">
                  <span v-if="merchantOverviewLoading">…</span>
                  <span v-else>{{ merchantOverview.redemptionsLast30Days }}</span>
                </span>
                <span class="stat-label">Redemptions (Last 30 Days)</span>
              </div>

              <div class="stat-card">
                <span class="stat-number">
                  <span v-if="merchantOverviewLoading">…</span>
                  <span v-else>{{ merchantOverview.topCoupon ? merchantOverview.topCoupon.couponTitle : 'None yet' }}</span>
                </span>
                <span class="stat-label">Top Coupon (Last 30 Days)</span>
                <span v-if="!merchantOverviewLoading && merchantOverview.topCoupon" class="muted tiny">
                  {{ merchantOverview.topCoupon.redemptions }} redemption{{ merchantOverview.topCoupon.redemptions === 1 ? '' : 's' }}
                </span>
              </div>
            </div>

            <ul class="link-list">
              <!-- Create / Submit -->
              <li class="link-row clickable" @click="goToCouponSubmissions">
                <span class="link-label"><i class="pi pi-plus-circle icon-spacing-sm"></i>Create / Submit a
                  Coupon</span>
                <span class="link-helper">
                  Open the submission form and choose which restaurant the coupon belongs to.
                </span>
              </li>

              <!-- Approved -->
              <li class="link-row clickable" @click="loadApprovedCoupons">
                <span class="link-label"><i class="pi pi-check-circle icon-spacing-sm"></i>View Approved Coupons</span>
                <span class="link-helper">
                  See all live, approved coupons across your restaurants.
                </span>
              </li>

              <!-- Pending -->
              <li class="link-row clickable" @click="loadPendingCoupons">
                <span class="link-label"><i class="pi pi-clock icon-spacing-sm"></i>View Pending Submissions</span>
                <span class="link-helper">
                  Review and edit submissions awaiting Foodie Group approval.
                </span>
              </li>

              <!-- Rejected -->
              <li class="link-row clickable" @click="loadRejectedCoupons">
                <span class="link-label"><i class="pi pi-times-circle icon-spacing-sm"></i>View Rejected Coupons</span>
                <span class="link-helper">
                  Review coupons that were not approved and see the reason.
                </span>
              </li>

              <!-- Insights -->
              <li class="link-row clickable" @click="loadRedemptionInsights">
                <span class="link-label"><i class="pi pi-chart-bar icon-spacing-sm"></i>Redemption Insights</span>
                <span class="link-helper">
                  See how many times coupons from your restaurants have been redeemed.
                </span>
              </li>

              <!-- Divider -->
              <li class="link-divider"><span>Events</span></li>

              <!-- Submit Event -->
              <li class="link-row clickable" @click="goToEventSubmissions">
                <span class="link-label"><i class="pi pi-calendar-plus icon-spacing-sm"></i>Submit a New Event</span>
                <span class="link-helper">
                  Propose an event for your restaurant. The Foodie Group will review and approve it.
                </span>
              </li>

              <!-- Pending Events -->
              <li class="link-row clickable" @click="loadPendingEvents">
                <span class="link-label"><i class="pi pi-clock icon-spacing-sm"></i>View Pending Event Submissions</span>
                <span class="link-helper">
                  Review and edit event submissions awaiting Foodie Group approval.
                </span>
              </li>

              <!-- Rejected Events -->
              <li class="link-row clickable" @click="loadRejectedEvents">
                <span class="link-label"><i class="pi pi-times-circle icon-spacing-sm"></i>View Rejected Events</span>
                <span class="link-helper">
                  Review event submissions that were not approved and see the reason.
                </span>
              </li>

              <!-- Event Attendees -->
              <li class="link-row clickable" @click="loadEventInsights">
                <span class="link-label"><i class="pi pi-calendar icon-spacing-sm"></i>Your Events</span>
                <span class="link-helper">
                  Add a banner image, see who has RSVPed, and manage attendance.
                </span>
              </li>
            </ul>

            <!-- Status / errors -->
            <p v-if="merchantToolsLoading" class="muted tiny" style="margin-top: 0.75rem;">
              Loading…
            </p>
            <p v-if="merchantToolsError" class="tiny error-text" style="margin-top: 0.5rem;">
              {{ merchantToolsError }}
            </p>

            <!-- Approved coupons list -->
            <div v-if="activeToolsView === 'approved' && approvedCoupons.length" class="tools-results-block">
              <h3 class="tiny-heading">Approved Coupons</h3>
              <ul class="tiny-list">
                <li v-for="c in approvedCoupons" :key="c.id">
                  <strong>{{ c.title }}</strong>
                  <span class="muted tiny">
                    · {{ merchantNameById(c.merchant_id) }}
                  </span>
                </li>
              </ul>
            </div>

            <!-- Pending coupon submissions -->
            <div v-if="activeToolsView === 'pending' && pendingCoupons.length" class="tools-results-block">
              <h3 class="tiny-heading">Pending Submissions</h3>
              <ul class="tiny-list">
                <li v-for="sub in pendingCoupons" :key="sub.id" class="pending-row">
                  <div>
                    <strong>{{ sub.submissionData?.title || 'Untitled coupon' }}</strong>
                    <span class="muted tiny">
                      · {{ sub.merchantName || merchantNameById(sub.merchantId) }}
                    </span>
                    <br />
                    <span class="muted tiny">
                      Submitted {{ formatDateTiny(sub.submittedAt) }}
                      <span v-if="sub.updatedAt"> · Edited {{ formatDateTiny(sub.updatedAt) }}</span>
                    </span>
                  </div>
                  <span class="badge badge-pending">Pending</span>
                  <button class="btn tertiary compact" @click="goToEditSubmission(sub.id)">
                    Edit
                  </button>
                </li>
              </ul>
            </div>

            <!-- Rejected coupon submissions -->
            <div v-if="activeToolsView === 'rejected' && rejectedCoupons.length" class="tools-results-block">
              <h3 class="tiny-heading">Rejected Coupons</h3>
              <ul class="tiny-list">
                <li v-for="sub in rejectedCoupons" :key="sub.id">
                  <strong>{{ sub.submissionData?.title || 'Untitled coupon' }}</strong>
                  <span class="muted tiny">
                    · {{ merchantNameById(sub.merchantId) }}
                  </span>
                  <br />
                  <span class="muted tiny">
                    Rejected on
                    {{ formatDateTiny(sub.submittedAt) }}
                    <span v-if="sub.rejectionMessage">
                      — Reason: {{ sub.rejectionMessage }}
                    </span>
                  </span>
                </li>
              </ul>
            </div>

            <!-- Pending event submissions -->
            <div v-if="activeToolsView === 'pending-events' && pendingEvents.length" class="tools-results-block">
              <h3 class="tiny-heading">Pending Event Submissions</h3>
              <ul class="tiny-list">
                <li v-for="sub in pendingEvents" :key="sub.id" class="pending-row">
                  <div>
                    <strong>{{ sub.submissionData?.name || 'Untitled event' }}</strong>
                    <span class="muted tiny">
                      · {{ sub.merchantName || merchantNameById(sub.merchantId) }}
                    </span>
                    <br />
                    <span class="muted tiny">
                      Submitted {{ formatDateTiny(sub.submittedAt) }}
                      <span v-if="sub.updatedAt"> · Edited {{ formatDateTiny(sub.updatedAt) }}</span>
                    </span>
                  </div>
                  <span class="badge badge-pending">Pending</span>
                  <button class="btn tertiary compact" @click="goToEditEventSubmission(sub.id)">
                    Edit
                  </button>
                </li>
              </ul>
            </div>

            <!-- Rejected event submissions -->
            <div v-if="activeToolsView === 'rejected-events' && rejectedEvents.length" class="tools-results-block">
              <h3 class="tiny-heading">Rejected Events</h3>
              <ul class="tiny-list">
                <li v-for="sub in rejectedEvents" :key="sub.id">
                  <strong>{{ sub.submissionData?.name || 'Untitled event' }}</strong>
                  <span class="muted tiny">· {{ merchantNameById(sub.merchantId) }}</span>
                  <br />
                  <span class="muted tiny">
                    Rejected on {{ formatDateTiny(sub.submittedAt) }}
                    <span v-if="sub.rejectionMessage"> — Reason: {{ sub.rejectionMessage }}</span>
                  </span>
                </li>
              </ul>
            </div>

            <!-- Empty states for event views -->
            <div v-if="activeToolsView === 'pending-events' && !merchantToolsLoading && !pendingEvents.length"
              class="muted tiny" style="margin-top: 0.5rem;">
              No pending event submissions found for your restaurants.
            </div>
            <div v-if="activeToolsView === 'rejected-events' && !merchantToolsLoading && !rejectedEvents.length"
              class="muted tiny" style="margin-top: 0.5rem;">
              No rejected event submissions found for your restaurants.
            </div>

            <!-- Redemption insights summary -->
            <div v-if="activeToolsView === 'insights' && redemptionInsights.length" class="tools-results-block">
              <h3 class="tiny-heading">Redemption Insights</h3>
              <ul class="insights-list">
                <li v-for="row in redemptionInsights" :key="row.couponId" class="insight-row">
                  <div class="insight-copy">
                    <strong>{{ row.merchantName }}</strong>
                    <div class="muted tiny">{{ row.couponTitle }}</div>
                    <div class="muted tiny">
                      {{ row.redemptions }} redemptions
                      <span v-if="row.lastRedeemedAt">
                        · Last redeemed {{ formatDateDateTime(row.lastRedeemedAt) }}
                      </span>
                    </div>
                  </div>

                  <button class="btn tertiary compact" @click="loadRedemptionDetails(row.couponId)">
                    {{ selectedCouponId === row.couponId ? 'Refresh redeemers' : 'View redeemers' }}
                  </button>
                </li>
              </ul>

              <div v-if="selectedCouponRow" class="redemption-details-block">
                <div class="details-header">
                  <div>
                    <strong>{{ selectedCouponRow.couponTitle }}</strong>
                    <div class="muted tiny">{{ selectedCouponRow.merchantName }}</div>
                  </div>
                  <span class="muted tiny">
                    {{ displayedRedemptionDetails.length }} row{{ displayedRedemptionDetails.length === 1 ? '' : 's' }}
                  </span>
                </div>

                <div class="details-actions">
                  <button
                    class="btn tertiary compact"
                    @click="copyRedeemerEmails"
                    :disabled="detailsLoading || !displayedRedemptionDetails.length"
                  >
                    Copy emails
                  </button>
                  <button
                    class="btn tertiary compact"
                    @click="exportRedemptionDetails"
                    :disabled="detailsLoading || exportingDetails"
                  >
                    {{ exportingDetails ? 'Exporting…' : 'Export CSV' }}
                  </button>
                  <label class="checkbox-row muted tiny">
                    <input type="checkbox" v-model="uniqueEmailsOnly" />
                    Show unique emails only
                  </label>
                </div>

                <p v-if="detailsLoading" class="muted tiny">Loading redeemers…</p>
                <p v-else-if="detailsError" class="tiny error-text">{{ detailsError }}</p>

                <div v-else-if="displayedRedemptionDetails.length" class="details-table-wrap">
                  <table class="details-table">
                    <thead>
                      <tr>
                        <th>Customer name</th>
                        <th>Customer email</th>
                        <th>Redeemed at</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="row in displayedRedemptionDetails" :key="row.redemptionId">
                        <td>{{ row.customerName || '—' }}</td>
                        <td>{{ row.customerEmail || '—' }}</td>
                        <td>{{ formatDateDateTime(row.redeemedAt) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <p v-else class="muted tiny">
                  No redeemers found for this coupon.
                </p>
              </div>
            </div>

            <!-- Empty states per view -->
            <div v-if="activeToolsView === 'approved' && !merchantToolsLoading && !approvedCoupons.length"
              class="muted tiny" style="margin-top: 0.5rem;">
              No approved coupons found for your restaurants yet.
            </div>

            <div v-if="activeToolsView === 'pending' && !merchantToolsLoading && !pendingCoupons.length"
              class="muted tiny" style="margin-top: 0.5rem;">
              No pending coupon submissions found for your restaurants.
            </div>

            <div v-if="activeToolsView === 'rejected' && !merchantToolsLoading && !rejectedCoupons.length"
              class="muted tiny" style="margin-top: 0.5rem;">
              No rejected coupon submissions found for your restaurants.
            </div>

            <div v-if="activeToolsView === 'insights' && !merchantToolsLoading && !redemptionInsights.length"
              class="muted tiny" style="margin-top: 0.5rem;">
              No redemptions recorded yet for coupons from your restaurants.
            </div>

            <!-- Event attendees list -->
            <div v-if="activeToolsView === 'event-attendees' && eventInsights.length" class="tools-results-block">
              <h3 class="tiny-heading">Your Events</h3>
              <ul class="insights-list">
                <li v-for="row in eventInsights" :key="row.eventId" class="insight-row insight-row-stack">
                  <div class="insight-row-main">
                    <div class="insight-copy">
                      <strong>{{ row.eventName }}</strong>
                      <div class="muted tiny">{{ row.merchantName }}</div>
                      <div class="muted tiny">
                        {{ row.confirmedRsvps }} confirmed · {{ row.waitlistCount }} waitlisted
                        <span v-if="row.startDatetime"> · {{ formatDateDateTime(row.startDatetime) }}</span>
                        <span v-if="!row.bannerImageUrl"> · <span class="muted">no banner</span></span>
                      </div>
                    </div>
                    <div class="insight-row-actions">
                      <button class="btn tertiary compact" @click="toggleBannerEditor(row.eventId)">
                        <i class="pi pi-image icon-spacing-sm"></i>{{ bannerEditEventId === row.eventId ? 'Close' : (row.bannerImageUrl ? 'Edit banner' : 'Add banner') }}
                      </button>
                      <button class="btn tertiary compact" @click="loadEventAttendeeDetails(row.eventId)">
                        {{ selectedEventId === row.eventId ? 'Refresh' : 'View attendees' }}
                      </button>
                    </div>
                  </div>
                  <EventBannerManager
                    v-if="bannerEditEventId === row.eventId"
                    :event-id="row.eventId"
                    :merchant-id="row.merchantId"
                    :banner-image-url="row.bannerImageUrl"
                    :cover-image-url="row.coverImageUrl"
                    @updated="onEventImagesUpdated"
                  />
                </li>
              </ul>

              <div v-if="selectedEventRow" class="redemption-details-block">
                <div class="details-header">
                  <div>
                    <strong>{{ selectedEventRow.eventName }}</strong>
                    <div class="muted tiny">{{ selectedEventRow.merchantName }}</div>
                  </div>
                  <span class="muted tiny">{{ eventAttendees.length }} attendee{{ eventAttendees.length === 1 ? '' : 's' }}</span>
                </div>

                <div class="details-actions">
                  <button class="btn tertiary compact" @click="copyAttendeeEmails" :disabled="eventAttendeesLoading || !eventAttendees.length">
                    Copy emails
                  </button>
                </div>

                <p v-if="eventAttendeesLoading" class="muted tiny">Loading attendees…</p>
                <p v-else-if="eventAttendeesError" class="tiny error-text">{{ eventAttendeesError }}</p>

                <div v-else-if="eventAttendees.length" class="details-table-wrap">
                  <table class="details-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Party</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="a in eventAttendees" :key="a.id">
                        <td>{{ a.userName || a.guestName || '—' }}</td>
                        <td>{{ a.userEmail || a.guestEmail || '—' }}</td>
                        <td>{{ a.attendees }}</td>
                        <td>{{ a.status }}</td>
                        <td class="table-actions">
                          <button class="btn tertiary compact" :disabled="a.status !== 'waitlist'" @click="promoteAttendee(a)">Promote</button>
                          <button class="btn tertiary compact" :disabled="a.status === 'cancelled'" @click="cancelAttendeeRsvp(a)">Cancel</button>
                          <button class="btn tertiary compact" :disabled="a.status !== 'going'" @click="checkInAttendee(a)">Check-in</button>
                          <button class="btn tertiary compact" :disabled="a.status !== 'going' && a.status !== 'checked_in'" @click="markNoShowAttendee(a)">No-show</button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <p v-else class="muted tiny">No attendees found for this event.</p>
              </div>
            </div>

            <div v-if="activeToolsView === 'event-attendees' && !merchantToolsLoading && !eventInsights.length"
              class="muted tiny" style="margin-top: 0.5rem;">
              No events found for your restaurants yet.
            </div>
          </section>

        </template>

        <!-- FOODIE GROUP ADMIN VIEW -->
        <template v-else-if="adminMemberships.length > 0 && role !== 'super_admin'">
          <section class="section-card">
            <h2>Foodie Group Admin</h2>
            <p class="muted">
              Your main controls live in the Foodie Group dashboard. This page is
              just a quick overview.
            </p>

            <div class="admin-block">
              <p>
                You’re set up as a <strong>Foodie Group Admin</strong>. Soon,
                we’ll show a summary of your groups and key metrics here.
              </p>

              <button
                class="btn primary"
                data-test="foodie-group-dashboard-btn"
                @click="goToFoodieGroupDashboard"
              >
                Go to Foodie Group Dashboard
              </button>
              <p class="muted tiny">Access is limited to approved admins.</p>
            </div>
          </section>

          <!-- Merchant capability: show restaurants if foodie_group_admin owns any -->
          <template v-if="hasMerchantCapability">
            <section class="section-card">
              <h2>Your Restaurants</h2>
              <p class="muted">
                Manage each restaurant's profile. Logo upload will be per restaurant and
                reused on all coupons for that location.
              </p>

              <!-- List of restaurants -->
              <div class="merchant-list">
                <article v-for="m in merchants" :key="m.id" class="merchant-card">
                  <div class="merchant-card-header">
                    <div class="merchant-logo-placeholder">
                      <img v-if="m.logo_url" :src="m.logo_url" :alt="m.name || 'Merchant logo'"
                        class="merchant-logo-img" />
                      <span v-else class="initials">
                        {{ (m.name || 'VS').trim().charAt(0).toUpperCase() }}
                      </span>
                    </div>
                    <div style="flex:1;">
                      <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                        <h3 style="margin:0;">{{ m.name }}</h3>
                        <span v-if="m.access === 'admin'" class="access-badge admin-access-badge">Admin</span>
                      </div>
                      <p class="muted tiny">
                        Merchant ID: {{ m.id }}
                      </p>
                    </div>
                  </div>

                  <div class="merchant-card-body">
                    <div class="website-edit-row">
                      <label :for="`website-alt-${m.id}`" class="website-label">Website</label>
                      <div class="website-input-group">
                        <i class="pi pi-globe website-input-icon" aria-hidden="true"></i>
                        <input
                          :id="`website-alt-${m.id}`"
                          type="url"
                          class="website-input"
                          placeholder="https://example.com"
                          v-model="websiteDrafts[m.id]"
                          :disabled="websiteSavingId === m.id"
                          @keyup.enter="saveMerchantWebsite(m)"
                        />
                      </div>
                      <button
                        type="button"
                        class="btn btn-primary btn-compact"
                        :disabled="websiteSavingId === m.id || !isWebsiteDirty(m)"
                        @click="saveMerchantWebsite(m)"
                      >
                        {{ websiteSavingId === m.id ? 'Saving…' : 'Save' }}
                      </button>
                    </div>
                    <p
                      v-if="websiteSaveError && websiteSaveErrorMerchantId === m.id"
                      class="muted tiny error-text"
                      style="margin-top: 0.25rem;"
                    >
                      {{ websiteSaveError }}
                    </p>
                    <p
                      v-else-if="websiteSavedMerchantId === m.id"
                      class="muted tiny"
                      style="margin-top: 0.25rem;"
                    >
                      Website saved.
                    </p>

                    <div class="logo-upload-row">
                      <label class="file-label">
                        <span class="file-label-text">
                          <i class="pi pi-upload icon-spacing-sm"></i>{{ m.logo_url ? 'Change Logo' : 'Upload Logo' }}
                        </span>
                        <input type="file" accept="image/*" @change="onLogoFileChange(m, $event)" />
                      </label>

                      <span v-if="uploadingLogoId === m.id" class="muted tiny" style="margin-left: 0.5rem;">
                        Uploading…
                      </span>
                    </div>

                    <p v-if="logoUploadError && uploadErrorMerchantId === m.id" class="muted tiny error-text"
                      style="margin-top: 0.25rem;">
                      {{ logoUploadError }}
                    </p>

                    <p class="muted tiny" style="margin-top: 0.5rem;">
                      Recommended: square PNG or JPG, up to 5 MB. This logo will be used on
                      all coupons for this restaurant.
                    </p>

                    <!-- Admins section -->
                    <div class="merchant-admins-section">
                      <div class="merchant-admins-header">
                        <strong>Admins</strong>
                        <button class="btn-action" @click="openAddAdminModal(m.id)">
                          <i class="pi pi-user-plus icon-spacing-sm"></i>Add Admin
                        </button>
                      </div>
                      <div v-if="merchantAdminsLoading[m.id]" class="muted tiny">Loading…</div>
                      <ul v-else-if="merchantAdmins[m.id] && merchantAdmins[m.id].length" class="admin-member-list">
                        <li v-for="admin in merchantAdmins[m.id]" :key="admin.userId" class="admin-member-row">
                          <span class="admin-initials">{{ (admin.name || admin.email || 'A').charAt(0).toUpperCase() }}</span>
                          <span class="admin-info">
                            <span class="admin-name">{{ admin.name }}</span>
                            <span class="admin-email muted tiny">{{ admin.email }}</span>
                          </span>
                          <button
                            class="btn-action danger-action"
                            :disabled="removingAdminId === admin.userId"
                            @click="removeMerchantAdmin(m.id, admin.userId)"
                          >
                            <i class="pi pi-times"></i>
                          </button>
                        </li>
                      </ul>
                      <p v-else class="muted tiny">No additional admins yet.</p>
                    </div>
                  </div>
                </article>
              </div>
            </section>

            <section class="section-card">
              <h2>Merchant Tools</h2>
              <p class="muted">
                These tools apply to all restaurants linked to your account.
              </p>

              <ul class="link-list">
                <li class="link-row clickable" @click="goToCouponSubmissions">
                  <span class="link-label"><i class="pi pi-plus-circle icon-spacing-sm"></i>Create / Submit a
                    Coupon</span>
                  <span class="link-helper">
                    Open the submission form and choose which restaurant the coupon belongs to.
                  </span>
                </li>

                <li class="link-row clickable" @click="loadApprovedCoupons">
                  <span class="link-label"><i class="pi pi-check-circle icon-spacing-sm"></i>View Approved
                    Coupons</span>
                  <span class="link-helper">
                    See all live, approved coupons across your restaurants.
                  </span>
                </li>

                <li class="link-row clickable" @click="loadPendingCoupons">
                  <span class="link-label"><i class="pi pi-clock icon-spacing-sm"></i>View Pending
                    Submissions</span>
                  <span class="link-helper">
                    Review and edit submissions awaiting Foodie Group approval.
                  </span>
                </li>

                <li class="link-row clickable" @click="loadRejectedCoupons">
                  <span class="link-label"><i class="pi pi-times-circle icon-spacing-sm"></i>View Rejected
                    Coupons</span>
                  <span class="link-helper">
                    Review coupons that were not approved and see the reason.
                  </span>
                </li>

                <li class="link-row clickable" @click="loadRedemptionInsights">
                  <span class="link-label"><i class="pi pi-chart-bar icon-spacing-sm"></i>Redemption Insights</span>
                  <span class="link-helper">
                    See how many times coupons from your restaurants have been redeemed.
                  </span>
                </li>

                <!-- Divider -->
                <li class="link-divider"><span>Events</span></li>

                <!-- Submit Event -->
                <li class="link-row clickable" @click="goToEventSubmissions">
                  <span class="link-label"><i class="pi pi-calendar-plus icon-spacing-sm"></i>Submit a New Event</span>
                  <span class="link-helper">
                    Propose an event for your restaurant. The Foodie Group will review and approve it.
                  </span>
                </li>

                <!-- Pending Events -->
                <li class="link-row clickable" @click="loadPendingEvents">
                  <span class="link-label"><i class="pi pi-clock icon-spacing-sm"></i>View Pending Event Submissions</span>
                  <span class="link-helper">
                    Review and edit event submissions awaiting Foodie Group approval.
                  </span>
                </li>

                <!-- Rejected Events -->
                <li class="link-row clickable" @click="loadRejectedEvents">
                  <span class="link-label"><i class="pi pi-times-circle icon-spacing-sm"></i>View Rejected Events</span>
                  <span class="link-helper">
                    Review event submissions that were not approved and see the reason.
                  </span>
                </li>

                <!-- Event Attendees -->
                <li class="link-row clickable" @click="loadEventInsights">
                  <span class="link-label"><i class="pi pi-users icon-spacing-sm"></i>Event Attendees</span>
                  <span class="link-helper">
                    See who has RSVPed for your events and manage attendance.
                  </span>
                </li>
              </ul>

              <p v-if="merchantToolsLoading" class="muted tiny" style="margin-top: 0.75rem;">
                Loading…
              </p>
              <p v-if="merchantToolsError" class="tiny error-text" style="margin-top: 0.5rem;">
                {{ merchantToolsError }}
              </p>

              <div v-if="activeToolsView === 'approved' && approvedCoupons.length" class="tools-results-block">
                <h3 class="tiny-heading">Approved Coupons</h3>
                <ul class="tiny-list">
                  <li v-for="c in approvedCoupons" :key="c.id">
                    <strong>{{ c.title }}</strong>
                    <span class="muted tiny">· {{ merchantNameById(c.merchant_id) }}</span>
                  </li>
                </ul>
              </div>

              <div v-if="activeToolsView === 'pending' && pendingCoupons.length" class="tools-results-block">
                <h3 class="tiny-heading">Pending Submissions</h3>
                <ul class="tiny-list">
                  <li v-for="sub in pendingCoupons" :key="sub.id" class="pending-row">
                    <div>
                      <strong>{{ sub.submissionData?.title || 'Untitled coupon' }}</strong>
                      <span class="muted tiny">
                        · {{ sub.merchantName || merchantNameById(sub.merchantId) }}
                      </span>
                      <br />
                      <span class="muted tiny">
                        Submitted {{ formatDateTiny(sub.submittedAt) }}
                        <span v-if="sub.updatedAt"> · Edited {{ formatDateTiny(sub.updatedAt) }}</span>
                      </span>
                    </div>
                    <span class="badge badge-pending">Pending</span>
                    <button class="btn tertiary compact" @click="goToEditSubmission(sub.id)">
                      Edit
                    </button>
                  </li>
                </ul>
              </div>

              <div v-if="activeToolsView === 'rejected' && rejectedCoupons.length" class="tools-results-block">
                <h3 class="tiny-heading">Rejected Coupons</h3>
                <ul class="tiny-list">
                  <li v-for="sub in rejectedCoupons" :key="sub.id">
                    <strong>{{ sub.submissionData?.title || 'Untitled coupon' }}</strong>
                    <span class="muted tiny">· {{ merchantNameById(sub.merchantId) }}</span>
                    <br />
                    <span class="muted tiny">
                      Rejected on {{ formatDateTiny(sub.submittedAt) }}
                      <span v-if="sub.rejectionMessage"> — Reason: {{ sub.rejectionMessage }}</span>
                    </span>
                  </li>
                </ul>
              </div>

              <!-- Pending event submissions -->
              <div v-if="activeToolsView === 'pending-events' && pendingEvents.length" class="tools-results-block">
                <h3 class="tiny-heading">Pending Event Submissions</h3>
                <ul class="tiny-list">
                  <li v-for="sub in pendingEvents" :key="sub.id" class="pending-row">
                    <div>
                      <strong>{{ sub.submissionData?.name || 'Untitled event' }}</strong>
                      <span class="muted tiny">
                        · {{ sub.merchantName || merchantNameById(sub.merchantId) }}
                      </span>
                      <br />
                      <span class="muted tiny">
                        Submitted {{ formatDateTiny(sub.submittedAt) }}
                        <span v-if="sub.updatedAt"> · Edited {{ formatDateTiny(sub.updatedAt) }}</span>
                      </span>
                    </div>
                    <span class="badge badge-pending">Pending</span>
                    <button class="btn tertiary compact" @click="goToEditEventSubmission(sub.id)">
                      Edit
                    </button>
                  </li>
                </ul>
              </div>

              <!-- Rejected event submissions -->
              <div v-if="activeToolsView === 'rejected-events' && rejectedEvents.length" class="tools-results-block">
                <h3 class="tiny-heading">Rejected Events</h3>
                <ul class="tiny-list">
                  <li v-for="sub in rejectedEvents" :key="sub.id">
                    <strong>{{ sub.submissionData?.name || 'Untitled event' }}</strong>
                    <span class="muted tiny">· {{ merchantNameById(sub.merchantId) }}</span>
                    <br />
                    <span class="muted tiny">
                      Rejected on {{ formatDateTiny(sub.submittedAt) }}
                      <span v-if="sub.rejectionMessage"> — Reason: {{ sub.rejectionMessage }}</span>
                    </span>
                  </li>
                </ul>
              </div>

              <!-- Empty states for event views -->
              <div v-if="activeToolsView === 'pending-events' && !merchantToolsLoading && !pendingEvents.length"
                class="muted tiny" style="margin-top: 0.5rem;">
                No pending event submissions found for your restaurants.
              </div>
              <div v-if="activeToolsView === 'rejected-events' && !merchantToolsLoading && !rejectedEvents.length"
                class="muted tiny" style="margin-top: 0.5rem;">
                No rejected event submissions found for your restaurants.
              </div>

              <div v-if="activeToolsView === 'insights' && redemptionInsights.length" class="tools-results-block">
                <h3 class="tiny-heading">Redemption Insights</h3>
                <ul class="insights-list">
                  <li v-for="row in redemptionInsights" :key="row.couponId" class="insight-row">
                    <div class="insight-copy">
                      <strong>{{ row.merchantName }}</strong>
                      <div class="muted tiny">{{ row.couponTitle }}</div>
                      <div class="muted tiny">
                        {{ row.redemptions }} redemptions
                        <span v-if="row.lastRedeemedAt">
                          · Last redeemed {{ formatDateDateTime(row.lastRedeemedAt) }}
                        </span>
                      </div>
                    </div>

                    <button class="btn tertiary compact" @click="loadRedemptionDetails(row.couponId)">
                      {{ selectedCouponId === row.couponId ? 'Refresh redeemers' : 'View redeemers' }}
                    </button>
                  </li>
                </ul>

                <div v-if="selectedCouponRow" class="redemption-details-block">
                  <div class="details-header">
                    <div>
                      <strong>{{ selectedCouponRow.couponTitle }}</strong>
                      <div class="muted tiny">{{ selectedCouponRow.merchantName }}</div>
                    </div>
                    <span class="muted tiny">
                      {{ displayedRedemptionDetails.length }} row{{ displayedRedemptionDetails.length === 1 ? '' : 's' }}
                    </span>
                  </div>

                  <div class="details-actions">
                    <button
                      class="btn tertiary compact"
                      @click="copyRedeemerEmails"
                      :disabled="detailsLoading || !displayedRedemptionDetails.length"
                    >
                      Copy emails
                    </button>
                    <button
                      class="btn tertiary compact"
                      @click="exportRedemptionDetails"
                      :disabled="detailsLoading || exportingDetails"
                    >
                      {{ exportingDetails ? 'Exporting…' : 'Export CSV' }}
                    </button>
                    <label class="checkbox-row muted tiny">
                      <input type="checkbox" v-model="uniqueEmailsOnly" />
                      Show unique emails only
                    </label>
                  </div>

                  <p v-if="detailsLoading" class="muted tiny">Loading redeemers…</p>
                  <p v-else-if="detailsError" class="tiny error-text">{{ detailsError }}</p>

                  <div v-else-if="displayedRedemptionDetails.length" class="details-table-wrap">
                    <table class="details-table">
                      <thead>
                        <tr>
                          <th>Customer name</th>
                          <th>Customer email</th>
                          <th>Redeemed at</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="row in displayedRedemptionDetails" :key="row.redemptionId">
                          <td>{{ row.customerName || '—' }}</td>
                          <td>{{ row.customerEmail || '—' }}</td>
                          <td>{{ formatDateDateTime(row.redeemedAt) }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <p v-else class="muted tiny">
                    No redeemers found for this coupon.
                  </p>
                </div>
              </div>

              <div v-if="activeToolsView === 'approved' && !merchantToolsLoading && !approvedCoupons.length"
                class="muted tiny" style="margin-top: 0.5rem;">
                No approved coupons found for your restaurants yet.
              </div>

              <div v-if="activeToolsView === 'rejected' && !merchantToolsLoading && !rejectedCoupons.length"
                class="muted tiny" style="margin-top: 0.5rem;">
                No rejected coupon submissions found for your restaurants.
              </div>

              <div v-if="activeToolsView === 'insights' && !merchantToolsLoading && !redemptionInsights.length"
                class="muted tiny" style="margin-top: 0.5rem;">
                No redemptions recorded yet for coupons from your restaurants.
              </div>

              <!-- Event attendees list -->
              <div v-if="activeToolsView === 'event-attendees' && eventInsights.length" class="tools-results-block">
                <h3 class="tiny-heading">Your Events</h3>
                <ul class="insights-list">
                  <li v-for="row in eventInsights" :key="row.eventId" class="insight-row insight-row-stack">
                    <div class="insight-row-main">
                      <div class="insight-copy">
                        <strong>{{ row.eventName }}</strong>
                        <div class="muted tiny">{{ row.merchantName }}</div>
                        <div class="muted tiny">
                          {{ row.confirmedRsvps }} confirmed · {{ row.waitlistCount }} waitlisted
                          <span v-if="row.startDatetime"> · {{ formatDateDateTime(row.startDatetime) }}</span>
                          <span v-if="!row.bannerImageUrl"> · <span class="muted">no banner</span></span>
                        </div>
                      </div>
                      <div class="insight-row-actions">
                        <button class="btn tertiary compact" @click="toggleBannerEditor(row.eventId)">
                          <i class="pi pi-image icon-spacing-sm"></i>{{ bannerEditEventId === row.eventId ? 'Close' : (row.bannerImageUrl ? 'Edit banner' : 'Add banner') }}
                        </button>
                        <button class="btn tertiary compact" @click="loadEventAttendeeDetails(row.eventId)">
                          {{ selectedEventId === row.eventId ? 'Refresh' : 'View attendees' }}
                        </button>
                      </div>
                    </div>
                    <EventBannerManager
                      v-if="bannerEditEventId === row.eventId"
                      :event-id="row.eventId"
                      :merchant-id="row.merchantId"
                      :banner-image-url="row.bannerImageUrl"
                      :cover-image-url="row.coverImageUrl"
                      @updated="onEventImagesUpdated"
                    />
                  </li>
                </ul>

                <div v-if="selectedEventRow" class="redemption-details-block">
                  <div class="details-header">
                    <div>
                      <strong>{{ selectedEventRow.eventName }}</strong>
                      <div class="muted tiny">{{ selectedEventRow.merchantName }}</div>
                    </div>
                    <span class="muted tiny">{{ eventAttendees.length }} attendee{{ eventAttendees.length === 1 ? '' : 's' }}</span>
                  </div>

                  <div class="details-actions">
                    <button class="btn tertiary compact" @click="copyAttendeeEmails" :disabled="eventAttendeesLoading || !eventAttendees.length">
                      Copy emails
                    </button>
                  </div>

                  <p v-if="eventAttendeesLoading" class="muted tiny">Loading attendees…</p>
                  <p v-else-if="eventAttendeesError" class="tiny error-text">{{ eventAttendeesError }}</p>

                  <div v-else-if="eventAttendees.length" class="details-table-wrap">
                    <table class="details-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Party</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="a in eventAttendees" :key="a.id">
                          <td>{{ a.userName || a.guestName || '—' }}</td>
                          <td>{{ a.userEmail || a.guestEmail || '—' }}</td>
                          <td>{{ a.attendees }}</td>
                          <td>{{ a.status }}</td>
                          <td class="table-actions">
                            <button class="btn tertiary compact" :disabled="a.status !== 'waitlist'" @click="promoteAttendee(a)">Promote</button>
                            <button class="btn tertiary compact" :disabled="a.status === 'cancelled'" @click="cancelAttendeeRsvp(a)">Cancel</button>
                            <button class="btn tertiary compact" :disabled="a.status !== 'going'" @click="checkInAttendee(a)">Check-in</button>
                            <button class="btn tertiary compact" :disabled="a.status !== 'going' && a.status !== 'checked_in'" @click="markNoShowAttendee(a)">No-show</button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <p v-else class="muted tiny">No attendees found for this event.</p>
                </div>
              </div>

              <div v-if="activeToolsView === 'event-attendees' && !merchantToolsLoading && !eventInsights.length"
                class="muted tiny" style="margin-top: 0.5rem;">
                No events found for your restaurants yet.
              </div>
            </section>
          </template>
        </template>

        <!-- Admin View -->
        <section v-else-if="role === 'super_admin'" class="section-card admin-card">
          <h2>Admin View</h2>
          <p class="subtitle">
            View high-level metrics, manage users, and oversee system-wide settings.
          </p>

          <div class="role-grid">
            <div class="role-card">
              <h3>Super Admin Dashboard</h3>
              <p>Access advanced tools and metrics for the entire platform.</p>
              <button
                class="btn primary"
                data-test="super-admin-dashboard-btn"
                @click="goToAdminDashboard"
              >
                <i class="pi pi-cog icon-spacing-sm"></i>Go to Super Admin Dashboard
              </button>
              <p class="muted tiny">
                This area is restricted to system administrators.
              </p>
            </div>
          </div>
        </section>


        <!-- FALLBACK / UNKNOWN ROLE -->
        <template v-else>
          <section class="section-card">
            <h2>Profile</h2>
            <p class="muted">
              Your account is signed in but doesn’t have a specific role yet.
              Once roles are wired up, this page will adapt automatically.
            </p>
          </section>
        </template>
      </div>
    </template>
  </div>

  <!-- Add Merchant Admin Modal -->
  <Modal v-if="showAddAdminModal" @close="closeAddAdminModal">
    <h2>Add Admin</h2>
    <p class="muted" style="margin-bottom: 1rem;">
      Search for an existing user by name or email to grant them admin access to this restaurant.
    </p>

    <div class="form-group" style="display:flex; gap:0.5rem; align-items:center;">
      <input
        type="text"
        v-model="addAdminSearch"
        placeholder="Name or email…"
        @keyup.enter="searchAdminUsers"
        style="flex:1;"
      />
      <button class="btn primary" :disabled="addAdminSearchLoading || addAdminSearch.length < 2" @click="searchAdminUsers">
        Search
      </button>
    </div>

    <div v-if="addAdminSearchLoading" class="muted tiny" style="margin-top:0.5rem;">Searching…</div>

    <ul v-if="addAdminSearchResults.length" class="admin-search-results">
      <li v-for="u in addAdminSearchResults" :key="u.id" class="admin-search-row">
        <span class="admin-info">
          <span class="admin-name">{{ u.name }}</span>
          <span class="admin-email muted tiny">{{ u.email }}</span>
        </span>
        <button class="btn primary" style="padding: 0.25rem 0.75rem; font-size:0.85rem;" @click="addMerchantAdmin(u.id)">
          Add
        </button>
      </li>
    </ul>

    <p v-if="addAdminSuccess" class="muted tiny" style="margin-top:0.75rem; color: var(--color-success);">{{ addAdminSuccess }}</p>
    <p v-if="addAdminError" class="muted tiny error-text" style="margin-top:0.75rem;">{{ addAdminError }}</p>

    <div style="margin-top:1.5rem; display:flex; justify-content:flex-end;">
      <button class="btn secondary" @click="closeAddAdminModal">Done</button>
    </div>
  </Modal>
</template>

<script>
import { mapGetters } from "vuex";
import { getAccessToken, signOut, signIn } from "@/services/authService";
import { createBillingPortalSession } from "@/services/subscriptionService";
import { getMyRsvps, getMyEventCredits } from "@/services/eventService";
import CancelRsvpModal from "@/components/Events/CancelRsvpModal.vue";
import EventBannerManager from "@/components/Events/EventBannerManager.vue";
import Modal from "@/components/Common/Modal.vue";
import ComingSoonOverlay from "@/components/Common/ComingSoonOverlay.vue";
import { FEATURES } from "@/config/features";

export default {
  name: "UserProfile",

  components: { Modal, ComingSoonOverlay, CancelRsvpModal, EventBannerManager },

  data() {
    return {
      eventsEnabled: FEATURES.EVENTS_ENABLED,
      user: null,
      merchants: [],
      loadingUser: true,
      customerStats: {
        loading: false,
        error: null,
        couponsRedeemed: null,
        activeCouponBooks: null,
        purchases: [],
      },
      customerRsvps: {
        loading: false,
        error: null,
        items: [],
        cancellingId: null,
      },
      customerCredits: {
        loading: false,
        error: null,
        items: [],
      },
      cancellingRsvp: null,
      ticketShownRsvpId: null,
      bannerEditEventId: null,
      adminMemberships: [],
      adminMembershipsLoading: false,
      billingPortalLoadingId: null,

      // logo upload state
      uploadingLogoId: null,
      logoUploadError: null,
      uploadErrorMerchantId: null,

      // website edit state (per-merchant)
      websiteDrafts: {},
      websiteSavingId: null,
      websiteSaveError: null,
      websiteSaveErrorMerchantId: null,
      websiteSavedMerchantId: null,

      // merchant tools state
      approvedCoupons: [],
      pendingCoupons: [],
      rejectedCoupons: [],
      pendingEvents: [],
      rejectedEvents: [],
      redemptionInsights: [],
      selectedCouponId: null,
      redemptionDetails: [],
      uniqueEmailsOnly: false,
      detailsLoading: false,
      detailsError: null,
      exportingDetails: false,
      // event attendee state
      eventInsights: [],
      selectedEventId: null,
      eventAttendees: [],
      eventAttendeesLoading: false,
      eventAttendeesError: null,
      merchantToolsLoading: false,
      merchantToolsError: null,
      activeToolsView: null, // 'approved' | 'rejected' | 'insights' | 'event-attendees'
      merchantOverview: {
        redemptionsLast30Days: 0,
        topCoupon: null,
      },
      merchantOverviewLoading: false,
      merchantOverviewError: null,

      // merchant admins management
      merchantAdmins: {},       // { [merchantId]: adminsList }
      merchantAdminsLoading: {}, // { [merchantId]: bool }
      showAddAdminModal: false,
      addAdminMerchantId: null,
      addAdminSearch: '',
      addAdminSearchResults: [],
      addAdminSearchLoading: false,
      addAdminError: null,
      addAdminSuccess: null,
      removingAdminId: null,   // userId being removed
    };
  },

  computed: {
    ...mapGetters("auth", ["isAuthenticated"]),

    role() {
      if (this.user && this.user.role) {
        return this.user.role;
      }
      return null;
    },

    roleLabel() {
      switch (this.role) {
        case "merchant":
          return "Merchant";
        case "customer":
          return "Customer";
        case "foodie_group_admin":
          return "Foodie Group Admin";
        case "super_admin":
          return "Super Admin";
        default:
          return null;
      }
    },

    // If there are merchants, use the first one’s name for initials,
    // otherwise fall back to the user’s name or "VS".
    merchantInitials() {
      const sourceName =
        (this.merchants[0] && this.merchants[0].name) ||
        (this.user && this.user.name) ||
        "";

      const parts = sourceName.trim().split(" ");
      if (!parts[0]) return "VS";
      if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
      return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    },

    // Merchant capability is derived from ownership, not role.
    // A user has merchant capability if they own at least one merchant.
    hasMerchantCapability() {
      return this.merchants && this.merchants.length > 0;
    },

    selectedCouponRow() {
      return this.redemptionInsights.find((row) => row.couponId === this.selectedCouponId) || null;
    },

    selectedEventRow() {
      return this.eventInsights.find((row) => row.eventId === this.selectedEventId) || null;
    },

    displayedRedemptionDetails() {
      if (!this.uniqueEmailsOnly) {
        return this.redemptionDetails;
      }

      const seenCustomers = new Set();
      return this.redemptionDetails.filter((row) => {
        const key = row.customerId || row.customerEmail || row.redemptionId;
        if (seenCustomers.has(key)) {
          return false;
        }
        seenCustomers.add(key);
        return true;
      });
    },
  },

  async created() {
    if (!this.isAuthenticated) {
      this.loadingUser = false;
      return;
    }

    await this.loadUserFromApi();
    await this.loadAdminMemberships();
  },

  methods: {
    /**
     * Human-readable badge label describing how the user obtained access to
     * this foodie group (subscription status / gift / admin grant / one-time).
     */
    purchaseBadgeLabel(p) {
      if (p?.provider === 'admin_grant') return 'Admin Granted';
      if (p?.giftedByUserId) return 'Gift';
      if (p?.subscriptionStatus === 'active') return 'Active Subscription';
      if (p?.subscriptionStatus === 'past_due') return 'Past Due';
      if (p?.subscriptionStatus === 'canceled') return 'Canceled';
      if (p?.subscriptionStatus) return p.subscriptionStatus;
      return 'One-time Purchase';
    },

    purchaseBadgeClass(p) {
      if (p?.provider === 'admin_grant') return 'admin-grant-badge';
      if (p?.giftedByUserId) return 'gift-badge';
      if (p?.subscriptionStatus === 'active') return 'subscription-badge';
      if (p?.subscriptionStatus === 'past_due') return 'warning-badge';
      if (p?.subscriptionStatus === 'canceled') return 'canceled-badge';
      return 'one-time-badge';
    },

    async openBillingPortal(purchase) {
      if (!purchase?.groupId) return;
      this.billingPortalLoadingId = purchase.id;
      try {
        const { portalUrl } = await createBillingPortalSession(purchase.groupId);
        if (portalUrl) {
          window.location.assign(portalUrl);
        }
      } catch (err) {
        console.error('Failed to open billing portal', err);
        window.alert('Could not open the billing portal. Please try again.');
      } finally {
        this.billingPortalLoadingId = null;
      }
    },

    async loadUserFromApi() {
      this.loadingUser = true;
      try {
        const token = await getAccessToken();
        const res = await fetch("/api/v1/users/me", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          console.error("Failed to load /api/v1/users/me", res.status);
          this.user = null;
          this.merchants = [];
          return;
        }

        const data = await res.json();
        this.user = {
          id: data.id,
          email: data.email,
          name: data.name,
          role: data.role,
        };
        this.merchants = data.merchants || [];
        this.syncWebsiteDrafts();

        if (this.role === 'customer') {
          this.loadCustomerStats();
          this.loadCustomerRsvps();
          this.loadCustomerCredits();
        }
        if (this.role === 'merchant') {
          this.loadMerchantOverview();
        }

        // Load admin lists for all accessible merchants
        for (const m of this.merchants) {
          this.loadMerchantAdmins(m.id);
        }
      } catch (err) {
        console.error("Error fetching /api/v1/users/me", err);
        this.user = null;
        this.merchants = [];
      } finally {
        this.loadingUser = false;
      }
    },

    async loadAdminMemberships() {
      this.adminMembershipsLoading = true;
      try {
        const token = await getAccessToken();
        const res = await fetch("/api/v1/groups/my/admin-memberships", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (res.ok) {
          const data = await res.json();
          this.adminMemberships = Array.isArray(data) ? data : [];
        }
      } catch (err) {
        console.error("Error fetching /api/v1/groups/my/admin-memberships", err);
      } finally {
        this.adminMembershipsLoading = false;
      }
    },

    // 🔹 Foodie Group Admin → dashboard
    goToFoodieGroupDashboard() {
      if (!this.adminMemberships.length) {
        return;
      }

      const lastGroupId = localStorage.getItem("lastAdminGroupId");
      const validLast = this.adminMemberships.find(
        (g) => g.groupId === lastGroupId
      );

      const targetGroupId = validLast
        ? validLast.groupId
        : this.adminMemberships[0].groupId;

      this.$router.push({
        name: "FoodieGroupDashboard",
        params: { groupId: targetGroupId },
      });
    },

    // 🔹 Super Admin → dashboard
    goToAdminDashboard() {
      this.$router.push({ name: 'SuperAdminDashboard' });
    },

    goToRsvpEvent(rsvp) {
      if (rsvp?.eventSlug) {
        this.$router.push({ name: 'EventDetailSlug', params: { slug: rsvp.eventSlug } });
        return;
      }
      this.$router.push({ name: 'EventDetail', params: { id: rsvp.eventId } });
    },

    rsvpBadgeLabel(rsvp) {
      const status = typeof rsvp === 'string' ? rsvp : rsvp?.status;
      if (status === 'going') return 'Going';
      if (status === 'waitlist') {
        const position = typeof rsvp === 'object' ? rsvp?.waitlistPosition : null;
        return position ? `Waitlist #${position}` : 'Waitlist';
      }
      if (status === 'checked_in') return 'Checked In';
      return 'RSVP';
    },

    rsvpBadgeClass(status) {
      if (status === 'going') return 'rsvp-going-badge';
      if (status === 'waitlist') return 'rsvp-waitlist-badge';
      if (status === 'checked_in') return 'rsvp-checked-in-badge';
      return 'rsvp-default-badge';
    },

    formatRsvpOrder(order) {
      if (!order?.status) return 'Ticket order';
      return `Order ${order.status.replace(/_/g, ' ')}`;
    },

    async loadCustomerRsvps() {
      if (this.role !== 'customer') return;

      this.customerRsvps.loading = true;
      this.customerRsvps.error = null;

      try {
        const rows = await getMyRsvps();
        this.customerRsvps.items = Array.isArray(rows) ? rows : [];
      } catch (err) {
        console.error('Error loading customer RSVPs', err);
        this.customerRsvps.error = 'Could not load your RSVPs.';
        this.customerRsvps.items = [];
      } finally {
        this.customerRsvps.loading = false;
      }
    },

    async loadCustomerCredits() {
      if (this.role !== 'customer') return;

      this.customerCredits.loading = true;
      this.customerCredits.error = null;

      try {
        const rows = await getMyEventCredits();
        this.customerCredits.items = Array.isArray(rows) ? rows : [];
      } catch (err) {
        console.error('Error loading event credits', err);
        this.customerCredits.error = 'Could not load your event credits.';
        this.customerCredits.items = [];
      } finally {
        this.customerCredits.loading = false;
      }
    },

    ticketCheckinUrl(rsvp) {
      if (!rsvp?.ticketCode) return '';
      return `${window.location.origin}/checkin/${rsvp.eventId}?code=${encodeURIComponent(rsvp.ticketCode)}`;
    },

    onRsvpCancelled() {
      const cancelled = this.cancellingRsvp;
      this.cancellingRsvp = null;
      if (cancelled) {
        this.customerRsvps.items = this.customerRsvps.items.filter((item) => item.id !== cancelled.id);
      }
      // Refresh credits — a cancellation may have just issued one.
      this.loadCustomerCredits();
    },

    toggleBannerEditor(eventId) {
      this.bannerEditEventId = this.bannerEditEventId === eventId ? null : eventId;
    },

    onEventImagesUpdated({ eventId, bannerImageUrl, coverImageUrl }) {
      const row = this.eventInsights.find((r) => r.eventId === eventId);
      if (row) {
        row.bannerImageUrl = bannerImageUrl;
        row.coverImageUrl = coverImageUrl;
      }
    },

    async onLogoFileChange(merchant, event) {
      const file = event.target.files[0];
      if (!file) return;

      this.logoUploadError = null;
      this.uploadErrorMerchantId = null;
      this.uploadingLogoId = merchant.id;

      try {
        const raw = await getAccessToken();

        // Normalize token (prod-safe)
        const token =
          typeof raw === "string" ? raw.replace(/^Bearer\s+/i, "").trim() : "";

        if (!token || token.split(".").length !== 3) {
          console.error("Invalid access token returned by getAccessToken()", raw);
          this.logoUploadError =
            "Auth token missing or invalid. Please sign out and sign in again.";
          this.uploadErrorMerchantId = merchant.id;
          return;
        }

        // ✅ DEFINE FIRST
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch(`/api/v1/merchants/${merchant.id}/logo`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });

        console.log("logo upload response status", res.status);

        if (!res.ok) {
          let message = "Upload failed";
          try {
            const errJson = await res.json();
            console.log("logo upload error payload", errJson);
            if (errJson?.error) message = errJson.error;
          } catch (e) {
            console.warn("logo upload error payload was not JSON", e);
          }
          this.logoUploadError = message;
          this.uploadErrorMerchantId = merchant.id;
          return;
        }

        const updated = await res.json();

        this.merchants = this.merchants.map((m) =>
          m.id === updated.id
            ? { ...m, logo_url: updated.logo_url || updated.logoUrl }
            : m
        );
      } catch (err) {
        console.error("Error uploading merchant logo", err);
        this.logoUploadError = "Unexpected error during upload";
        this.uploadErrorMerchantId = merchant.id;
      } finally {
        this.uploadingLogoId = null;
        event.target.value = "";
      }
    }
    ,

    syncWebsiteDrafts() {
      const next = {};
      for (const m of this.merchants) {
        next[m.id] = m.website_url || "";
      }
      this.websiteDrafts = next;
    },

    isWebsiteDirty(merchant) {
      const draft = (this.websiteDrafts[merchant.id] || "").trim();
      const current = (merchant.website_url || "").trim();
      return draft !== current;
    },

    async saveMerchantWebsite(merchant) {
      const raw = this.websiteDrafts[merchant.id] ?? "";
      const trimmed = typeof raw === "string" ? raw.trim() : "";

      // Client-side validation: allow empty (clears it) or a valid http(s) URL.
      if (trimmed !== "") {
        try {
          const parsed = new URL(trimmed);
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            throw new Error("bad protocol");
          }
        } catch {
          this.websiteSaveError = "Please enter a valid http(s) URL.";
          this.websiteSaveErrorMerchantId = merchant.id;
          this.websiteSavedMerchantId = null;
          return;
        }
      }

      this.websiteSavingId = merchant.id;
      this.websiteSaveError = null;
      this.websiteSaveErrorMerchantId = null;
      this.websiteSavedMerchantId = null;

      try {
        const token = await getAccessToken();
        const res = await fetch(`/api/v1/merchants/${merchant.id}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ website_url: trimmed === "" ? null : trimmed }),
        });

        if (!res.ok) {
          let message = "Failed to save website.";
          try {
            const errJson = await res.json();
            if (errJson?.error) message = errJson.error;
          } catch {
            // ignore
          }
          this.websiteSaveError = message;
          this.websiteSaveErrorMerchantId = merchant.id;
          return;
        }

        const updated = await res.json();
        const newUrl = updated.website_url ?? updated.websiteUrl ?? null;

        this.merchants = this.merchants.map((m) =>
          m.id === merchant.id ? { ...m, website_url: newUrl } : m
        );
        this.websiteDrafts = {
          ...this.websiteDrafts,
          [merchant.id]: newUrl || "",
        };
        this.websiteSavedMerchantId = merchant.id;
      } catch (err) {
        console.error("Error saving merchant website", err);
        this.websiteSaveError = "Unexpected error while saving.";
        this.websiteSaveErrorMerchantId = merchant.id;
      } finally {
        this.websiteSavingId = null;
      }
    },

    signOutNow() {
      signOut();
    },

    signInNow() {
      signIn();
    },

    async loadMerchantOverview() {
      this.merchantOverviewLoading = true;
      this.merchantOverviewError = null;

      try {
        const token = await getAccessToken();
        const res = await fetch('/api/v1/coupons/redemptions/merchant-overview', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          throw new Error(`Failed to load merchant overview, status ${res.status}`);
        }

        const data = await res.json();
        this.merchantOverview = {
          redemptionsLast30Days: Number(data.redemptionsLast30Days || 0),
          topCoupon: data.topCoupon || null,
        };
      } catch (err) {
        console.error('Error loading merchant overview', err);
        this.merchantOverviewError = 'Could not load recent coupon performance.';
        this.merchantOverview = {
          redemptionsLast30Days: 0,
          topCoupon: null,
        };
      } finally {
        this.merchantOverviewLoading = false;
      }
    },

    merchantNameById(id) {
      const m = this.merchants.find((mm) => mm.id === id);
      return m && m.name ? m.name : 'Unknown merchant';
    },

    formatDateTiny(value) {
      if (!value) return '—';
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return '—';
      return d.toLocaleDateString();
    },

    formatDateDateTime(value) {
      if (!value) return '—';
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return '—';
      return d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    },

    resetMerchantToolsState(view) {
      this.activeToolsView = view || null;
      this.merchantToolsError = null;
      this.selectedCouponId = null;
      this.redemptionDetails = [];
      this.uniqueEmailsOnly = false;
      this.detailsLoading = false;
      this.detailsError = null;
      this.exportingDetails = false;
      this.selectedEventId = null;
      this.eventAttendees = [];
      this.eventAttendeesLoading = false;
      this.eventAttendeesError = null;
      const lists = { approved: 'approvedCoupons', pending: 'pendingCoupons', rejected: 'rejectedCoupons', insights: 'redemptionInsights', 'pending-events': 'pendingEvents', 'rejected-events': 'rejectedEvents', 'event-attendees': 'eventInsights' };
      for (const [key, prop] of Object.entries(lists)) {
        if (key !== view) this[prop] = [];
      }
    },

    // Navigate to SurveyJS coupon submission page
    goToCouponSubmissions() {
      this.$router.push({ name: 'CouponSubmissions' });
    },

    async loadApprovedCoupons() {
      if (!this.merchants.length) {
        this.activeToolsView = 'approved';
        this.merchantToolsError = 'You do not have any restaurants linked to this account yet.';
        this.approvedCoupons = [];
        return;
      }

      this.resetMerchantToolsState('approved');
      this.merchantToolsLoading = true;

      try {
        const token = await getAccessToken();
        const res = await fetch('/api/v1/coupons', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          throw new Error(`Failed to load coupons, status ${res.status}`);
        }

        const allCoupons = await res.json();
        const merchantIds = new Set(this.merchants.map((m) => m.id));

        // Every coupon row has merchant_id from the coupons router
        this.approvedCoupons = allCoupons.filter((c) =>
          merchantIds.has(c.merchant_id)
        );
      } catch (err) {
        console.error('Error loading approved coupons', err);
        this.merchantToolsError = 'Could not load approved coupons.';
      } finally {
        this.merchantToolsLoading = false;
      }
    },

    async loadRejectedCoupons() {
      if (!this.merchants.length) {
        this.activeToolsView = 'rejected';
        this.merchantToolsError = 'You do not have any restaurants linked to this account yet.';
        this.rejectedCoupons = [];
        return;
      }

      this.resetMerchantToolsState('rejected');
      this.merchantToolsLoading = true;

      try {
        const token = await getAccessToken();

        // NEW: merchant-scoped, auth-protected route
        const res = await fetch('/api/v1/coupon-submissions/by-merchant?state=rejected', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          throw new Error(`Failed to load rejected submissions, status ${res.status}`);
        }

        const subs = await res.json();
        const list = Array.isArray(subs) ? subs : [];
        // Defensive normalization: backend may return snake_case or camelCase
        this.rejectedCoupons = list.map((s) => ({
          ...s,
          merchantId: s.merchantId ?? s.merchant_id,
          submittedAt: s.submittedAt ?? s.submitted_at,
          submissionData: s.submissionData ?? s.submission_data,
          rejectionMessage: s.rejectionMessage ?? s.rejection_message,
        }));
      } catch (err) {
        console.error('Error loading rejected coupons', err);
        this.merchantToolsError = 'Could not load rejected coupon submissions.';
      } finally {
        this.merchantToolsLoading = false;
      }
    },

    async loadPendingCoupons() {
      if (!this.merchants.length) {
        this.activeToolsView = 'pending';
        this.merchantToolsError = 'You do not have any restaurants linked to this account yet.';
        this.pendingCoupons = [];
        return;
      }

      this.resetMerchantToolsState('pending');
      this.merchantToolsLoading = true;

      try {
        const token = await getAccessToken();
        const res = await fetch('/api/v1/coupon-submissions/by-merchant?state=pending', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          throw new Error(`Failed to load pending submissions, status ${res.status}`);
        }

        const subs = await res.json();
        const list = Array.isArray(subs) ? subs : [];
        this.pendingCoupons = list.map((s) => ({
          ...s,
          merchantId: s.merchantId ?? s.merchant_id,
          submittedAt: s.submittedAt ?? s.submitted_at,
          updatedAt: s.updatedAt ?? s.updated_at,
          submissionData: s.submissionData ?? s.submission_data,
        }));
      } catch (err) {
        console.error('Error loading pending coupons', err);
        this.merchantToolsError = 'Could not load pending coupon submissions.';
      } finally {
        this.merchantToolsLoading = false;
      }
    },

    goToEditSubmission(submissionId) {
      this.$router.push({ name: 'EditCouponSubmission', params: { id: submissionId } });
    },

    goToEventSubmissions() {
      this.$router.push({ name: 'EventSubmissions' });
    },

    goToEditEventSubmission(submissionId) {
      this.$router.push({ name: 'EditEventSubmission', params: { id: submissionId } });
    },

    async loadPendingEvents() {
      if (!this.merchants.length) {
        this.activeToolsView = 'pending-events';
        this.merchantToolsError = 'You do not have any restaurants linked to this account yet.';
        this.pendingEvents = [];
        return;
      }

      this.resetMerchantToolsState('pending-events');
      this.merchantToolsLoading = true;

      try {
        const token = await getAccessToken();
        const res = await fetch('/api/v1/event-submissions/by-merchant?state=pending', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const list = await res.json();
        this.pendingEvents = (Array.isArray(list) ? list : []).map((s) => ({
          ...s,
          merchantId:     s.merchantId ?? s.merchant_id,
          submittedAt:    s.submittedAt ?? s.submitted_at,
          updatedAt:      s.updatedAt ?? s.updated_at,
          submissionData: s.submissionData ?? s.submission_data,
        }));
      } catch (err) {
        console.error('Error loading pending events', err);
        this.merchantToolsError = 'Could not load pending event submissions.';
      } finally {
        this.merchantToolsLoading = false;
      }
    },

    async loadRejectedEvents() {
      if (!this.merchants.length) {
        this.activeToolsView = 'rejected-events';
        this.merchantToolsError = 'You do not have any restaurants linked to this account yet.';
        this.rejectedEvents = [];
        return;
      }

      this.resetMerchantToolsState('rejected-events');
      this.merchantToolsLoading = true;

      try {
        const token = await getAccessToken();
        const res = await fetch('/api/v1/event-submissions/by-merchant?state=rejected', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const list = await res.json();
        this.rejectedEvents = (Array.isArray(list) ? list : []).map((s) => ({
          ...s,
          merchantId:       s.merchantId ?? s.merchant_id,
          submittedAt:      s.submittedAt ?? s.submitted_at,
          submissionData:   s.submissionData ?? s.submission_data,
          rejectionMessage: s.rejectionMessage ?? s.rejection_message,
        }));
      } catch (err) {
        console.error('Error loading rejected events', err);
        this.merchantToolsError = 'Could not load rejected event submissions.';
      } finally {
        this.merchantToolsLoading = false;
      }
    },

    async loadEventInsights() {
      if (!this.merchants.length) {
        this.activeToolsView = 'event-attendees';
        this.merchantToolsError = 'You do not have any restaurants linked to this account yet.';
        this.eventInsights = [];
        return;
      }

      this.resetMerchantToolsState('event-attendees');
      this.merchantToolsLoading = true;

      try {
        const token = await getAccessToken();
        const res = await fetch('/api/v1/events/merchant-insights', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Failed to load event insights, status ${res.status}`);
        const rows = await res.json();
        this.eventInsights = Array.isArray(rows) ? rows : [];
      } catch (err) {
        console.error('Error loading event insights', err);
        this.merchantToolsError = 'Could not load event insights.';
        this.eventInsights = [];
      } finally {
        this.merchantToolsLoading = false;
      }
    },

    async loadEventAttendeeDetails(eventId) {
      this.selectedEventId = eventId;
      this.eventAttendeesLoading = true;
      this.eventAttendeesError = null;
      this.eventAttendees = [];

      try {
        const token = await getAccessToken();
        const res = await fetch(`/api/v1/events/${eventId}/attendees`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Failed to load attendees, status ${res.status}`);
        const rows = await res.json();
        this.eventAttendees = Array.isArray(rows) ? rows : [];
      } catch (err) {
        console.error('Error loading event attendees', err);
        this.eventAttendeesError = 'Could not load attendees.';
      } finally {
        this.eventAttendeesLoading = false;
      }
    },

    async promoteAttendee(attendee) {
      try {
        const token = await getAccessToken();
        const res = await fetch(`/api/v1/events/${this.selectedEventId}/rsvp/${attendee.id}/promote`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Failed to promote, status ${res.status}`);
        }
        await this.loadEventAttendeeDetails(this.selectedEventId);
      } catch (err) {
        this.eventAttendeesError = err.message || 'Could not promote attendee.';
      }
    },

    async cancelAttendeeRsvp(attendee) {
      try {
        const token = await getAccessToken();
        const res = await fetch(`/api/v1/events/${this.selectedEventId}/rsvp/${attendee.id}/cancel`, {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`Cancel failed, status ${res.status}`);
        await this.loadEventAttendeeDetails(this.selectedEventId);
      } catch (err) {
        this.eventAttendeesError = err.message || 'Could not cancel attendee.';
      }
    },

    async checkInAttendee(attendee) {
      try {
        const token = await getAccessToken();
        const res = await fetch(`/api/v1/events/${this.selectedEventId}/rsvp/${attendee.id}/status`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'checked_in' }),
        });
        if (!res.ok) throw new Error(`Check-in failed, status ${res.status}`);
        await this.loadEventAttendeeDetails(this.selectedEventId);
      } catch (err) {
        this.eventAttendeesError = err.message || 'Could not check in attendee.';
      }
    },

    async markNoShowAttendee(attendee) {
      try {
        const token = await getAccessToken();
        const res = await fetch(`/api/v1/events/${this.selectedEventId}/rsvp/${attendee.id}/status`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'no_show' }),
        });
        if (!res.ok) throw new Error(`No-show failed, status ${res.status}`);
        await this.loadEventAttendeeDetails(this.selectedEventId);
      } catch (err) {
        this.eventAttendeesError = err.message || 'Could not mark no-show.';
      }
    },

    async copyAttendeeEmails() {
      const emails = this.eventAttendees
        .map((a) => a.userEmail || a.guestEmail)
        .filter(Boolean);

      if (!emails.length) {
        this.eventAttendeesError = 'No emails available to copy.';
        return;
      }

      try {
        await navigator.clipboard.writeText(emails.join('\n'));
        this.eventAttendeesError = null;
      } catch (err) {
        this.eventAttendeesError = 'Could not copy emails to clipboard.';
      }
    },

    async loadRedemptionInsights() {
      if (!this.merchants.length) {
        this.activeToolsView = 'insights';
        this.merchantToolsError =
          'You do not have any restaurants linked to this account yet.';
        this.redemptionInsights = [];
        return;
      }

      this.resetMerchantToolsState('insights');
      this.merchantToolsLoading = true;

      try {
        const token = await getAccessToken();

        // Backend route: returns rows per coupon the merchant-owner has
        // [{ merchantId, merchantName, couponId, couponTitle, redemptions, lastRedeemedAt }]
        const res = await fetch(
          '/api/v1/coupons/redemptions/merchant-insights',
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!res.ok) {
          throw new Error(
            `Failed to load redemption insights, status ${res.status}`
          );
        }

        const rows = await res.json();
        this.redemptionInsights = Array.isArray(rows) ? rows : [];
      } catch (err) {
        console.error('Error loading redemption insights', err);
        this.merchantToolsError = 'Could not load redemption insights.';
        this.redemptionInsights = [];
      } finally {
        this.merchantToolsLoading = false;
      }
    },

    async loadRedemptionDetails(couponId) {
      this.selectedCouponId = couponId;
      this.detailsLoading = true;
      this.detailsError = null;
      this.redemptionDetails = [];

      try {
        const token = await getAccessToken();
        const params = new URLSearchParams({ couponId });
        const res = await fetch(
          `/api/v1/coupons/redemptions/merchant-details?${params.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!res.ok) {
          throw new Error(`Failed to load redemption details, status ${res.status}`);
        }

        const rows = await res.json();
        this.redemptionDetails = Array.isArray(rows) ? rows : [];
      } catch (err) {
        console.error('Error loading redemption details', err);
        this.detailsError = 'Could not load redeemer details.';
        this.redemptionDetails = [];
      } finally {
        this.detailsLoading = false;
      }
    },

    async copyRedeemerEmails() {
      const emails = this.displayedRedemptionDetails
        .map((row) => row.customerEmail)
        .filter(Boolean);

      if (!emails.length) {
        this.detailsError = 'No customer emails available to copy.';
        return;
      }

      try {
        await navigator.clipboard.writeText(emails.join('\n'));
        this.detailsError = null;
      } catch (err) {
        console.error('Error copying redeemer emails', err);
        this.detailsError = 'Could not copy emails to the clipboard.';
      }
    },

    async exportRedemptionDetails() {
      if (!this.selectedCouponId) {
        return;
      }

      this.exportingDetails = true;
      this.detailsError = null;

      try {
        const token = await getAccessToken();
        const params = new URLSearchParams({
          couponId: this.selectedCouponId,
          mode: this.uniqueEmailsOnly ? 'unique-customers' : 'redemptions',
        });

        const res = await fetch(
          `/api/v1/coupons/redemptions/merchant-export?${params.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!res.ok) {
          throw new Error(`Failed to export redemption details, status ${res.status}`);
        }

        const blob = await res.blob();
        const disposition = res.headers.get('content-disposition') || '';
        const match = disposition.match(/filename="?([^"]+)"?/i);
        const filename = match && match[1] ? match[1] : 'redemptions.csv';
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(downloadUrl);
      } catch (err) {
        console.error('Error exporting redemption details', err);
        this.detailsError = 'Could not export redeemer details.';
      } finally {
        this.exportingDetails = false;
      }
    },

    formatCreditAmount(credit) {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: (credit.currency || 'usd').toUpperCase(),
      }).format((credit.amountCents || 0) / 100);
    },

    formatDateMedium(value) {
      if (!value) return '—';
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return '—';
      return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    },

    async loadCustomerStats() {
      if (this.role !== 'customer') return;

      this.customerStats.loading = true;
      this.customerStats.error = null;

      try {
        const token = await getAccessToken();

        // 1) Redemptions count
        const redRes = await fetch('/api/v1/coupons/redemptions/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!redRes.ok) {
          throw new Error(`Failed to load redemptions (status ${redRes.status})`);
        }
        const redRows = await redRes.json();
        this.customerStats.couponsRedeemed = Array.isArray(redRows)
          ? redRows.length
          : 0;

        // 2) Purchases
        const pRes = await fetch('/api/v1/groups/my/purchases', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!pRes.ok) {
          throw new Error(`Failed to load purchases (status ${pRes.status})`);
        }
        const purchases = await pRes.json();
        this.customerStats.purchases = Array.isArray(purchases) ? purchases : [];

        // 3) Derive active coupon books: paid + not expired (or no expiry)
        const now = new Date();
        const active = this.customerStats.purchases.filter((p) => {
          if (p.status !== 'paid') return false;
          if (!p.expiresAt) return true;
          const exp = new Date(p.expiresAt);
          if (Number.isNaN(exp.getTime())) return true;
          return exp >= now;
        });

        this.customerStats.activeCouponBooks = active.length;
      } catch (err) {
        console.error('Error loading customer stats', err);
        this.customerStats.error = 'Could not load your coupon activity.';
        this.customerStats.couponsRedeemed = null;
        this.customerStats.activeCouponBooks = null;
        this.customerStats.purchases = [];
      } finally {
        this.customerStats.loading = false;
      }
    },

    // ── Merchant admins ──────────────────────────────────────────────
    async loadMerchantAdmins(merchantId) {
      this.merchantAdminsLoading = { ...this.merchantAdminsLoading, [merchantId]: true };
      try {
        const token = await getAccessToken();
        const res = await fetch(`/api/v1/merchants/${merchantId}/admins`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          this.merchantAdmins = { ...this.merchantAdmins, [merchantId]: data.admins || [] };
        }
      } catch (err) {
        console.error('Error loading merchant admins', err);
      } finally {
        this.merchantAdminsLoading = { ...this.merchantAdminsLoading, [merchantId]: false };
      }
    },

    openAddAdminModal(merchantId) {
      this.addAdminMerchantId = merchantId;
      this.addAdminSearch = '';
      this.addAdminSearchResults = [];
      this.addAdminError = null;
      this.addAdminSuccess = null;
      this.showAddAdminModal = true;
    },

    closeAddAdminModal() {
      this.showAddAdminModal = false;
      this.addAdminMerchantId = null;
    },

    async searchAdminUsers() {
      this.addAdminSearchLoading = true;
      this.addAdminSearchResults = [];
      try {
        const token = await getAccessToken();
        const params = new URLSearchParams({ q: this.addAdminSearch });
        const res = await fetch(`/api/v1/merchants/${this.addAdminMerchantId}/admins/search?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          this.addAdminSearchResults = data.users || [];
        }
      } catch (err) {
        console.error('Error searching users', err);
      } finally {
        this.addAdminSearchLoading = false;
      }
    },

    async addMerchantAdmin(userId) {
      this.addAdminError = null;
      this.addAdminSuccess = null;
      try {
        const token = await getAccessToken();
        const res = await fetch(`/api/v1/merchants/${this.addAdminMerchantId}/admins`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });
        if (res.ok) {
          this.addAdminSuccess = 'Admin added successfully.';
          await this.loadMerchantAdmins(this.addAdminMerchantId);
          this.addAdminSearchResults = [];
          this.addAdminSearch = '';
        } else {
          const data = await res.json().catch(() => ({}));
          this.addAdminError = data.error || 'Failed to add admin.';
        }
      } catch (err) {
        this.addAdminError = 'Unexpected error.';
      }
    },

    async removeMerchantAdmin(merchantId, userId) {
      this.removingAdminId = userId;
      try {
        const token = await getAccessToken();
        const res = await fetch(`/api/v1/merchants/${merchantId}/admins/${userId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          await this.loadMerchantAdmins(merchantId);
        }
      } catch (err) {
        console.error('Error removing merchant admin', err);
      } finally {
        this.removingAdminId = null;
      }
    },

  },
};
</script>

<style scoped>
.rsvps-coming-soon-placeholder {
  min-height: 160px;
  padding: var(--spacing-sm) 0;
}

.profile-page {
  max-width: 1000px;
  margin: var(--spacing-2xl) auto;
  padding: 0 var(--spacing-lg);
}

.profile-header {
  text-align: center;
  margin-bottom: var(--spacing-2xl);
}

.subtitle {
  color: var(--color-text-secondary);
}

.muted {
  color: var(--color-text-muted);
}

.small {
  font-size: var(--font-size-sm);
}

.tiny {
  font-size: var(--font-size-xs);
}

.section-card {
  background: var(--color-bg-primary);
  padding: var(--spacing-xl);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
  margin-bottom: var(--spacing-xl);
  color: var(--color-text-primary);
}

.section-card h1,
.section-card h2,
.section-card h3 {
  color: var(--color-text-primary);
}

.section-card p {
  color: var(--color-text-primary);
}

/* Account header / role pill */
.account-card {
  margin-bottom: var(--spacing-2xl);
}

.account-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-lg);
  margin-bottom: var(--spacing-lg);
}

.role-pill {
  padding: var(--spacing-xs) var(--spacing-md);
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  background: var(--color-primary);
  color: var(--color-text-on-primary);
}

.user-info {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-lg);
  flex-wrap: wrap;
}

.user-meta p {
  margin: var(--spacing-xs) 0;
}

/* Grid layout for role-based cards */
.profile-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.8fr) minmax(0, 1.5fr);
  gap: var(--spacing-xl);
}

@media (max-width: 768px) {
  .profile-grid {
    grid-template-columns: 1fr;
  }
}

/* Customer: stats row */
.stat-row {
  display: flex;
  gap: var(--spacing-lg);
  margin-top: var(--spacing-lg);
  flex-wrap: wrap;
}

.stat-card {
  flex: 1;
  min-width: 140px;
  padding: var(--spacing-md) var(--spacing-lg);
  border-radius: var(--radius-lg);
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
  box-shadow: var(--shadow-xs);
  transition: box-shadow var(--transition-base);
}

.stat-card:hover {
  box-shadow: var(--shadow-sm);
}

.stat-number {
  display: block;
  font-size: var(--font-size-3xl);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-xs);
}

.stat-label {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  display: block;
}

/* Skeleton list placeholder */
.skeleton-list {
  list-style: none;
  padding: 0;
  margin-top: var(--spacing-lg);
}

.skeleton-item {
  height: 14px;
  border-radius: var(--radius-full);
  background: linear-gradient(90deg, var(--color-neutral-100) 0%, var(--color-neutral-200) 50%, var(--color-neutral-100) 100%);
  margin-bottom: var(--spacing-md);
}

/* Merchant list + cards */
.merchant-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  margin-top: var(--spacing-lg);
}

.merchant-card {
  border-radius: var(--radius-xl);
  padding: var(--spacing-lg) var(--spacing-xl);
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
  box-shadow: var(--shadow-card);
  border: 1px solid color-mix(in srgb, var(--surface-2) 40%, transparent);
  transition: box-shadow var(--transition-fast, 150ms ease),
              border-color var(--transition-fast, 150ms ease);
}

.merchant-card:hover {
  box-shadow: var(--shadow-lg, var(--shadow-card));
  border-color: color-mix(in srgb, var(--color-primary) 25%, transparent);
}

.merchant-card-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
  margin-bottom: var(--spacing-md);
  padding-bottom: var(--spacing-md);
  border-bottom: 1px solid color-mix(in srgb, var(--surface-2) 50%, transparent);
}

.merchant-card-header h3 {
  margin: 0;
  color: var(--color-text-primary);
  font-size: var(--font-size-xl, 1.25rem);
  font-weight: var(--font-weight-semibold, 600);
  line-height: 1.2;
}

.merchant-card-header .muted.tiny {
  margin-top: var(--spacing-xs);
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 0.7rem;
  letter-spacing: 0.02em;
  word-break: break-all;
}

.merchant-card-body {
  color: var(--color-text-primary);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.merchant-card-body p {
  margin: 0;
  color: var(--color-text-primary);
}

.merchant-card-body strong {
  color: var(--color-text-primary);
  font-weight: var(--font-weight-semibold);
}

.merchant-card-body .placeholder-text {
  color: var(--color-text-secondary);
}

/* Logo placeholder / image */
.merchant-logo-placeholder {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: var(--surface-2);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-shadow: var(--shadow-xs);
}

.merchant-logo-placeholder .initials {
  font-size: var(--font-size-3xl);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-secondary);
}

.merchant-logo-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  background-color: #FFFFFF !important;
}

.merchant-logo-placeholder {
  background-color: #FFFFFF !important;
}

/* Website edit row */
.website-edit-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--spacing-sm) var(--spacing-md);
  margin-bottom: var(--spacing-xs);
}

.website-label {
  font-size: var(--font-size-sm, 0.875rem);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--color-text-primary);
}

.website-input-group {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 0;
}

.website-input-icon {
  position: absolute;
  left: var(--spacing-sm);
  color: var(--color-text-light, var(--color-text-secondary));
  pointer-events: none;
  font-size: 0.9rem;
}

.website-input {
  width: 100%;
  min-width: 0;
  padding: var(--spacing-sm) var(--spacing-sm) var(--spacing-sm) 2rem;
  border-radius: var(--radius-md, 0.5rem);
  border: 1px solid color-mix(in srgb, var(--surface-2) 60%, transparent);
  background: color-mix(in srgb, var(--surface-1) 92%, var(--surface-2));
  color: var(--color-text-primary);
  font: inherit;
  font-size: var(--font-size-sm, 0.875rem);
  transition: border-color var(--transition-fast, 150ms ease),
              box-shadow var(--transition-fast, 150ms ease);
}

.website-input::placeholder {
  color: var(--color-text-placeholder, var(--color-text-light));
}

.website-input:focus {
  outline: none;
  border-color: var(--color-primary, #f2542d);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 25%, transparent);
}

.website-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn.btn-compact {
  padding: var(--spacing-xs) var(--spacing-md);
  font-size: var(--font-size-sm, 0.875rem);
  white-space: nowrap;
}

@media (max-width: 520px) {
  .website-edit-row {
    grid-template-columns: 1fr;
  }
  .website-edit-row .btn.btn-compact {
    justify-self: start;
  }
}

/* File upload UI */
.logo-upload-row {
  margin-top: var(--spacing-sm);
  display: flex;
  align-items: center;
}

.file-label {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-xs) var(--spacing-md);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--surface-1) 75%, var(--surface-2));
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  box-shadow: var(--shadow-xs);
}

.file-label:hover {
  background: var(--surface-2);
  box-shadow: var(--shadow-card);
}

.file-label input[type="file"] {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.file-label-text {
  pointer-events: none;
}

.placeholder-text {
  color: var(--color-text-light);
}

/* Merchant tools */
.link-list {
  list-style: none;
  padding: 0;
  margin-top: var(--spacing-lg);
}

.link-divider {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-sm) 0 var(--spacing-xs);
  background: none !important;
  box-shadow: none !important;
  margin-bottom: 0 !important;
}

.link-divider::before,
.link-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--color-border-light);
}

.link-divider span {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  white-space: nowrap;
}

.link-list li {
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-sm);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--surface-1) 72%, var(--surface-2));
  box-shadow: var(--shadow-xs);
}

.link-list li:last-child {
  margin-bottom: 0;
}

.link-label {
  display: block;
  font-weight: var(--font-weight-medium);
}

.link-helper {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

/* Foodie admin */
.admin-block {
  margin-top: var(--spacing-lg);
}

.btn {
  margin-top: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-lg);
  border-radius: var(--radius-full);
  border: none;
  cursor: pointer;
  font-size: var(--font-size-base);
  transition: all var(--transition-base);
  min-height: var(--button-height-md);
}

.btn.primary {
  background: var(--color-primary);
  color: var(--color-text-on-primary);
}

.btn.primary:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.btn.tertiary {
  background: color-mix(in srgb, var(--surface-1) 74%, var(--surface-2));
  color: var(--color-text-primary);
  box-shadow: var(--shadow-xs);
}

.btn.tertiary:hover:not(:disabled) {
  background: var(--surface-2);
  color: var(--color-text-primary);
  box-shadow: var(--shadow-card);
}

.btn:focus-visible,
.file-label:focus-within,
.checkbox-row input:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--focus-ring) 22%, transparent), var(--shadow-sm);
}

.btn[disabled] {
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
}

.loading {
  color: var(--color-text-secondary);
  font-style: italic;
}

.signin-card {
  text-align: center;
  margin-top: var(--spacing-2xl);
}

.link-row.clickable {
  cursor: pointer;
}

.link-row.clickable:hover .link-label {
  text-decoration: underline;
}

.btn.compact {
  margin-top: 0;
  padding: var(--spacing-xs) var(--spacing-md);
  font-size: var(--font-size-sm);
  min-height: auto;
}

.tools-results-block {
  margin-top: var(--spacing-lg);
  padding-top: var(--spacing-lg);
  box-shadow: inset 0 14px 18px -22px rgba(0, 0, 0, 0.24);
}

.tiny-heading {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  margin-bottom: var(--spacing-xs);
}

.tiny-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.tiny-list li {
  margin-bottom: var(--spacing-xs);
}

.pending-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}

.pending-row > div {
  flex: 1;
  min-width: 0;
}

.badge {
  display: inline-block;
  padding: 0.15em 0.6em;
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  white-space: nowrap;
}

.badge-pending {
  background: var(--color-warning-light, #fef3cd);
  color: var(--color-warning-dark, #856404);
}

.insights-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.insight-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-sm);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--surface-1) 76%, var(--surface-2));
  box-shadow: var(--shadow-card);
  transition: background-color var(--transition-fast), box-shadow var(--transition-fast), transform var(--transition-fast);
}

.insight-row:last-child {
  margin-bottom: 0;
}

/* Stacked variant: a main row (copy + actions) plus an optional expanded
   panel below (the banner/cover image manager). */
.insight-row-stack {
  flex-direction: column;
  align-items: stretch;
  gap: var(--spacing-sm);
}

.insight-row-main {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-md);
}

.insight-row-actions {
  display: flex;
  gap: var(--spacing-xs, 0.5rem);
  flex-shrink: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.insight-row:hover {
  background: var(--surface-2);
  box-shadow: var(--shadow-card-hover);
  transform: translateY(-1px);
}

.insight-copy {
  min-width: 0;
}

.redemption-details-block {
  margin-top: var(--spacing-lg);
  padding: var(--spacing-lg);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--surface-1) 86%, var(--surface-2));
  box-shadow: var(--shadow-card);
}

.details-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-md);
  padding-bottom: var(--spacing-md);
  box-shadow: inset 0 -10px 16px -18px rgba(0, 0, 0, 0.24);
}

.details-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-sm);
  align-items: center;
  margin-bottom: var(--spacing-md);
  padding: var(--spacing-sm);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--surface-2) 80%, var(--surface-1));
  box-shadow: var(--shadow-xs);
}

.checkbox-row {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: 0 var(--spacing-xs);
  min-height: 2rem;
  border-radius: var(--radius-full);
}

.checkbox-row input {
  accent-color: var(--color-primary);
}

.details-table-wrap {
  overflow-x: auto;
  border-radius: var(--radius-md);
  background: var(--surface-1);
  box-shadow: var(--shadow-xs);
}

.details-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-sm);
}

.details-table th,
.details-table td {
  text-align: left;
  padding: var(--spacing-sm) var(--spacing-md);
}

.details-table th {
  background: var(--surface-2);
  color: var(--color-text-secondary);
  font-weight: var(--font-weight-semibold);
}

.details-table tbody tr:nth-child(even) {
  background: color-mix(in srgb, var(--surface-2) 38%, var(--surface-1));
}

.details-table tbody tr:hover {
  background: color-mix(in srgb, var(--surface-2) 72%, var(--surface-1));
}

@media (max-width: 480px) {
  .profile-page {
    padding: 0 var(--spacing-sm);
  }

  .user-info {
    flex-direction: column;
    align-items: flex-start;
  }

  .insight-row,
  .details-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .details-actions {
    align-items: stretch;
  }

  .details-actions .btn.compact {
    width: 100%;
    justify-content: center;
  }
}

.purchases-list {
  list-style: none;
  padding: 0;
  margin: var(--spacing-md) 0 0;
}

.purchase-item {
  padding: var(--spacing-md) 0;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.06);
}

.purchase-item:first-child {
  box-shadow: none;
}

.purchase-main {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs);
  align-items: baseline;
}

.rsvp-list {
  list-style: none;
  padding: 0;
  margin: var(--spacing-md) 0 0;
}

.rsvp-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-sm);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--surface-1) 76%, var(--surface-2));
  box-shadow: var(--shadow-xs);
}

.rsvp-copy {
  min-width: 0;
}

.rsvp-title-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs);
  align-items: baseline;
}

.rsvp-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-sm);
  justify-content: flex-end;
}

.btn.danger {
  background: var(--color-error);
  color: var(--color-text-on-error);
}

.btn.danger:hover:not(:disabled) {
  background: var(--color-error-hover);
}

@media (max-width: 768px) {
  .rsvp-item {
    align-items: stretch;
    flex-direction: column;
  }

  .rsvp-actions {
    justify-content: stretch;
  }

  .rsvp-actions .btn.compact {
    flex: 1;
    justify-content: center;
  }
}

.error-text {
  color: var(--color-error);
}

/* Access-type status badges shown next to each purchase row. */
.status-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: var(--font-size-xs, 0.75rem);
  font-weight: var(--font-weight-semibold, 600);
  line-height: 1.4;
  margin-left: var(--spacing-xs, 0.25rem);
  background: var(--color-bg-muted, #eee);
  color: var(--color-text-primary, #222);
}
.status-badge.subscription-badge {
  background: #e7f5ec;
  color: #1f7a3a;
}
.status-badge.gift-badge {
  background: #f3e7ff;
  color: #6b2bb8;
}
.status-badge.admin-grant-badge {
  background: #e7f0ff;
  color: #1f4ea3;
}
.status-badge.one-time-badge {
  background: #f1f1f1;
  color: #555;
}
.status-badge.warning-badge {
  background: #fff3dc;
  color: #9a5a00;
}
.status-badge.canceled-badge,
.status-badge.canceling-badge {
  background: #ffe7e7;
  color: #a62222;
}

.status-badge.rsvp-going-badge,
.status-badge.rsvp-checked-in-badge {
  background: var(--color-success-light);
  color: var(--color-success-dark);
}

.status-badge.rsvp-waitlist-badge {
  background: var(--color-warning-light);
  color: var(--color-warning-dark);
}

.status-badge.rsvp-default-badge {
  background: var(--surface-2);
  color: var(--color-text-secondary);
}

.purchase-actions {
  margin-top: var(--spacing-xs, 0.25rem);
}

/* Merchant admin access badge */
.access-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: var(--font-size-xs, 0.75rem);
  font-weight: var(--font-weight-semibold, 600);
  line-height: 1.5;
}

.admin-access-badge {
  background: var(--color-primary-light, #fdeee9);
  color: var(--color-primary, #f2542d);
  border: 1px solid var(--color-primary, #f2542d);
}

/* Merchant admins management section */
.merchant-admins-section {
  margin-top: var(--spacing-md, 1rem);
  padding-top: var(--spacing-md, 1rem);
  border-top: 1px solid color-mix(in srgb, var(--surface-2) 50%, transparent);
}

.merchant-admins-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-sm, 0.5rem);
}

.btn-action {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs, 0.25rem);
  padding: var(--spacing-xs, 0.25rem) var(--spacing-md, 0.75rem);
  border: 1px solid color-mix(in srgb, var(--surface-2) 60%, transparent);
  border-radius: var(--radius-full, 9999px);
  background: color-mix(in srgb, var(--surface-1) 75%, var(--surface-2));
  color: var(--color-text-primary);
  font-size: var(--font-size-xs, 0.75rem);
  font-weight: var(--font-weight-medium, 500);
  cursor: pointer;
  transition: background var(--transition-fast, 150ms ease),
              border-color var(--transition-fast, 150ms ease),
              color var(--transition-fast, 150ms ease);
}

.btn-action:hover:not(:disabled) {
  background: var(--color-primary, #f2542d);
  color: var(--color-text-on-primary, #fff);
  border-color: var(--color-primary, #f2542d);
}

.btn-action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.admin-member-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs, 0.25rem);
}

.admin-member-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm, 0.5rem);
  padding: var(--spacing-xs, 0.25rem) 0;
}

.admin-initials {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: var(--surface-2, #eee);
  color: var(--color-text-secondary, #666);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--font-size-sm, 0.875rem);
  font-weight: var(--font-weight-semibold, 600);
  flex-shrink: 0;
}

.admin-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.admin-name {
  font-size: var(--font-size-sm, 0.875rem);
  font-weight: var(--font-weight-medium, 500);
}

.admin-email {
  font-size: var(--font-size-xs, 0.75rem);
  color: var(--color-text-secondary, #666);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.danger-action {
  color: var(--color-error, #d93025);
  opacity: 0.7;
  padding: 0.2rem 0.4rem;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: var(--radius-sm, 4px);
  transition: opacity 0.15s;
}

.danger-action:hover:not(:disabled) {
  opacity: 1;
  background: var(--color-error-light, #fdecea);
}

.danger-action:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* Add admin search results */
.admin-search-results {
  list-style: none;
  padding: 0;
  margin: var(--spacing-sm, 0.5rem) 0 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs, 0.25rem);
  max-height: 14rem;
  overflow-y: auto;
  border: 1px solid var(--surface-2, #eee);
  border-radius: var(--radius-md, 8px);
}

.admin-search-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm, 0.5rem);
  padding: var(--spacing-sm, 0.5rem) var(--spacing-md, 1rem);
}

.admin-search-row:not(:last-child) {
  border-bottom: 1px solid var(--surface-2, #eee);
}
</style>
