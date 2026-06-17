<!-- src/components/Dashboard/FoodieGroupDashboard.vue -->
<template>
  <div class="foodie-group-dashboard">
    <!-- NOT AUTHENTICATED -->
    <section v-if="!isAuthenticated" class="section-card signin-card">
      <h1>Foodie Group Dashboard</h1>
      <p class="muted">
        You need to be signed in as a Foodie Group Admin to access this dashboard.
      </p>
      <button class="btn primary" @click="signInNow">
        <i class="pi pi-sign-in icon-spacing-sm"></i>Sign In to Continue
      </button>
      <p class="muted tiny">
        You'll be redirected to the secure sign-in page and brought back here after.
      </p>
    </section>

    <!-- ACCESS CHECK IN PROGRESS -->
    <section v-else-if="!authChecked" class="section-card access-check-card">
      <h1>Foodie Group Dashboard</h1>
      <p class="subtitle">Checking your Foodie Group permissions…</p>
    </section>

    <!-- AUTHENTICATED BUT NOT AUTHORIZED -->
    <section v-else-if="notAuthorized" class="section-card access-denied-card">
      <h1>Access Denied</h1>
      <p>{{ notAuthorizedMessage }}</p>
      <button class="btn primary" @click="$router.push('/profile')">
        <i class="pi pi-arrow-left icon-spacing-sm"></i>Back to Profile
      </button>
    </section>

    <!-- AUTHENTICATED + AUTHORIZED DASHBOARD -->
    <template v-else>
      <!-- Header in the same spirit as Profile.vue -->
      <header class="profile-header">
        <h1>Foodie Group Dashboard</h1>
        <p class="subtitle">
          Manage coupon submissions, track statistics, and update group details.
        </p>

        <div class="user-context" v-if="user && isAuthenticated">
          <h2 class="user-name">{{ user.name || user.email }}</h2>

          <p class="muted">
            Managing: <strong>{{ group && group.name ? group.name : '—' }}</strong>
          </p>

          <span class="role-pill">
            {{ role || 'foodie_group_admin' }}
          </span>
        </div>

        <div v-if="adminMemberships.length > 1" class="group-selector">
          <label for="groupSelector">Managing:</label>
          <select
            id="groupSelector"
            :value="groupId"
            @change="switchGroup($event.target.value)"
          >
            <option
              v-for="g in adminMemberships"
              :key="g.groupId"
              :value="g.groupId"
            >
              {{ g.name }}
            </option>
          </select>
        </div>
      </header>

      <!-- Group Overview Section -->
      <section class="dashboard-section group-overview" v-if="groupLoaded">
        <h2>Group Overview</h2>
        
        <div v-if="overviewLoading" class="loading-state">Loading analytics...</div>
        <div v-else-if="overviewError" class="error-state">{{ overviewError }}</div>
        <div v-else class="stats-grid">
          <div class="stat-card">
            <span class="stat-label">Paid Purchases</span>
            <span class="stat-value highlight-success">
              {{ groupOverview.counts?.purchases?.paid || 0 }}
            </span>
          </div>
          <div class="stat-card wide">
            <span class="stat-label">Gross Revenue</span>
            <span class="stat-value highlight-success">
              {{ formatCurrency(groupOverview.revenue?.grossCents || 0) }}
            </span>
          </div>
          <div class="stat-card clickable" @click="scrollToSection('active-coupons')" title="View active coupons">
            <span class="stat-label">Coupons</span>
            <span class="stat-value">
              {{ groupOverview.counts?.coupons || 0 }}
            </span>
            <span class="stat-hint">Click to view</span>
          </div>
          <div class="stat-card clickable" @click="scrollToSection('pending-submissions')" title="View pending submissions">
            <span class="stat-label">Pending Coupon Submissions</span>
            <span class="stat-value highlight-warning">
              {{ stats.pendingSubmissions || 0 }}
            </span>
            <span class="stat-hint">Click to view</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Published Events</span>
            <span class="stat-value">
              {{ groupOverview.counts?.events?.published || 0 }}
            </span>
          </div>
          <div class="stat-card clickable" @click="scrollToSection('pending-event-submissions')" title="View pending event submissions">
            <span class="stat-label">Pending Event Submissions</span>
            <span class="stat-value highlight-warning">
              {{ groupOverview.counts?.eventSubmissions?.pending || 0 }}
            </span>
            <span class="stat-hint">Click to view</span>
          </div>
        </div>

        <!--
          Subscription & access metrics. Rendered unconditionally because these
          values (gifted access, admin-granted access) are meaningful for both
          one-time and subscription groups, and because zero values are a
          legitimate "no activity yet" indicator that admins should still see.
          The header text adapts to the group's current billing model.
        -->
        <h3 style="margin-top: var(--spacing-xl);">
          {{ billingModel === 'subscription' ? 'Subscription Metrics' : 'Access Metrics' }}
          <span v-if="billingModel !== 'subscription'" class="muted tiny" style="font-weight: normal;">
            · group is on one-time billing
          </span>
        </h3>
        <div class="stats-grid">
          <div class="stat-card">
            <span class="stat-label">Active Subscribers</span>
            <span class="stat-value highlight-success">
              {{ groupOverview.subscriptions?.activeSubscribers || 0 }}
            </span>
          </div>
          <div class="stat-card">
            <span class="stat-label">MRR</span>
            <span class="stat-value highlight-success">
              {{ formatCurrency(groupOverview.subscriptions?.mrrCents || 0) }}
            </span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Past Due (grace period)</span>
            <span
              class="stat-value"
              :class="groupOverview.subscriptions?.pastDueSubscribers > 0 ? 'highlight-warning' : ''"
            >
              {{ groupOverview.subscriptions?.pastDueSubscribers || 0 }}
            </span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Canceling at Period End</span>
            <span
              class="stat-value"
              :class="groupOverview.subscriptions?.cancelingSubscribers > 0 ? 'highlight-warning' : ''"
            >
              {{ groupOverview.subscriptions?.cancelingSubscribers || 0 }}
            </span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Gifted Access</span>
            <span class="stat-value">
              {{ groupOverview.subscriptions?.giftedAccess || 0 }}
            </span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Admin Granted</span>
            <span class="stat-value">
              {{ groupOverview.subscriptions?.adminGranted || 0 }}
            </span>
          </div>
        </div>

        <h3 style="margin-top: var(--spacing-xl);">Recent Purchases</h3>
        <div class="data-table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in groupOverview.recentPurchases" :key="p.id">
                <td>{{ p.userEmail || 'Unknown' }}</td>
                <td>{{ formatCurrency(p.amountCents) }}</td>
                <td>
                  <span :class="['status-badge', getStatusClass(p.status)]">
                    {{ p.status }}
                  </span>
                </td>
                <td>{{ formatDate(p.createdAt) }}</td>
              </tr>
              <tr v-if="!groupOverview.recentPurchases || groupOverview.recentPurchases.length === 0">
                <td colspan="4" class="empty-state">No purchases yet</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="dashboard-section group-redemption-overview" v-if="groupLoaded">
        <h2>Group Coupon Performance</h2>

        <div v-if="redemptionOverviewLoading" class="loading-state">Loading redemption analytics...</div>
        <div v-else-if="redemptionOverviewError" class="error-state">{{ redemptionOverviewError }}</div>
        <div v-else class="stats-grid">
          <div class="stat-card">
            <span class="stat-label">Group Redemptions (Last 30 Days)</span>
            <span class="stat-value highlight-success">
              {{ redemptionOverview.redemptionsLast30Days }}
            </span>
          </div>
          <div class="stat-card wide">
            <span class="stat-label">Top Coupon (Last 30 Days)</span>
            <span class="stat-value">
              {{ redemptionOverview.topCoupon ? redemptionOverview.topCoupon.couponTitle : 'None yet' }}
            </span>
            <template v-if="redemptionOverview.topCoupon">
              <span class="stat-hint">
                {{ redemptionOverview.topCoupon.redemptions }} redemption{{ redemptionOverview.topCoupon.redemptions === 1 ? '' : 's' }}
              </span>
              <div class="stat-details">
                <span class="stat-detail">
                  Submitted by: {{ redemptionOverview.topCoupon.submittedBy || 'Unknown' }}
                </span>
                <span class="stat-detail">
                  Submitted at: {{ formatDate(redemptionOverview.topCoupon.submittedAt) }}
                </span>
                <span class="stat-detail">
                  Expires at: {{ formatDate(redemptionOverview.topCoupon.expiresAt) }}
                </span>
              </div>
            </template>
          </div>
        </div>
      </section>

      <!-- Group Event Performance Section -->
      <section class="dashboard-section group-event-overview" v-if="groupLoaded">
        <h2>Group Event Performance</h2>

        <div v-if="eventOverviewLoading" class="loading-state">Loading event analytics...</div>
        <div v-else-if="eventOverviewError" class="error-state">{{ eventOverviewError }}</div>
        <div v-else class="stats-grid">
          <div class="stat-card">
            <span class="stat-label">RSVPs (Last 30 Days)</span>
            <span class="stat-value highlight-success">
              {{ eventOverview.rsvpsLast30Days }}
            </span>
          </div>
          <div class="stat-card">
            <span class="stat-label">Upcoming Published Events</span>
            <span class="stat-value">
              {{ eventOverview.upcomingPublishedEvents }}
            </span>
          </div>
          <div class="stat-card wide">
            <span class="stat-label">Top Event (Last 30 Days)</span>
            <span class="stat-value">
              {{ eventOverview.topEvent ? eventOverview.topEvent.eventName : 'None yet' }}
            </span>
            <template v-if="eventOverview.topEvent">
              <span class="stat-hint">
                {{ eventOverview.topEvent.rsvps }} RSVP{{ eventOverview.topEvent.rsvps === 1 ? '' : 's' }}
              </span>
              <div class="stat-details">
                <span class="stat-detail">
                  Merchant: {{ eventOverview.topEvent.merchantName || 'Unknown' }}
                </span>
                <span class="stat-detail">
                  Starts: {{ formatDate(eventOverview.topEvent.startDatetime) }}
                </span>
              </div>
            </template>
          </div>
        </div>
      </section>

      <section class="dashboard-section event-attendee-management" v-if="groupLoaded">
        <h2>Event Performance</h2>
        <p class="muted tiny">Select an event to view performance statistics and the guest list.</p>

        <div class="event-manager-controls">
          <select v-model="selectedEventId" @change="onSelectedEventChange">
            <option value="">Select an event</option>
            <option v-for="evt in managedEvents" :key="evt.id" :value="evt.id">
              {{ evt.name }}
            </option>
          </select>
        </div>

        <p v-if="attendeesError" class="tiny error-text">{{ attendeesError }}</p>
        <p v-if="attendeesLoading" class="muted tiny">Loading event stats...</p>

        <div v-if="selectedEventStats" class="stats-grid event-stats-grid">
          <div class="stat-card"><span class="stat-label">Total RSVPs</span><span class="stat-value">{{ selectedEventStats.totalRsvps }}</span></div>
          <div class="stat-card"><span class="stat-label">Confirmed Seats</span><span class="stat-value">{{ selectedEventStats.confirmedSeats }}</span></div>
          <div class="stat-card"><span class="stat-label">Waitlist</span><span class="stat-value">{{ selectedEventStats.waitlistCount }}</span></div>
          <div class="stat-card"><span class="stat-label">Cancellations</span><span class="stat-value">{{ selectedEventStats.cancellations }}</span></div>
          <div class="stat-card"><span class="stat-label">Checked-ins</span><span class="stat-value">{{ selectedEventStats.checkedIns }}</span></div>
          <div class="stat-card"><span class="stat-label">No-shows</span><span class="stat-value">{{ selectedEventStats.noShows }}</span></div>
          <div class="stat-card"><span class="stat-label">Attendance Rate</span><span class="stat-value">{{ formatPercent(selectedEventStats.attendanceRate) }}</span></div>
          <div class="stat-card"><span class="stat-label">Capacity Fill %</span><span class="stat-value">{{ formatPercent(selectedEventStats.capacityFillPercent) }}</span></div>
        </div>

        <!-- Per-guest attendee list: who's coming, who checked in, who cancelled -->
        <div v-if="selectedEventId && selectedEventAttendees.length" class="attendee-list">
          <h3>Guest List</h3>
          <table class="attendee-table">
            <thead>
              <tr>
                <th>Guest</th>
                <th>Email</th>
                <th class="num">Guests</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="a in selectedEventAttendees"
                :key="a.id"
                :class="{ 'attendee-cancelled': a.status === 'cancelled' }"
              >
                <td>{{ a.guestName || a.userName || 'Guest' }}</td>
                <td>{{ a.guestEmail || a.userEmail || '—' }}</td>
                <td class="num">{{ a.attendees }}</td>
                <td>
                  <span class="status-pill" :class="`status-${a.status}`">
                    {{ attendeeStatusLabel(a.status) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else-if="selectedEventId && !attendeesLoading && selectedEventStats" class="muted tiny">
          No RSVPs for this event yet.
        </p>
      </section>

      <!-- Edit Group Section -->
      <section class="dashboard-section edit-group" v-if="groupLoaded">
        <h2>Edit Group Details</h2>
        <form @submit.prevent="saveGroupDetails">
          <div class="form-group">
            <label for="groupName">Group Name:</label>
            <input id="groupName" type="text" v-model="group.name" required />
          </div>
          <div class="form-group">
            <label for="groupDescription">Group Description:</label>
            <textarea
              id="groupDescription"
              v-model="group.description"
              rows="3"
              required
            ></textarea>
          </div>
          <div class="form-group">
            <label for="location">Location:</label>
            <input
              id="location"
              type="text"
              v-model="group.location"
              placeholder="Enter location"
            />
          </div>
          <div class="form-group">
            <label for="bannerImage">Banner Image URL <span style="font-weight:400;font-size:0.8rem;color:var(--color-text-muted,#6b7280);">· wide banner, recommended 1600 × 500 px</span></label>
            <input
              id="bannerImage"
              type="text"
              v-model="group.bannerImage"
              placeholder="https://… (1600 × 500 px works best)"
            />
          </div>
          <div class="form-group">
            <label for="facebook">Facebook URL:</label>
            <input
              id="facebook"
              type="text"
              v-model="group.socialMedia.facebook"
              placeholder="Enter Facebook URL"
            />
          </div>
          <div class="form-group">
            <label for="instagram">Instagram URL:</label>
            <input
              id="instagram"
              type="text"
              v-model="group.socialMedia.instagram"
              placeholder="Enter Instagram URL"
            />
          </div>
          <div class="form-group">
            <label for="twitter">Twitter URL:</label>
            <input
              id="twitter"
              type="text"
              v-model="group.socialMedia.twitter"
              placeholder="Enter Twitter URL"
            />
          </div>
          <button type="submit">
            <i class="pi pi-save icon-spacing-sm"></i>Save Changes
          </button>
        </form>
      </section>

      <!-- Coupon Book Pricing Section -->
      <section class="dashboard-section pricing-section" v-if="groupLoaded">
        <h2>Coupon Book Pricing</h2>

        <!-- One-time groups keep the legacy single-amount editor -->
        <template v-if="billingModel !== 'subscription'">
          <div v-if="!editingPrice" class="current-price">
            <p>
              Current Price: <strong>{{ currentPriceDisplay }}</strong>
              <span class="muted tiny"> · {{ billingModeLabel }}</span>
            </p>
            <p v-if="priceIsDefault" class="muted tiny">
              This is the default price. Set a custom price to create a Stripe product.
            </p>
            <button @click="startEditPrice" class="btn-edit-price">
              <i class="pi pi-pencil icon-spacing-sm"></i>Edit Price
            </button>
          </div>

          <div v-else class="price-form">
            <div class="form-group">
              <label>Billing Model:</label>
              <div class="billing-model-options">
                <label class="radio-option">
                  <input type="radio" value="one_time" v-model="newBillingModel" />
                  <span>One-time purchase</span>
                </label>
                <label class="radio-option">
                  <input type="radio" value="subscription" v-model="newBillingModel" />
                  <span>Recurring subscription</span>
                </label>
              </div>
              <p class="help-text muted tiny">
                Switching to subscription replaces this editor with a multi-tier
                list (monthly / 6mo / annual). Existing purchases remain valid.
              </p>
            </div>

            <div v-if="newBillingModel === 'subscription'" class="form-group">
              <label for="cadenceSelect">Initial Cadence:</label>
              <select id="cadenceSelect" v-model="newCadenceKey">
                <option value="monthly">Monthly (every 1 month)</option>
                <option value="semiannual">Every 6 months</option>
                <option value="annual">Annually (every 12 months)</option>
              </select>
            </div>

            <div class="form-group">
              <label for="newPrice">
                {{ newBillingModel === 'subscription' ? 'Price per billing period (USD):' : 'New Price (USD):' }}
              </label>
              <div class="price-input-wrapper">
                <span class="currency-symbol">$</span>
                <input id="newPrice" type="number" v-model.number="newPriceDollars" min="0.50" max="999.99" step="0.01" placeholder="9.99" />
              </div>
            </div>

            <div class="price-form-actions">
              <button @click="savePrice" :disabled="savingPrice" class="btn primary">
                {{ savingPrice ? 'Saving...' : 'Save Price' }}
              </button>
              <button @click="cancelEditPrice" class="btn secondary" :disabled="savingPrice">Cancel</button>
            </div>
            <p v-if="priceError" class="error-text tiny">{{ priceError }}</p>
          </div>
        </template>

        <!-- Subscription groups: multi-tier editor -->
        <template v-else>
          <p class="muted tiny">
            Subscription tiers backed by a single Stripe Product. Drafts are
            suggested cadences that aren't visible to users until you publish
            them.
          </p>
          <p v-if="tiersError" class="error-text tiny">{{ tiersError }}</p>

          <div v-if="tiersLoading" class="muted">Loading tiers…</div>
          <table v-else-if="tiers.length" class="tier-table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Price</th>
                <th>Cadence</th>
                <th>Status</th>
                <th>Default</th>
                <th class="tier-actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="tier in tiers" :key="tier.id" :class="{ 'tier-draft': tier.status === 'draft' }">
                <td>
                  <input
                    type="text"
                    class="tier-label-input"
                    :value="tier.label || ''"
                    @change="onTierLabelChange(tier, $event.target.value)"
                    :disabled="tier.status === 'archived'"
                    placeholder="e.g. Monthly"
                  />
                </td>
                <td><strong>{{ tier.display }}</strong></td>
                <td>{{ formatCadence(tier.billingInterval, tier.billingIntervalCount) }}</td>
                <td>
                  <span class="tier-badge" :class="`tier-badge-${tier.status}`">{{ tier.status }}</span>
                </td>
                <td>
                  <button
                    v-if="tier.status === 'active'"
                    @click="onSetDefault(tier)"
                    class="tier-default-toggle"
                    :class="{ 'is-default': tier.isDefault }"
                    :disabled="tier.isDefault || tierBusyId === tier.id"
                    :title="tier.isDefault ? 'Currently the default tier' : 'Promote to default'"
                  >
                    <i class="pi" :class="tier.isDefault ? 'pi-star-fill' : 'pi-star'"></i>
                  </button>
                  <span v-else class="muted tiny">—</span>
                </td>
                <td class="tier-actions">
                  <button
                    v-if="tier.status === 'draft'"
                    @click="onPublishTier(tier)"
                    :disabled="tierBusyId === tier.id"
                    class="btn-sm btn-primary-sm"
                  >
                    {{ tierBusyId === tier.id ? '…' : 'Publish' }}
                  </button>
                  <button
                    v-if="tier.status !== 'archived'"
                    @click="onArchiveTier(tier)"
                    :disabled="tierBusyId === tier.id"
                    class="btn-sm btn-danger-sm"
                  >
                    Archive
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-else class="muted">No tiers yet. Add one below to start accepting subscriptions.</p>

          <div class="tier-add">
            <button v-if="!addingTier" @click="startAddTier" class="btn primary">
              <i class="pi pi-plus icon-spacing-sm"></i>Add tier
            </button>

            <div v-else class="tier-add-form card">
              <h4>New tier</h4>
              <div class="tier-add-grid">
                <div class="form-group">
                  <label for="newTierLabel">Label</label>
                  <input id="newTierLabel" type="text" v-model="newTier.label" placeholder="e.g. Annual" />
                </div>
                <div class="form-group">
                  <label for="newTierPrice">Price (USD)</label>
                  <div class="price-input-wrapper">
                    <span class="currency-symbol">$</span>
                    <input id="newTierPrice" type="number" v-model.number="newTier.priceDollars" min="0.50" max="999.99" step="0.01" />
                  </div>
                </div>
                <div class="form-group">
                  <label for="newTierCadence">Cadence</label>
                  <select id="newTierCadence" v-model="newTier.cadenceKey">
                    <option value="monthly">Monthly</option>
                    <option value="semiannual">Every 6 months</option>
                    <option value="annual">Annually</option>
                  </select>
                </div>
                <div class="form-group">
                  <label for="newTierStatus">Publish state</label>
                  <select id="newTierStatus" v-model="newTier.status">
                    <option value="active">Active (creates Stripe price)</option>
                    <option value="draft">Draft (no Stripe price yet)</option>
                  </select>
                </div>
              </div>
              <label class="radio-option">
                <input type="checkbox" v-model="newTier.isDefault" :disabled="newTier.status !== 'active'" />
                <span>Make this the default tier</span>
              </label>
              <p v-if="newTierError" class="error-text tiny">{{ newTierError }}</p>
              <div class="price-form-actions">
                <button @click="submitNewTier" :disabled="savingTier" class="btn primary">
                  {{ savingTier ? 'Saving…' : 'Create tier' }}
                </button>
                <button @click="cancelAddTier" :disabled="savingTier" class="btn secondary">Cancel</button>
              </div>
            </div>
          </div>
        </template>
      </section>

      <!-- Coupons Board (Kanban Style) -->
      <section id="coupons-board" class="dashboard-section submissions-board" v-if="groupLoaded">
        <div id="pending-submissions" class="kanban-column pending">
          <h2>Pending Submissions</h2>
          <div class="column-content">
            <div class="pending-coupons card">
              <h3>Coupon Submissions</h3>

              <p v-if="pendingLoading" class="muted tiny">
                Loading pending submissions…
              </p>
              <p v-if="pendingError" class="tiny error-text">
                {{ pendingError }}
              </p>

              <ul v-if="!pendingLoading && !pendingError">
                <li v-for="c in pendingCoupons" :key="c.id" class="pending-submission-card">
                  <div class="pending-card-header">
                    <strong>{{ c.title || c.description }}</strong>
                    <span v-if="c.couponType" class="badge badge-type">{{ c.couponType }}</span>
                  </div>
                  <div class="pending-card-meta muted tiny">
                    Merchant: {{ c.merchantName }}<br />
                    <span v-if="c.discountValue">Discount: {{ c.discountValue }}{{ c.couponType === 'percent' ? '%' : '' }}</span>
                    <span v-if="c.expiresAt"> · Expires: {{ formatDate(c.expiresAt) }}</span>
                  </div>
                  <div v-if="c.updatedAt" class="muted tiny freshness-hint">
                    Last edited by merchant on {{ formatDate(c.updatedAt) }}
                  </div>
                  <div class="action-buttons">
                    <button class="btn-review" @click="openReviewModal(c)">
                      <i class="pi pi-eye icon-spacing-sm"></i>Review
                    </button>
                    <button @click="approveCoupon(c)">
                      <i class="pi pi-check icon-spacing-sm"></i>Approve
                    </button>
                    <button @click="rejectCoupon(c)">
                      <i class="pi pi-times icon-spacing-sm"></i>Reject
                    </button>
                  </div>
                </li>
                <li v-if="pendingCoupons.length === 0" class="muted tiny">
                  No pending submissions for this group.
                </li>
              </ul>
            </div>

            <div id="pending-event-submissions" class="pending-events card">
              <h3>Event Submissions</h3>

              <p v-if="pendingEventsLoading" class="muted tiny">
                Loading pending event submissions…
              </p>
              <p v-if="pendingEventsError" class="tiny error-text">
                {{ pendingEventsError }}
              </p>

              <ul v-if="!pendingEventsLoading && !pendingEventsError">
                <li v-for="e in pendingEvents" :key="e.id" class="pending-submission-card">
                  <div class="pending-card-header">
                    <strong>{{ e.name || e.description }}</strong>
                    <span v-if="e.visibility" class="badge badge-type">{{ e.visibility }}</span>
                  </div>
                  <div class="pending-card-meta muted tiny">
                    Merchant: {{ e.merchantName }}<br />
                    <span v-if="e.startDatetime">Starts: {{ formatDate(e.startDatetime) }}</span>
                    <span v-if="e.location"> · {{ e.location }}</span>
                    <span v-if="e.capacity"> · Capacity: {{ e.capacity }}</span>
                  </div>
                  <div v-if="e.updatedAt" class="muted tiny freshness-hint">
                    Last edited by merchant on {{ formatDate(e.updatedAt) }}
                  </div>
                  <div class="action-buttons">
                    <button class="btn-review" @click="openEventReviewModal(e)">
                      <i class="pi pi-eye icon-spacing-sm"></i>Review
                    </button>
                    <button @click="approveEvent(e)">
                      <i class="pi pi-check icon-spacing-sm"></i>Approve
                    </button>
                    <button @click="rejectEvent(e)">
                      <i class="pi pi-times icon-spacing-sm"></i>Reject
                    </button>
                  </div>
                </li>
                <li v-if="pendingEvents.length === 0" class="muted tiny">
                  No pending event submissions for this group.
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div id="active-coupons" class="kanban-column active">
          <h2>Active</h2>
          <div class="column-content">
            <div class="active-coupons card">
              <h3>Coupons</h3>
              <p v-if="activeLoading" class="muted tiny">
                Loading active coupons…
              </p>
              <p v-if="activeError" class="tiny error-text">
                {{ activeError }}
              </p>

              <ul v-if="!activeLoading && !activeError">
                <li v-for="c in activeCoupons" :key="c.id" class="pending-submission-card">
                  <div class="pending-card-header">
                    <strong>{{ c.title || c.description }}</strong>
                    <span v-if="c.couponType" class="badge badge-type">{{ c.couponType }}</span>
                  </div>
                  <div v-if="c.description" class="muted tiny pending-card-meta">
                    {{ c.description }}
                  </div>
                  <div class="pending-card-meta muted tiny">
                    Submitted by: {{ c.merchantName || 'Unknown' }}<br />
                    <span v-if="c.discountValue">
                      Discount: {{ c.discountValue }}{{ c.couponType === 'percent' ? '%' : '' }}
                    </span>
                    <span v-if="c.validFrom"> · Active since: {{ formatDate(c.validFrom) }}</span>
                    <span v-if="c.expiresAt"> · Expires: {{ formatDate(c.expiresAt) }}</span>
                  </div>
                  <div class="muted tiny">
                    Redemptions: {{ c.redemptions }}
                  </div>
                </li>
                <li v-if="activeCoupons.length === 0" class="muted tiny">
                  No active coupons for this group yet.
                </li>
              </ul>
            </div>

            <div id="active-event-submissions" class="active-events card">
              <h3>Events</h3>
              <p v-if="activeEventsLoading" class="muted tiny">
                Loading active events…
              </p>
              <p v-if="activeEventsError" class="tiny error-text">
                {{ activeEventsError }}
              </p>

              <ul v-if="!activeEventsLoading && !activeEventsError">
                <li v-for="e in activeEvents" :key="e.id" class="pending-submission-card">
                  <div class="pending-card-header">
                    <strong>{{ e.name }}</strong>
                    <span v-if="e.visibility" class="badge badge-type">{{ e.visibility }}</span>
                  </div>
                  <div class="pending-card-meta muted tiny">
                    Merchant: {{ e.merchantName }}<br />
                    <span v-if="e.startDatetime">Starts: {{ formatDate(e.startDatetime) }}</span>
                    <span v-if="e.location"> · {{ e.location }}</span>
                    <span v-if="e.capacity"> · Capacity: {{ e.capacity }}</span>
                  </div>
                  <div class="muted tiny">
                    RSVPs: {{ e.confirmedCount || 0 }}
                  </div>
                </li>
                <li v-if="activeEvents.length === 0" class="muted tiny">
                  No active events for this group yet.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <!-- Review Detail Modal (Coupon) -->
      <Modal v-if="reviewModalCoupon" @close="closeReviewModal">
        <h2>Review Submission</h2>
        <table class="review-table">
          <tbody>
            <tr><th>Title</th><td>{{ reviewModalCoupon.title }}</td></tr>
            <tr><th>Description</th><td>{{ reviewModalCoupon.description }}</td></tr>
            <tr><th>Coupon Type</th><td>{{ reviewModalCoupon.couponType }}</td></tr>
            <tr v-if="reviewModalCoupon.discountValue"><th>Discount Value</th><td>{{ reviewModalCoupon.discountValue }}{{ reviewModalCoupon.couponType === 'percent' ? '%' : '' }}</td></tr>
            <tr><th>Valid From</th><td>{{ formatDate(reviewModalCoupon.validFrom) }}</td></tr>
            <tr><th>Expires At</th><td>{{ formatDate(reviewModalCoupon.expiresAt) }}</td></tr>
            <tr><th>Locked</th><td>{{ reviewModalCoupon.locked ? 'Yes' : 'No' }}</td></tr>
            <tr><th>Merchant</th><td>{{ reviewModalCoupon.merchantName }}</td></tr>
            <tr v-if="reviewModalCoupon.submittedAt"><th>Submitted</th><td>{{ formatDate(reviewModalCoupon.submittedAt) }}</td></tr>
            <tr v-if="reviewModalCoupon.updatedAt"><th>Last Edited</th><td>{{ formatDate(reviewModalCoupon.updatedAt) }}</td></tr>
          </tbody>
        </table>
        <div class="review-modal-actions">
          <button class="btn primary" @click="approveCoupon(reviewModalCoupon); closeReviewModal()">
            <i class="pi pi-check icon-spacing-sm"></i>Approve
          </button>
          <button class="btn danger" @click="rejectCoupon(reviewModalCoupon); closeReviewModal()">
            <i class="pi pi-times icon-spacing-sm"></i>Reject
          </button>
          <button class="btn tertiary" @click="closeReviewModal">Cancel</button>
        </div>
      </Modal>

      <!-- Review Detail Modal (Event) -->
      <Modal v-if="reviewModalEvent" @close="closeEventReviewModal">
        <h2>Review Event Submission</h2>
        <table class="review-table">
          <tbody>
            <tr><th>Event Name</th><td>{{ reviewModalEvent.name }}</td></tr>
            <tr><th>Description</th><td>{{ reviewModalEvent.description }}</td></tr>
            <tr><th>Starts</th><td>{{ formatDate(reviewModalEvent.startDatetime) }}</td></tr>
            <tr v-if="reviewModalEvent.endDatetime"><th>Ends</th><td>{{ formatDate(reviewModalEvent.endDatetime) }}</td></tr>
            <tr v-if="reviewModalEvent.location"><th>Location</th><td>{{ reviewModalEvent.location }}</td></tr>
            <tr><th>Capacity</th><td>{{ reviewModalEvent.capacity }}</td></tr>
            <tr><th>Free</th><td>{{ reviewModalEvent.isFree ? 'Yes' : 'No' }}</td></tr>
            <tr><th>Visibility</th><td>{{ reviewModalEvent.visibility }}</td></tr>
            <tr><th>Merchant</th><td>{{ reviewModalEvent.merchantName }}</td></tr>
            <tr v-if="reviewModalEvent.submittedAt"><th>Submitted</th><td>{{ formatDate(reviewModalEvent.submittedAt) }}</td></tr>
            <tr v-if="reviewModalEvent.updatedAt"><th>Last Edited</th><td>{{ formatDate(reviewModalEvent.updatedAt) }}</td></tr>
          </tbody>
        </table>
        <div v-if="reviewModalEvent.coverImageUrl" style="margin-top: var(--spacing-md);">
          <strong>Cover Image:</strong><br />
          <img :src="reviewModalEvent.coverImageUrl" alt="Cover" style="max-width: 100%; max-height: 200px; border-radius: var(--radius-md); margin-top: var(--spacing-xs);" />
        </div>
        <div class="review-modal-actions">
          <button class="btn primary" @click="approveEvent(reviewModalEvent); closeEventReviewModal()">
            <i class="pi pi-check icon-spacing-sm"></i>Approve
          </button>
          <button class="btn danger" @click="rejectEvent(reviewModalEvent); closeEventReviewModal()">
            <i class="pi pi-times icon-spacing-sm"></i>Reject
          </button>
          <button class="btn tertiary" @click="closeEventReviewModal">Cancel</button>
        </div>
      </Modal>
    </template>
  </div>
</template>

<script>
import { mapGetters } from "vuex";
import { getAccessToken, signIn } from "@/services/authService";
import Modal from "@/components/Common/Modal.vue";
import {
  listGroupPrices as listGroupPricesApi,
  createTier as createTierApi,
  updateTier as updateTierApi,
  archiveTier as archiveTierApi,
} from "@/services/subscriptionService";
import {
  listEvents,
  getEventStats,
  getAttendees,
} from "@/services/eventService";

const API_BASE = "/api/v1";

export default {
  name: "FoodieGroupDashboard",

  components: { Modal },

  data() {
    return {
      // current user (same idea as Profile.vue)
      user: null,
      userLoading: false,
      userError: null,

      groupId: null,
      group: {
        name: "",
        description: "",
        location: "",
        bannerImage: "",
        socialMedia: { facebook: "", instagram: "", twitter: "" },
      },
      groupLoaded: false,
      groupError: null,

      adminMemberships: [],
      membershipsLoading: false,

      pendingCoupons: [],
      pendingLoading: false,
      pendingError: null,
      reviewModalCoupon: null,

      activeCoupons: [],
      activeLoading: false,
      activeError: null,

      stats: {
        totalMembers: 0,
        totalCoupons: 0,
        pendingSubmissions: 0,
      },

      // pricing management
      currentPriceDisplay: '$9.99',
      priceIsDefault: true,
      editingPrice: false,
      newPriceDollars: 9.99,
      savingPrice: false,
      priceError: null,
      // Billing model / cadence state for the pricing editor. These are
      // populated from GET /api/v1/groups/:id/price when the section loads.
      billingModel: 'one_time',
      billingInterval: null,
      billingIntervalCount: null,
      stripeRecurringPriceId: null,
      newBillingModel: 'one_time',
      newCadenceKey: 'monthly',

      // multi-tier subscription editor
      tiers: [],
      tiersLoading: false,
      tiersError: null,
      tierBusyId: null,
      addingTier: false,
      savingTier: false,
      newTierError: null,
      newTier: {
        label: '',
        priceDollars: 9.99,
        cadenceKey: 'monthly',
        status: 'active',
        isDefault: false,
      },

      // group overview analytics
      groupOverview: {
        counts: { coupons: 0, events: { published: 0 }, eventSubmissions: { pending: 0, approved: 0, rejected: 0 }, purchases: { paid: 0 } },
        revenue: { grossCents: 0 },
        recentPurchases: []
      },
      overviewLoading: false,
      overviewError: null,

      redemptionOverview: {
        redemptionsLast30Days: 0,
        topCoupon: null,
      },
      redemptionOverviewLoading: false,
      redemptionOverviewError: null,

      // event submissions
      pendingEvents: [],
      pendingEventsLoading: false,
      pendingEventsError: null,
      reviewModalEvent: null,

      // active (approved) events
      activeEvents: [],
      activeEventsLoading: false,
      activeEventsError: null,

      // event overview analytics
      eventOverview: {
        rsvpsLast30Days: 0,
        topEvent: null,
        upcomingPublishedEvents: 0,
      },
      eventOverviewLoading: false,
      eventOverviewError: null,

      managedEvents: [],
      selectedEventId: '',
      attendeesLoading: false,
      attendeesError: null,
      selectedEventStats: null,
      selectedEventAttendees: [],

      // authorization gate
      authChecked: false,
      notAuthorized: false,
      notAuthorizedMessage:
        "You are not authorized to manage this Foodie Group.",
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

    /**
     * Human-readable label for the current billing configuration shown in the
     * read-only pricing summary. Falls back to "One-time purchase" when no
     * cadence is configured.
     */
    billingModeLabel() {
      if (this.billingModel !== 'subscription') return 'One-time purchase';
      const count = this.billingIntervalCount;
      const interval = this.billingInterval;
      if (interval === 'month' && count === 1) return 'Subscription · Monthly';
      if (interval === 'month' && count === 6) return 'Subscription · Every 6 months';
      if (interval === 'month' && count === 12) return 'Subscription · Yearly';
      if (interval === 'year' && count === 1) return 'Subscription · Yearly';
      if (interval && count) return `Subscription · Every ${count} ${interval}(s)`;
      return 'Subscription (cadence not set)';
    },

  },

  watch: {
    "$route.params.groupId": {
      handler(newGroupId) {
        if (newGroupId && newGroupId !== this.groupId) {
          this.groupId = newGroupId;
          this.reloadAllGroupData();
        }
      },
      immediate: false,
    },
  },

  async created() {
    this.groupId = this.$route.params.groupId;

    if (!this.groupId) {
      this.$router.replace('/profile');
      return;
    }

    // If not logged in, do not attempt API calls – let the gate render.
    if (!this.isAuthenticated) {
      this.authChecked = true;
      return;
    }

    try {
      await Promise.all([this.loadCurrentUser(), this.loadAdminMemberships()]);
      await this.loadGroupDetails();
      if (this.notAuthorized) return;

      await Promise.all([
        this.loadPendingCoupons(),
        this.loadActiveCoupons(),
        this.fetchCurrentPrice(),
        this.loadTiers(),
        this.loadGroupOverview(),
        this.loadRedemptionOverview(),
        this.loadPendingEvents(),
        this.loadActiveEvents(),
        this.loadEventOverview(),
        this.loadManagedEvents(),
      ]);
    } finally {
      this.authChecked = true;
    }
  },

  methods: {
    signInNow() {
      signIn();
    },

    markNotAuthorized(msg) {
      this.notAuthorized = true;
      if (msg) {
        this.notAuthorizedMessage = msg;
      }
      this.authChecked = true;
    },

    async loadAdminMemberships() {
      this.membershipsLoading = true;
      try {
        const token = await getAccessToken();
        const res = await fetch(`${API_BASE}/groups/my/admin-memberships`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          this.adminMemberships = Array.isArray(data) ? data : [];
        }
      } catch (err) {
        console.error("[FoodieGroupDashboard] loadAdminMemberships error", err);
      } finally {
        this.membershipsLoading = false;
      }
    },

    switchGroup(newGroupId) {
      localStorage.setItem("lastAdminGroupId", newGroupId);
      this.$router.push({
        name: "FoodieGroupDashboard",
        params: { groupId: newGroupId },
      });
    },

    async reloadAllGroupData() {
      this.authChecked = false;
      this.notAuthorized = false;
      this.groupLoaded = false;
      this.groupError = null;
      
      // Reset price editing state when switching groups to prevent
      // accidentally saving a price to the wrong group
      this.editingPrice = false;
      this.priceError = null;
      
      await this.loadGroupDetails();
      if (!this.notAuthorized) {
        await Promise.all([
          this.loadPendingCoupons(),
          this.loadActiveCoupons(),
          this.fetchCurrentPrice(),
          this.loadTiers(),
          this.loadGroupOverview(),
          this.loadRedemptionOverview(),
          this.loadPendingEvents(),
          this.loadActiveEvents(),
          this.loadEventOverview(),
          this.loadManagedEvents(),
        ]);
      }
      this.authChecked = true;
    },

    // 🔹 Load current user (mirrors Profile.vue pattern)
    async loadCurrentUser() {
      this.userLoading = true;
      this.userError = null;
      try {
        const token = await getAccessToken();
        if (!token) {
          this.user = null;
          return;
        }

        const res = await fetch("/api/v1/users/me", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          console.error("Failed to load /api/v1/users/me", res.status);
          this.user = null;
          return;
        }

        const data = await res.json();
        this.user = {
          id: data.id,
          email: data.email,
          name: data.name,
          role: data.role,
        };
      } catch (err) {
        console.error("[FoodieGroupDashboard] loadCurrentUser error", err);
        this.userError =
          err.message || "Could not load the current signed-in user.";
        this.user = null;
      } finally {
        this.userLoading = false;
      }
    },

    // Fetch group info
    async loadGroupDetails() {
      this.groupLoaded = false;
      this.groupError = null;
      if (!this.groupId) {
        return;
      }
      try {
        const token = await getAccessToken();
        const res = await fetch(`${API_BASE}/groups/${this.groupId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (res.status === 403) {
          const body = await res.json().catch(() => ({}));
          this.markNotAuthorized(
            body.error ||
              "You are signed in, but you are not authorized to manage this Foodie Group."
          );
          return;
        }

        if (res.status === 401) {
          this.markNotAuthorized(
            "Your session is not authorized for this Foodie Group. Please sign in again or contact support."
          );
          return;
        }

        if (!res.ok) {
          const errText = await res.text().catch(() => res.statusText);
          throw new Error(
            `Failed to load group (${res.status}): ${
              errText || res.statusText
            }`
          );
        }

        const g = await res.json();

        this.group.name = g.name || "";
        this.group.description = g.description || "";
        this.group.location = g.location || "";
        this.group.bannerImage = g.bannerImageUrl || "";
        this.group.socialMedia = {
          facebook: g.socialLinks?.facebook || "",
          instagram: g.socialLinks?.instagram || "",
          twitter: g.socialLinks?.twitter || "",
        };

        if (typeof g.totalMembers === 'number') {
          this.stats.totalMembers = g.totalMembers;
        } else {
          this.stats.totalMembers = 0;
        }
        
        this.groupLoaded = true;
      } catch (err) {
        if (!this.notAuthorized) {
          console.error("Failed to load group:", err);
          this.groupError = err.message || "Could not load group details.";
          this.groupLoaded = false;
        }
      }
    },

    // Fetch pending submissions filtered by groupId (auth-protected)
    async loadPendingCoupons() {
      if (this.notAuthorized || !this.groupId) return;

      this.pendingLoading = true;
      this.pendingError = null;
      try {
        const token = await getAccessToken();
        const res = await fetch(
          `${API_BASE}/coupon-submissions?groupId=${encodeURIComponent(
            this.groupId
          )}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (res.status === 403) {
          const body = await res.json().catch(() => ({}));
          this.markNotAuthorized(
            body.error ||
              "You are not authorized to view pending submissions for this Foodie Group."
          );
          return;
        }

        if (res.status === 401) {
          this.markNotAuthorized(
            "Your session is not authorized for this Foodie Group. Please sign in again."
          );
          return;
        }

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          const msg =
            errBody.error ||
            `Failed to load pending submissions (status ${res.status})`;
          throw new Error(msg);
        }

        const list = await res.json();

        if (!Array.isArray(list)) {
          throw new Error("Unexpected response format from /coupon-submissions");
        }

        this.pendingCoupons = list
          .filter((sub) => sub.state === "pending")
          .map((sub) => ({
            id: sub.id,
            title: sub.submissionData?.title || "",
            description: sub.submissionData?.description || "",
            couponType: sub.submissionData?.coupon_type || "",
            discountValue: sub.submissionData?.discount_value,
            validFrom: sub.submissionData?.valid_from,
            expiresAt: sub.submissionData?.expires_at,
            locked: sub.submissionData?.locked,
            merchantName: sub.merchantName,
            merchantId: sub.merchantId,
            submittedAt: sub.submittedAt,
            updatedAt: sub.updatedAt,
            expires_at: sub.submissionData?.expires_at,
          }));

        this.stats.pendingSubmissions = this.pendingCoupons.length;
      } catch (err) {
        if (!this.notAuthorized) {
          console.error("[FoodieGroupDashboard] loadPendingCoupons failed", err);
          this.pendingError =
            err.message ||
            "Could not load pending submissions for this group.";
          this.pendingCoupons = [];
          this.stats.pendingSubmissions = 0;
        }
      } finally {
        this.pendingLoading = false;
      }
    },

    // Fetch active coupons & update stats
    async loadActiveCoupons() {
      if (this.notAuthorized || !this.groupId) return;

      this.activeLoading = true;
      this.activeError = null;
      try {
        const token = await getAccessToken();
        const res = await fetch(
          `${API_BASE}/coupons?groupId=${encodeURIComponent(this.groupId)}`,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          }
        );

        if (res.status === 403) {
          const body = await res.json().catch(() => ({}));
          this.markNotAuthorized(
            body.error ||
              "You are not authorized to view coupons for this Foodie Group."
          );
          return;
        }

        if (res.status === 401) {
          this.markNotAuthorized(
            "Your session is not authorized for this Foodie Group. Please sign in again."
          );
          return;
        }

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          const msg =
            errBody.error ||
            `Failed to load active coupons (status ${res.status})`;
          throw new Error(msg);
        }

        const list = await res.json();

        if (!Array.isArray(list)) {
          throw new Error("Unexpected response format from /coupons");
        }

        this.activeCoupons = list
          .map((c) => ({
            id: c.id,
            title: c.title,
            description: c.description,
            couponType: c.coupon_type,
            discountValue: c.discount_value,
            validFrom: c.valid_from,
            expiresAt: c.expires_at,
            merchantName: c.merchant_name,
            redemptions: c.redemptions || 0,
          }))
          .filter((coupon) => !this.isExpiredCoupon(coupon.expiresAt));
        this.stats.totalCoupons = this.activeCoupons.length;
      } catch (err) {
        if (!this.notAuthorized) {
          console.error("[FoodieGroupDashboard] loadActiveCoupons failed", err);
          this.activeError =
            err.message || "Could not load active coupons for this group.";
          this.activeCoupons = [];
          this.stats.totalCoupons = 0;
        }
      } finally {
        this.activeLoading = false;
      }
    },

    // Fetch group overview analytics
    async loadGroupOverview() {
      if (this.notAuthorized || !this.groupId) return;
      
      this.overviewLoading = true;
      this.overviewError = null;
      try {
        const token = await getAccessToken();
        const res = await fetch(
          `${API_BASE}/groups/${this.groupId}/admin/overview`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        if (res.status === 403 || res.status === 401) {
          const body = await res.json().catch(() => ({}));
          this.markNotAuthorized(body.error || 'Not authorized');
          return;
        }
        
        if (!res.ok) throw new Error(`Failed to load overview: ${res.status}`);
        
        this.groupOverview = await res.json();
      } catch (err) {
        console.error('[FoodieGroupDashboard] loadGroupOverview error', err);
        this.overviewError = err.message || 'Could not load group overview';
      } finally {
        this.overviewLoading = false;
      }
    },

    async loadRedemptionOverview() {
      if (this.notAuthorized || !this.groupId) return;

      this.redemptionOverviewLoading = true;
      this.redemptionOverviewError = null;
      try {
        const token = await getAccessToken();
        const res = await fetch(
          `${API_BASE}/groups/${this.groupId}/redemption-overview`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (res.status === 403 || res.status === 401) {
          const body = await res.json().catch(() => ({}));
          this.markNotAuthorized(body.error || 'Not authorized');
          return;
        }

        if (!res.ok) throw new Error(`Failed to load redemption overview: ${res.status}`);

        const data = await res.json();
        this.redemptionOverview = {
          redemptionsLast30Days: Number(data.redemptionsLast30Days || 0),
          topCoupon: data.topCoupon || null,
        };
      } catch (err) {
        console.error('[FoodieGroupDashboard] loadRedemptionOverview error', err);
        this.redemptionOverviewError = err.message || 'Could not load redemption overview';
        this.redemptionOverview = {
          redemptionsLast30Days: 0,
          topCoupon: null,
        };
      } finally {
        this.redemptionOverviewLoading = false;
      }
    },

    // ── Event submissions (pending queue for group admins) ─────────
    async loadPendingEvents() {
      if (this.notAuthorized || !this.groupId) return;

      this.pendingEventsLoading = true;
      this.pendingEventsError = null;
      try {
        const token = await getAccessToken();
        const res = await fetch(
          `${API_BASE}/event-submissions?groupId=${encodeURIComponent(this.groupId)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );

        if (res.status === 403) {
          const body = await res.json().catch(() => ({}));
          this.markNotAuthorized(body.error || 'You are not authorized to view pending event submissions.');
          return;
        }
        if (res.status === 401) {
          this.markNotAuthorized('Your session is not authorized. Please sign in again.');
          return;
        }
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || `Failed to load pending events (status ${res.status})`);
        }

        const list = await res.json();
        if (!Array.isArray(list)) throw new Error('Unexpected response format from /event-submissions');

        this.pendingEvents = list
          .filter((sub) => sub.state === 'pending')
          .map((sub) => ({
            id: sub.id,
            name: sub.submissionData?.name || '',
            description: sub.submissionData?.description || '',
            startDatetime: sub.submissionData?.start_datetime,
            endDatetime: sub.submissionData?.end_datetime,
            location: sub.submissionData?.location,
            capacity: sub.submissionData?.capacity,
            isFree: sub.submissionData?.is_free,
            visibility: sub.submissionData?.visibility,
            coverImageUrl: sub.submissionData?.cover_image_url,
            merchantName: sub.merchantName,
            merchantId: sub.merchantId,
            submittedAt: sub.submittedAt,
            updatedAt: sub.updatedAt,
          }));
      } catch (err) {
        if (!this.notAuthorized) {
          console.error('[FoodieGroupDashboard] loadPendingEvents failed', err);
          this.pendingEventsError = err.message || 'Could not load pending event submissions.';
          this.pendingEvents = [];
        }
      } finally {
        this.pendingEventsLoading = false;
      }
    },

    async loadActiveEvents() {
      if (!this.groupId) return;

      this.activeEventsLoading = true;
      this.activeEventsError = null;
      try {
        const res = await fetch(
          `${API_BASE}/events?group_id=${encodeURIComponent(this.groupId)}`,
        );

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || `Failed to load active events (status ${res.status})`);
        }

        const list = await res.json();
        if (!Array.isArray(list)) throw new Error('Unexpected response format from /events');

        this.activeEvents = list.map((e) => ({
          id: e.id,
          name: e.name,
          description: e.description,
          startDatetime: e.startDatetime,
          endDatetime: e.endDatetime,
          location: e.location,
          capacity: e.capacity,
          visibility: e.visibility,
          merchantName: e.merchantName,
          confirmedCount: e.confirmedCount,
        }));
      } catch (err) {
        console.error('[FoodieGroupDashboard] loadActiveEvents failed', err);
        this.activeEventsError = err.message || 'Could not load active events.';
        this.activeEvents = [];
      } finally {
        this.activeEventsLoading = false;
      }
    },

    async loadEventOverview() {
      if (this.notAuthorized || !this.groupId) return;

      this.eventOverviewLoading = true;
      this.eventOverviewError = null;
      try {
        const token = await getAccessToken();
        const res = await fetch(
          `${API_BASE}/groups/${this.groupId}/event-overview`,
          { headers: { Authorization: `Bearer ${token}` } },
        );

        if (res.status === 403 || res.status === 401) {
          const body = await res.json().catch(() => ({}));
          this.markNotAuthorized(body.error || 'Not authorized');
          return;
        }
        if (!res.ok) throw new Error(`Failed to load event overview: ${res.status}`);

        const data = await res.json();
        this.eventOverview = {
          rsvpsLast30Days: Number(data.rsvpsLast30Days || 0),
          topEvent: data.topEvent || null,
          upcomingPublishedEvents: Number(data.upcomingPublishedEvents || 0),
        };
      } catch (err) {
        console.error('[FoodieGroupDashboard] loadEventOverview error', err);
        this.eventOverviewError = err.message || 'Could not load event overview';
        this.eventOverview = { rsvpsLast30Days: 0, topEvent: null, upcomingPublishedEvents: 0 };
      } finally {
        this.eventOverviewLoading = false;
      }
    },

    openEventReviewModal(evt) {
      this.reviewModalEvent = evt;
    },
    closeEventReviewModal() {
      this.reviewModalEvent = null;
    },

    async approveEvent(evt) {
      if (this.notAuthorized) return;

      try {
        const token = await getAccessToken();

        const before = this.pendingEvents.slice();
        this.pendingEvents = this.pendingEvents.filter((e) => e.id !== evt.id);

        const res = await fetch(`${API_BASE}/event-submissions/${evt.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ state: 'approved' }),
        });

        if (res.status === 403) {
          const body = await res.json().catch(() => ({}));
          this.markNotAuthorized(body.error || 'Not authorized to approve event submissions.');
          this.pendingEvents = before;
          return;
        }
        if (res.status === 401) {
          this.markNotAuthorized('Session expired. Please sign in again.');
          this.pendingEvents = before;
          return;
        }
        if (!res.ok) {
          console.error('Approve event failed:', res.status, await res.text());
          this.pendingEvents = before;
          return;
        }

        await Promise.all([this.loadEventOverview(), this.loadActiveEvents()]);
      } catch (err) {
        if (!this.notAuthorized) {
          console.error('[FoodieGroupDashboard] approveEvent error', err);
          await Promise.all([this.loadPendingEvents(), this.loadActiveEvents()]);
        }
      }
    },

    async rejectEvent(evt) {
      if (this.notAuthorized) return;

      const reason = window.prompt('Please enter a brief reason for rejection:', '');
      if (reason === null) return;

      try {
        const token = await getAccessToken();

        const before = this.pendingEvents.slice();
        this.pendingEvents = this.pendingEvents.filter((e) => e.id !== evt.id);

        const res = await fetch(`${API_BASE}/event-submissions/${evt.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ state: 'rejected', rejection_message: reason }),
        });

        if (res.status === 403) {
          const body = await res.json().catch(() => ({}));
          this.markNotAuthorized(body.error || 'Not authorized to reject event submissions.');
          this.pendingEvents = before;
          return;
        }
        if (res.status === 401) {
          this.markNotAuthorized('Session expired. Please sign in again.');
          this.pendingEvents = before;
          return;
        }
        if (!res.ok) {
          console.error('Reject event failed:', res.status, await res.text());
          this.pendingEvents = before;
        }
      } catch (err) {
        if (!this.notAuthorized) {
          console.error('[FoodieGroupDashboard] rejectEvent error', err);
          await this.loadPendingEvents();
        }
      }
    },

    openReviewModal(coupon) {
      this.reviewModalCoupon = coupon;
    },

    closeReviewModal() {
      this.reviewModalCoupon = null;
    },

    // Approve a pending submission
    async approveCoupon(coupon) {
      if (this.notAuthorized) return;

      try {
        const token = await getAccessToken();

        // Optimistically remove from pending
        const before = this.pendingCoupons.slice();
        this.pendingCoupons = this.pendingCoupons.filter(
          (c) => c.id !== coupon.id
        );
        this.stats.pendingSubmissions = this.pendingCoupons.length;

        const res = await fetch(
          `${API_BASE}/coupon-submissions/${coupon.id}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ state: "approved" }),
          }
        );

        if (res.status === 403) {
          const body = await res.json().catch(() => ({}));
          this.markNotAuthorized(
            body.error ||
              "You are not authorized to approve submissions for this Foodie Group."
          );
          this.pendingCoupons = before;
          this.stats.pendingSubmissions = before.length;
          return;
        }

        if (res.status === 401) {
          this.markNotAuthorized(
            "Your session is not authorized for this Foodie Group. Please sign in again."
          );
          this.pendingCoupons = before;
          this.stats.pendingSubmissions = before.length;
          return;
        }

        if (!res.ok) {
          console.error("Approve failed:", res.status, await res.text());
          this.pendingCoupons = before;
          this.stats.pendingSubmissions = before.length;
          return;
        }

        const newCoupon = await res.json();

        this.activeCoupons.push({
          id: newCoupon.id,
          title: newCoupon.title,
          description: newCoupon.description,
          couponType: newCoupon.couponType || newCoupon.coupon_type,
          discountValue: newCoupon.discountValue ?? newCoupon.discount_value,
          validFrom: newCoupon.validFrom || newCoupon.valid_from,
          expiresAt: newCoupon.expiresAt || newCoupon.expires_at,
          merchantName: newCoupon.merchant_name || coupon.merchantName,
          redemptions: newCoupon.redemptions || 0,
        });

        this.activeCoupons = this.activeCoupons.filter(
          (activeCoupon) => !this.isExpiredCoupon(activeCoupon.expiresAt)
        );
        this.stats.totalCoupons = this.activeCoupons.length;
      } catch (err) {
        if (!this.notAuthorized) {
          console.error("[FoodieGroupDashboard] approveCoupon error", err);
          await this.loadPendingCoupons();
          await this.loadActiveCoupons();
        }
      }
    },

    // Reject a pending submission (with a reason)
    async rejectCoupon(coupon) {
      if (this.notAuthorized) return;

      const reason = window.prompt(
        "Please enter a brief reason for rejection:",
        ""
      );
      if (reason === null) {
        return;
      }

      try {
        const token = await getAccessToken();

        const before = this.pendingCoupons.slice();
        // Optimistically remove
        this.pendingCoupons = this.pendingCoupons.filter(
          (c) => c.id !== coupon.id
        );
        this.stats.pendingSubmissions = this.pendingCoupons.length;

        const res = await fetch(
          `${API_BASE}/coupon-submissions/${coupon.id}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              state: "rejected",
              message: reason,
            }),
          }
        );

        if (res.status === 403) {
          const body = await res.json().catch(() => ({}));
          this.markNotAuthorized(
            body.error ||
              "You are not authorized to reject submissions for this Foodie Group."
          );
          this.pendingCoupons = before;
          this.stats.pendingSubmissions = before.length;
          return;
        }

        if (res.status === 401) {
          this.markNotAuthorized(
            "Your session is not authorized for this Foodie Group. Please sign in again."
          );
          this.pendingCoupons = before;
          this.stats.pendingSubmissions = before.length;
          return;
        }

        if (!res.ok) {
          console.error("Failed to reject:", res.status, await res.text());
          this.pendingCoupons = before;
          this.stats.pendingSubmissions = before.length;
        } else {
          await this.loadActiveCoupons();
        }
      } catch (err) {
        if (!this.notAuthorized) {
          console.error("[FoodieGroupDashboard] rejectCoupon error", err);
          await this.loadPendingCoupons();
          await this.loadActiveCoupons();
        }
      }
    },

    // Format ISO date to locale string
    formatDate(s) {
      if (!s) return "—";
      const d = new Date(s);
      if (Number.isNaN(d.getTime())) return "—";
      return d.toLocaleDateString();
    },

    isExpiredCoupon(expiresAt) {
      if (!expiresAt) return false;
      const expirationDate = new Date(expiresAt);
      if (Number.isNaN(expirationDate.getTime())) return false;
      return expirationDate.getTime() <= Date.now();
    },

    // Format currency from cents
    formatCurrency(cents) {
      return `$${(cents / 100).toFixed(2)}`;
    },

    // Get status badge class
    getStatusClass(status) {
      switch (status) {
        case 'paid': return 'success';
        case 'pending': return 'warning';
        case 'refunded': return 'info';
        default: return '';
      }
    },

    // Scroll to a section by ID
    scrollToSection(sectionId) {
      const element = document.getElementById(sectionId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },

    // Save group details to backend
    async saveGroupDetails() {
      if (!this.groupId) return;

      try {
        const token = await getAccessToken();
        if (!token) {
          this.markNotAuthorized(
            "You must be signed in to update group details."
          );
          return;
        }

        const payload = {
          name: this.group.name,
          description: this.group.description,
          location: this.group.location || null,
          bannerImageUrl: this.group.bannerImage || null,
          socialLinks: {
            facebook: this.group.socialMedia.facebook || null,
            instagram: this.group.socialMedia.instagram || null,
            twitter: this.group.socialMedia.twitter || null,
          },
        };

        const res = await fetch(`${API_BASE}/groups/${this.groupId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        if (res.status === 403) {
          const body = await res.json().catch(() => ({}));
          this.markNotAuthorized(
            body.error || "You are not authorized to update this Foodie Group."
          );
          return;
        }

        if (res.status === 401) {
          this.markNotAuthorized(
            "Your session is not authorized for this Foodie Group. Please sign in again."
          );
          return;
        }

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const msg =
            body.error ||
            `Failed to save Foodie Group details (status ${res.status})`;
          throw new Error(msg);
        }

        // Re-sync from server in case backend normalized anything
        await this.loadGroupDetails();
        alert("Group details saved successfully.");
      } catch (err) {
        console.error("[FoodieGroupDashboard] saveGroupDetails error", err);
        alert(
          err.message ||
            "Something went wrong while saving your Foodie Group details."
        );
      }
    },

    // Fetch current price for this group, including billing model and cadence
    async fetchCurrentPrice() {
      if (!this.groupId) return;

      try {
        const res = await fetch(`${API_BASE}/groups/${this.groupId}/price`);
        if (!res.ok) {
          console.warn("[FoodieGroupDashboard] fetchCurrentPrice failed", res.status);
          return;
        }

        const data = await res.json();
        this.currentPriceDisplay = data.display || '$9.99';
        this.priceIsDefault = data.isDefault === true;
        this.newPriceDollars = data.amountCents ? data.amountCents / 100 : 9.99;
        this.billingModel = data.billingModel || 'one_time';
        this.billingInterval = data.billingInterval || null;
        this.billingIntervalCount = data.billingIntervalCount || null;
        this.stripeRecurringPriceId = data.stripeRecurringPriceId || null;
      } catch (err) {
        console.error("[FoodieGroupDashboard] fetchCurrentPrice error", err);
      }
    },

    // Start editing price — seed the editor state from the last-loaded values
    startEditPrice() {
      this.editingPrice = true;
      this.priceError = null;
      this.newBillingModel = this.billingModel || 'one_time';
      this.newCadenceKey = this.cadenceKeyFromInterval(
        this.billingInterval,
        this.billingIntervalCount
      );
    },

    // Map a (interval, count) pair to the UI's cadence key (monthly|semiannual|annual)
    cadenceKeyFromInterval(interval, count) {
      if (interval === 'year' && count === 1) return 'annual';
      if (interval === 'month' && count === 12) return 'annual';
      if (interval === 'month' && count === 6) return 'semiannual';
      return 'monthly';
    },

    // Map the UI cadence key back to (interval, count) for the PUT body
    intervalFromCadenceKey(key) {
      if (key === 'annual') return { interval: 'year', count: 1 };
      if (key === 'semiannual') return { interval: 'month', count: 6 };
      return { interval: 'month', count: 1 };
    },

    // Cancel editing price
    cancelEditPrice() {
      this.editingPrice = false;
      this.priceError = null;
      // Reset to current price
      this.fetchCurrentPrice();
    },

    // Save new price
    async savePrice() {
      if (!this.groupId) return;
      
      this.savingPrice = true;
      this.priceError = null;

      try {
        const token = await getAccessToken();
        if (!token) {
          this.priceError = "Please sign in to update pricing.";
          return;
        }

        // Validate price
        if (!this.newPriceDollars || this.newPriceDollars < 0.50 || this.newPriceDollars > 999.99) {
          this.priceError = "Price must be between $0.50 and $999.99";
          return;
        }

        const amountCents = Math.round(this.newPriceDollars * 100);

        // Assemble the payload. For subscription groups we must also send the
        // billing cadence fields so the backend can create a recurring Stripe
        // price; one-time groups keep the existing payload shape.
        const payload = {
          amountCents,
          currency: "usd",
          billing_model: this.newBillingModel,
        };
        if (this.newBillingModel === 'subscription') {
          const { interval, count } = this.intervalFromCadenceKey(this.newCadenceKey);
          payload.billing_interval = interval;
          payload.billing_interval_count = count;
        }

        const res = await fetch(`${API_BASE}/groups/${this.groupId}/price`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        if (res.status === 403) {
          const body = await res.json().catch(() => ({}));
          this.priceError = body.error || "You are not authorized to update pricing.";
          return;
        }

        if (res.status === 401) {
          this.priceError = "Session expired. Please sign in again.";
          return;
        }

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          this.priceError = body.error || `Failed to update price (status ${res.status})`;
          return;
        }

        const data = await res.json();
        this.currentPriceDisplay = data.display;
        this.priceIsDefault = false;
        this.editingPrice = false;
        this.billingModel = data.billingModel || this.newBillingModel;
        this.billingInterval = data.billingInterval || null;
        this.billingIntervalCount = data.billingIntervalCount || null;
        this.stripeRecurringPriceId = data.stripeRecurringPriceId || null;

        alert("Price updated successfully!");
      } catch (err) {
        console.error("[FoodieGroupDashboard] savePrice error", err);
        this.priceError = err.message || "Failed to update price.";
      } finally {
        this.savingPrice = false;
      }
    },

    // ─── Multi-tier subscription pricing ──────────────────────────────────
    // These methods drive the new tier list editor that replaces the single
    // price form for subscription groups. They round-trip through the
    // `/groups/:id/prices` CRUD endpoints via subscriptionService.
    formatCadence(interval, count) {
      if (!interval || !count) return '—';
      if (interval === 'month' && count === 1) return 'Monthly';
      if (interval === 'month' && count === 6) return 'Every 6 months';
      if (interval === 'month' && count === 12) return 'Annually';
      if (interval === 'year' && count === 1) return 'Annually';
      return `Every ${count} ${interval}${count > 1 ? 's' : ''}`;
    },

    async loadTiers() {
      if (!this.groupId) return;
      this.tiersLoading = true;
      this.tiersError = null;
      try {
        // Admins see drafts so they can review/publish the seeded suggestions.
        const data = await listGroupPricesApi(this.groupId, { includeDrafts: true });
        this.tiers = Array.isArray(data?.tiers) ? data.tiers : [];
      } catch (err) {
        console.error('[FoodieGroupDashboard] loadTiers error', err);
        this.tiersError = err?.response?.data?.error || 'Failed to load tiers.';
      } finally {
        this.tiersLoading = false;
      }
    },

    startAddTier() {
      this.addingTier = true;
      this.newTierError = null;
      this.newTier = {
        label: '',
        priceDollars: 9.99,
        cadenceKey: 'monthly',
        status: 'active',
        isDefault: false,
      };
    },

    cancelAddTier() {
      this.addingTier = false;
      this.newTierError = null;
    },

    async submitNewTier() {
      this.newTierError = null;
      const dollars = Number(this.newTier.priceDollars);
      if (!dollars || dollars < 0.5 || dollars > 999.99) {
        this.newTierError = 'Price must be between $0.50 and $999.99.';
        return;
      }
      const { interval, count } = this.intervalFromCadenceKey(this.newTier.cadenceKey);
      this.savingTier = true;
      try {
        await createTierApi(this.groupId, {
          label: this.newTier.label || null,
          amountCents: Math.round(dollars * 100),
          currency: 'usd',
          billingInterval: interval,
          billingIntervalCount: count,
          status: this.newTier.status,
          isDefault: this.newTier.status === 'active' && !!this.newTier.isDefault,
        });
        this.addingTier = false;
        await this.loadTiers();
        // Keep the read-only summary in sync if the new tier became default.
        await this.fetchCurrentPrice();
      } catch (err) {
        console.error('[FoodieGroupDashboard] submitNewTier error', err);
        this.newTierError = err?.response?.data?.error || 'Failed to create tier.';
      } finally {
        this.savingTier = false;
      }
    },

    async onPublishTier(tier) {
      this.tierBusyId = tier.id;
      try {
        await updateTierApi(this.groupId, tier.id, { status: 'active' });
        await this.loadTiers();
      } catch (err) {
        console.error('[FoodieGroupDashboard] onPublishTier error', err);
        this.tiersError = err?.response?.data?.error || 'Failed to publish tier.';
      } finally {
        this.tierBusyId = null;
      }
    },

    async onArchiveTier(tier) {
      if (!confirm(`Archive "${tier.label || tier.display}"? Existing subscribers on this tier will keep renewing in Stripe.`)) return;
      this.tierBusyId = tier.id;
      try {
        await archiveTierApi(this.groupId, tier.id);
        await this.loadTiers();
        await this.fetchCurrentPrice();
      } catch (err) {
        console.error('[FoodieGroupDashboard] onArchiveTier error', err);
        this.tiersError = err?.response?.data?.error || 'Failed to archive tier.';
      } finally {
        this.tierBusyId = null;
      }
    },

    async onSetDefault(tier) {
      this.tierBusyId = tier.id;
      try {
        await updateTierApi(this.groupId, tier.id, { isDefault: true });
        await this.loadTiers();
        await this.fetchCurrentPrice();
      } catch (err) {
        console.error('[FoodieGroupDashboard] onSetDefault error', err);
        this.tiersError = err?.response?.data?.error || 'Failed to set default tier.';
      } finally {
        this.tierBusyId = null;
      }
    },

    async onTierLabelChange(tier, newLabel) {
      const trimmed = (newLabel || '').trim();
      if (trimmed === (tier.label || '')) return;
      this.tierBusyId = tier.id;
      try {
        await updateTierApi(this.groupId, tier.id, { label: trimmed || null });
        await this.loadTiers();
      } catch (err) {
        console.error('[FoodieGroupDashboard] onTierLabelChange error', err);
        this.tiersError = err?.response?.data?.error || 'Failed to update tier label.';
      } finally {
        this.tierBusyId = null;
      }
    },

    formatPercent(value) {
      if (value === null || value === undefined) return '—';
      return `${Math.round(Number(value) * 100)}%`;
    },

    async loadManagedEvents() {
      if (this.notAuthorized || !this.groupId) return;
      try {
        this.managedEvents = await listEvents({ group_id: this.groupId });
        if (!this.selectedEventId && this.managedEvents.length > 0) {
          this.selectedEventId = this.managedEvents[0].id;
          await this.loadSelectedEventData();
        } else if (this.selectedEventId) {
          const stillExists = this.managedEvents.some((evt) => evt.id === this.selectedEventId);
          if (!stillExists) {
            this.selectedEventId = '';
            this.selectedEventStats = null;
          }
        }
      } catch (err) {
        console.error('[FoodieGroupDashboard] loadManagedEvents error', err);
      }
    },

    async onSelectedEventChange() {
      await this.loadSelectedEventData();
    },

    async loadSelectedEventData() {
      if (!this.selectedEventId) {
        this.selectedEventStats = null;
        this.selectedEventAttendees = [];
        return;
      }
      this.attendeesLoading = true;
      this.attendeesError = null;
      try {
        const [stats, attendees] = await Promise.all([
          getEventStats(this.selectedEventId),
          getAttendees(this.selectedEventId),
        ]);
        this.selectedEventStats = stats;
        this.selectedEventAttendees = Array.isArray(attendees) ? attendees : [];
      } catch (err) {
        console.error('[FoodieGroupDashboard] loadSelectedEventData error', err);
        this.attendeesError = err.message || 'Could not load event stats.';
        this.selectedEventAttendees = [];
      } finally {
        this.attendeesLoading = false;
      }
    },

    attendeeStatusLabel(status) {
      const map = {
        going: 'Confirmed',
        checked_in: 'Checked in',
        waitlist: 'Waitlist',
        cancelled: 'Cancelled',
        no_show: 'No-show',
      };
      return map[status] || status;
    },

  },
};
</script>

