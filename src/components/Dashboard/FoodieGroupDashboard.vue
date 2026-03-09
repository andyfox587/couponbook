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
            <span class="stat-label">Pending Submissions</span>
            <span class="stat-value highlight-warning">
              {{ stats.pendingSubmissions || 0 }}
            </span>
            <span class="stat-hint">Click to view</span>
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
            <label for="bannerImage">Banner Image URL:</label>
            <input
              id="bannerImage"
              type="text"
              v-model="group.bannerImage"
              placeholder="Enter banner image URL"
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
        
        <div v-if="!editingPrice" class="current-price">
          <p>Current Price: <strong>{{ currentPriceDisplay }}</strong></p>
          <p v-if="priceIsDefault" class="muted tiny">
            This is the default price. Set a custom price to create a Stripe product.
          </p>
          <button @click="startEditPrice" class="btn-edit-price">
            <i class="pi pi-pencil icon-spacing-sm"></i>Edit Price
          </button>
        </div>
        
        <div v-else class="price-form">
          <div class="form-group">
            <label for="newPrice">New Price (USD):</label>
            <div class="price-input-wrapper">
              <span class="currency-symbol">$</span>
              <input 
                id="newPrice" 
                type="number" 
                v-model.number="newPriceDollars" 
                min="0.50" 
                max="999.99" 
                step="0.01"
                placeholder="9.99"
              />
            </div>
          </div>
          <p class="help-text">
            This will affect new purchases only. Existing purchases remain valid.
          </p>
          <div class="price-form-actions">
            <button @click="savePrice" :disabled="savingPrice" class="btn primary">
              {{ savingPrice ? 'Saving...' : 'Save Price' }}
            </button>
            <button @click="cancelEditPrice" class="btn secondary" :disabled="savingPrice">
              Cancel
            </button>
          </div>
          <p v-if="priceError" class="error-text tiny">{{ priceError }}</p>
        </div>
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
          </div>
        </div>

        <div id="active-coupons" class="kanban-column active">
          <h2>Active Coupons</h2>
          <div class="column-content">
            <div class="active-coupons card">
              <h3>Active Coupons</h3>

              <p v-if="activeLoading" class="muted tiny">
                Loading active coupons…
              </p>
              <p v-if="activeError" class="tiny error-text">
                {{ activeError }}
              </p>

              <ul v-if="!activeLoading && !activeError">
                <li v-for="c in activeCoupons" :key="c.id">
                  <strong>{{ c.description }}</strong><br />
                  Submitted by: {{ c.merchantName }}<br />
                  Redemptions: {{ c.redemptions }}
                </li>
                <li v-if="activeCoupons.length === 0" class="muted tiny">
                  No active coupons for this group yet.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <!-- Review Detail Modal -->
      <Modal v-if="reviewModalCoupon" @close="closeReviewModal">
        <h2>Review Submission</h2>
        <table class="review-table">
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
    </template>
  </div>
</template>

<script>
import { mapGetters } from "vuex";
import { getAccessToken, signIn } from "@/services/authService";
import Modal from "@/components/Common/Modal.vue";

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

      // group overview analytics
      groupOverview: {
        counts: { coupons: 0, purchases: { paid: 0 } },
        revenue: { grossCents: 0 },
        recentPurchases: []
      },
      overviewLoading: false,
      overviewError: null,

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
        this.loadGroupOverview(),
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
          this.loadGroupOverview(),
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

        this.activeCoupons = list.map((c) => ({
          id: c.id,
          description: c.description,
          merchantName: c.merchant_name,
          redemptions: c.redemptions || 0,
        }));
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
          description: newCoupon.description,
          merchantName: newCoupon.merchant_name,
          redemptions: newCoupon.redemptions || 0,
        });

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

    // Fetch current price for this group
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
      } catch (err) {
        console.error("[FoodieGroupDashboard] fetchCurrentPrice error", err);
      }
    },

    // Start editing price
    startEditPrice() {
      this.editingPrice = true;
      this.priceError = null;
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

        const res = await fetch(`${API_BASE}/groups/${this.groupId}/price`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            amountCents,
            currency: "usd",
          }),
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
        
        alert("Price updated successfully!");
      } catch (err) {
        console.error("[FoodieGroupDashboard] savePrice error", err);
        this.priceError = err.message || "Failed to update price.";
      } finally {
        this.savingPrice = false;
      }
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
