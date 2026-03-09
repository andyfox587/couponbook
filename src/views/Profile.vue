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
                </div>
                <div class="muted tiny">
                  Status: {{ p.status }}
                  <span v-if="p.expiresAt">
                    · Expires {{ formatDateMedium(p.expiresAt) }}
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
                  <div>
                    <h3>{{ m.name }}</h3>
                    <p class="muted tiny">
                      Foodie Group ID: {{ m.foodie_group_id || '—' }}
                    </p>
                  </div>
                </div>

                <div class="merchant-card-body">
                  <p>
                    <strong>Website:</strong>
                    <span class="placeholder-text">
                      {{ m.website_url || 'https://example.com' }}
                    </span>
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

            <div v-if="activeToolsView === 'rejected' && !merchantToolsLoading && !rejectedCoupons.length"
              class="muted tiny" style="margin-top: 0.5rem;">
              No rejected coupon submissions found for your restaurants.
            </div>

            <div v-if="activeToolsView === 'insights' && !merchantToolsLoading && !redemptionInsights.length"
              class="muted tiny" style="margin-top: 0.5rem;">
              No redemptions recorded yet for coupons from your restaurants.
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
                    <div>
                      <h3>{{ m.name }}</h3>
                      <p class="muted tiny">
                        Foodie Group ID: {{ m.foodie_group_id || '—' }}
                      </p>
                    </div>
                  </div>

                  <div class="merchant-card-body">
                    <p>
                      <strong>Website:</strong>
                      <span class="placeholder-text">
                        {{ m.website_url || 'https://example.com' }}
                      </span>
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
</template>

<script>
import { mapGetters } from "vuex";
import { getAccessToken, signOut, signIn } from "@/services/authService";

export default {
  name: "UserProfile",

  data() {
    return {
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
      adminMemberships: [],
      adminMembershipsLoading: false,

      // logo upload state
      uploadingLogoId: null,
      logoUploadError: null,
      uploadErrorMerchantId: null,

      // merchant tools state
      approvedCoupons: [],
      rejectedCoupons: [],
      redemptionInsights: [],
      selectedCouponId: null,
      redemptionDetails: [],
      uniqueEmailsOnly: false,
      detailsLoading: false,
      detailsError: null,
      exportingDetails: false,
      merchantToolsLoading: false,
      merchantToolsError: null,
      activeToolsView: null, // 'approved' | 'rejected' | 'insights'
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

        if (this.role === 'customer') {
          this.loadCustomerStats();
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

    signOutNow() {
      signOut();
    },

    signInNow() {
      signIn();
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
      if (view === 'approved') {
        // keep approved list between clicks if you want; for now we just reload each time
        this.rejectedCoupons = [];
        this.redemptionInsights = [];
      } else if (view === 'rejected') {
        this.approvedCoupons = [];
        this.redemptionInsights = [];
      } else if (view === 'insights') {
        this.approvedCoupons = [];
        this.rejectedCoupons = [];
      } else {
        this.approvedCoupons = [];
        this.rejectedCoupons = [];
        this.redemptionInsights = [];
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

  },
};
</script>

<style scoped>
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
  padding: var(--spacing-md) var(--spacing-lg);
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
  box-shadow: var(--shadow-card);
}

.merchant-card-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-sm);
}

.merchant-card-header h3 {
  margin: 0;
  color: var(--color-text-primary);
}

.merchant-card-body {
  color: var(--color-text-primary);
}

.merchant-card-body p {
  margin: var(--spacing-xs) 0;
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

.error-text {
  color: var(--color-error);
}
</style>