<style scoped>
.foodie-group-dashboard {
  padding: var(--spacing-2xl);
  max-width: var(--container-xl);
  margin: 0 auto;
}

.attendee-list {
  margin-top: var(--spacing-xl);
}

.attendee-list h3 {
  margin: 0 0 var(--spacing-md);
}

.attendee-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-sm);
}

.attendee-table th,
.attendee-table td {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
}

.attendee-table th {
  color: var(--color-text-muted);
  font-weight: 600;
}

.attendee-table .num {
  text-align: right;
  width: 70px;
}

.attendee-cancelled td {
  color: var(--color-text-muted);
  text-decoration: line-through;
}

.attendee-cancelled .status-pill {
  text-decoration: none;
}

.status-pill {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;
}

.status-going      { background: #e7f6ef; color: #14674b; }
.status-checked_in { background: #e3edfd; color: #1d4f9c; }
.status-waitlist   { background: #fdf3e0; color: #8a6217; }
.status-cancelled  { background: #fdeaea; color: #8f1d1d; text-decoration: none; }
.status-no_show    { background: #efefef; color: #555; }

@media (max-width: 768px) {
  .foodie-group-dashboard {
    padding: var(--spacing-lg);
  }
}

.user-context {
  padding: var(--spacing-md) var(--spacing-lg);
  border-radius: var(--radius-full);
  background: var(--surface-2);
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--spacing-xs);
  font-size: var(--font-size-sm);
}

.group-selector {
  margin-top: var(--spacing-md);
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-sm);
  background: var(--color-bg-muted);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-full);
}

.group-selector label {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.group-selector select {
  background: var(--color-bg-primary);
  border: none;
  border-radius: var(--radius-md);
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: var(--font-size-sm);
}

.user-name {
  font-weight: var(--font-weight-semibold);
}

.role-pill {
  font-size: var(--font-size-xs);
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-full);
  background: var(--color-primary);
  color: var(--color-text-on-primary);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wider);
}

.section-card {
  background: var(--color-bg-primary);
  padding: var(--spacing-xl);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
  margin-bottom: var(--spacing-xl);
}

.dashboard-section {
  background: var(--color-bg-muted);
  padding: var(--spacing-lg);
  border-radius: var(--radius-lg);
  margin-bottom: var(--spacing-xl);
  box-shadow: var(--shadow-xs);
}

.edit-group form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.form-group {
  display: flex;
  flex-direction: column;
}

label {
  font-weight: var(--font-weight-semibold);
  margin-bottom: var(--spacing-sm);
  color: var(--color-text-primary);
}

input,
textarea {
  padding: var(--spacing-sm);
  border: none;
  border-radius: var(--radius-md);
  font-size: var(--font-size-base);
  font-family: var(--font-family-base);
  box-shadow: var(--shadow-xs);
  transition: box-shadow var(--transition-fast);
}

.edit-group input,
.edit-group textarea {
  background: var(--color-bg-surface);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.12);
  color: var(--color-text-primary);
}

.edit-group input:focus,
.edit-group textarea:focus {
  outline: none;
  background: var(--color-bg-surface);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15), 0 2px 6px rgba(0, 0, 0, 0.2), 0 0 0 3px rgba(242, 84, 45, 0.2);
}

input:focus,
textarea:focus {
  outline: none;
  box-shadow: 0 0 0 3px rgba(56, 66, 76, 0.1), var(--shadow-xs);
}

.submissions-board {
  display: flex;
  flex-direction: row;
  gap: var(--spacing-2xl);
  flex-wrap: wrap;
}

@media (max-width: 768px) {
  .submissions-board {
    gap: var(--spacing-lg);
  }
}

.kanban-column {
  flex: 1;
  min-width: 300px;
  background: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
  max-height: 500px;
  overflow-y: auto;
  box-shadow: var(--shadow-sm);
}

@media (max-width: 768px) {
  .kanban-column {
    min-width: 100%;
  }
}

.column-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.card {
  background: var(--color-bg-primary);
  padding: var(--spacing-md);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  box-shadow: var(--shadow-xs);
}

.card h3,
.card p {
  color: var(--color-text-primary);
}

.card ul {
  padding-left: var(--spacing-lg);
  margin: 0;
}

.card li {
  margin-bottom: var(--spacing-md);
  padding-left: var(--spacing-xs);
}

.card li:last-child {
  margin-bottom: 0;
}

.action-buttons {
  margin-top: var(--spacing-sm);
  display: flex;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}

.action-buttons button {
  padding: var(--spacing-sm) var(--spacing-lg);
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: var(--font-size-sm);
  transition: all var(--transition-base);
  min-height: var(--button-height-md);
}

.action-buttons button:first-child {
  background: var(--color-success);
  color: var(--color-text-on-success);
}

.action-buttons button:first-child:hover {
  background: var(--color-success-hover);
  color: var(--color-text-on-success);
}

.action-buttons button:last-child {
  background: var(--color-error);
  color: var(--color-text-on-error);
}

.action-buttons button:last-child:hover {
  background: var(--color-error-hover);
  color: var(--color-text-on-error);
}

.signin-card,
.access-check-card,
.access-denied-card {
  text-align: center;
  max-width: 500px;
  margin: var(--spacing-3xl) auto;
  padding: var(--spacing-xl);
}

.subtitle {
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-lg);
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

.muted {
  color: var(--color-text-muted);
}

.tiny {
  font-size: var(--font-size-xs);
}

.error-text {
  color: var(--color-error);
}

/* Pricing Section */
.pricing-section {
  background: var(--color-bg-primary);
}

.current-price {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--spacing-sm);
}

.current-price p {
  margin: 0;
}

.current-price strong {
  font-size: var(--font-size-xl);
  color: var(--color-primary);
}

.btn-edit-price {
  margin-top: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-lg);
  background: var(--color-secondary);
  color: var(--color-text-inverse);
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: var(--font-size-sm);
  transition: background var(--transition-base);
  min-height: var(--button-height-sm);
}

.btn-edit-price:hover {
  background: var(--color-secondary-hover);
}

.price-form {
  max-width: 400px;
}

.price-input-wrapper {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.currency-symbol {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-secondary);
}

.price-input-wrapper input {
  flex: 1;
  max-width: 150px;
}

.help-text {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  margin: var(--spacing-sm) 0;
}

.price-form-actions {
  display: flex;
  gap: var(--spacing-md);
  margin-top: var(--spacing-md);
}

.price-form-actions .btn {
  padding: var(--spacing-sm) var(--spacing-xl);
}

.price-form-actions .btn.secondary {
  background: var(--color-bg-muted);
  color: var(--color-text-primary);
}

.price-form-actions .btn.secondary:hover:not(:disabled) {
  background: var(--color-bg-subtle);
}

.price-form-actions .btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.billing-model-options {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  margin-top: var(--spacing-xs);
}

.billing-model-options .radio-option {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-sm);
  cursor: pointer;
}

.warning-text {
  color: var(--color-warning, #c77700);
}

/* Tier list editor (multi-tier subscription pricing) */
.tier-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: var(--spacing-md);
  background: var(--surface-1);
  border-radius: var(--radius-md);
  overflow: hidden;
  box-shadow: var(--shadow-xs);
}

.tier-table th,
.tier-table td {
  padding: var(--spacing-sm) var(--spacing-md);
  text-align: left;
  border-bottom: 1px solid var(--border-subtle);
  font-size: var(--font-size-sm);
  vertical-align: middle;
}

.tier-table th {
  background: var(--surface-2);
  color: var(--color-text-secondary);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: var(--font-size-xs);
}

.tier-table tr.tier-draft {
  background: var(--color-bg-muted);
}

.tier-label-input {
  width: 100%;
  min-width: 120px;
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: var(--font-size-sm);
}

.tier-badge {
  display: inline-block;
  padding: 0.15rem 0.55rem;
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.tier-badge-active {
  background: var(--clr-success-a20);
  color: var(--clr-success-a0);
}

.tier-badge-draft {
  background: var(--clr-warning-a20);
  color: var(--clr-warning-a0);
}

.tier-badge-archived {
  background: var(--color-bg-muted);
  color: var(--color-text-muted);
}

.tier-default-toggle {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--color-text-muted);
  font-size: var(--font-size-lg);
  padding: var(--spacing-xs);
  transition: color var(--transition-fast), transform var(--transition-fast);
}

.tier-default-toggle:not(:disabled):hover {
  color: var(--color-primary);
  transform: scale(1.1);
}

.tier-default-toggle.is-default {
  color: var(--color-primary);
  cursor: default;
}

.tier-actions-col {
  text-align: right;
}

.tier-actions {
  display: flex;
  gap: var(--spacing-xs);
  justify-content: flex-end;
}

.btn-sm {
  padding: var(--spacing-xs) var(--spacing-md);
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  min-height: var(--button-height-sm);
}

.btn-primary-sm {
  background: var(--color-primary);
  color: var(--color-text-on-primary);
}

.btn-primary-sm:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.btn-danger-sm {
  background: var(--clr-danger-a20);
  color: var(--clr-danger-a0);
}

.btn-danger-sm:hover:not(:disabled) {
  background: var(--clr-danger-a10);
  color: var(--clr-text-on-danger-a10);
}

.btn-sm:disabled {
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
}

.tier-add {
  margin-top: var(--spacing-lg);
}

.tier-add-form {
  margin-top: var(--spacing-md);
  max-width: 720px;
}

.tier-add-form h4 {
  margin: 0 0 var(--spacing-md);
  font-size: var(--font-size-lg);
}

.tier-add-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-md);
}

/* Group Overview Section */
.group-overview {
  background: var(--color-bg-primary);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--spacing-lg);
  margin-bottom: var(--spacing-xl);
}

.stat-card {
  background: var(--color-bg-muted);
  padding: var(--spacing-lg);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  box-shadow: var(--shadow-xs);
}

.stat-card.wide {
  grid-column: span 2;
}

@media (max-width: 768px) {
  .stat-card.wide {
    grid-column: span 1;
  }
}

.stat-label {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  font-weight: var(--font-weight-medium);
}

.stat-value {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
}

.stat-value.highlight-success {
  color: var(--color-success);
}

.stat-value.highlight-warning {
  color: var(--color-warning);
}

.stat-card.clickable {
  cursor: pointer;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
}

.stat-card.clickable:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.stat-hint {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  margin-top: var(--spacing-xs);
}

.stat-details {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-top: var(--spacing-xs);
}

.stat-detail {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.data-table-container {
  overflow-x: auto;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-xs);
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  background: var(--color-bg-primary);
}

.data-table thead {
  background: var(--color-bg-muted);
}

.data-table th {
  padding: var(--spacing-md);
  text-align: left;
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  border-bottom: 2px solid var(--color-border);
}

.data-table td {
  padding: var(--spacing-md);
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text-primary);
}

.data-table tbody tr:hover {
  background: var(--color-bg-hover);
}

.status-badge {
  display: inline-block;
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.status-badge.success {
  background: var(--color-success-bg);
  color: var(--color-success);
}

.status-badge.warning {
  background: var(--color-warning-bg);
  color: var(--color-warning);
}

.status-badge.info {
  background: var(--color-info-bg);
  color: var(--color-info);
}

.empty-state {
  text-align: center;
  color: var(--color-text-muted);
  font-style: italic;
  padding: var(--spacing-xl);
}

.loading-state {
  text-align: center;
  color: var(--color-text-muted);
  padding: var(--spacing-xl);
}

.error-state {
  text-align: center;
  color: var(--color-error);
  padding: var(--spacing-xl);
}

.event-manager-controls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--spacing-sm);
  margin: var(--spacing-md) 0;
}

.event-manager-controls select,
.event-manager-controls input {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--spacing-sm);
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
}

.event-stats-grid {
  margin-top: var(--spacing-md);
}

.table-actions {
  display: flex;
  gap: var(--spacing-xs);
  flex-wrap: wrap;
}

.pending-submission-card {
  border-left: 3px solid var(--color-warning, #f0ad4e);
  padding-left: var(--spacing-sm);
}

.pending-card-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}

.badge-type {
  display: inline-block;
  padding: 0.1em 0.5em;
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
}

.pending-card-meta {
  margin-top: 0.25rem;
}

.freshness-hint {
  font-style: italic;
  margin-top: 0.15rem;
}

.btn-review {
  background: var(--color-bg-secondary) !important;
  color: var(--color-text-primary) !important;
}

.btn-review:hover {
  background: var(--color-bg-tertiary, #e2e8f0) !important;
}

/* Review Modal */
.review-modal {
  max-width: 600px;
}

.review-table {
  width: 100%;
  border-collapse: collapse;
}

.review-table th,
.review-table td {
  text-align: left;
  padding: var(--spacing-sm) var(--spacing-md);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.review-table th {
  font-weight: var(--font-weight-semibold);
  white-space: nowrap;
  width: 35%;
  color: var(--color-text-secondary);
}

.review-modal-actions {
  display: flex;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-lg);
  flex-wrap: wrap;
}

.review-modal-actions .btn.danger {
  background: var(--color-error);
  color: var(--color-text-on-error);
}

.review-modal-actions .btn.danger:hover {
  background: var(--color-error-hover);
}
</style>
