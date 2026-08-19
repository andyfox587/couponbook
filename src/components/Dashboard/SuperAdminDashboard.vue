<!-- src/components/Dashboard/SuperAdminDashboard.vue -->
<template>
  <div class="super-admin-dashboard">
    <!-- NOT AUTHENTICATED -->
    <section v-if="!isAuthenticated" class="section-card signin-card">
      <h1>Super Admin Dashboard</h1>
      <p class="muted">
        You need to be signed in as a super admin to access this dashboard.
      </p>
      <button class="btn primary" @click="signInNow">
        <i class="pi pi-sign-in icon-spacing-sm"></i>Sign In to Your Account
      </button>
      <p class="muted tiny">
        You'll be redirected to the secure sign-in page and brought back here
        after.
      </p>
    </section>

    <!-- ACCESS CHECK IN PROGRESS -->
    <section v-else-if="!authChecked" class="section-card access-check-card">
      <h1>Super Admin Dashboard</h1>
      <p class="subtitle">Checking your super admin permissions...</p>
    </section>

    <!-- AUTHENTICATED BUT NOT AUTHORIZED -->
    <section v-else-if="notAuthorized" class="section-card access-denied-card">
      <h1>Access Denied</h1>
      <p>{{ notAuthorizedMessage }}</p>
      <button class="btn primary" @click="$router.push('/profile')">
        Back to Profile
      </button>
    </section>

    <!-- AUTHENTICATED + AUTHORIZED DASHBOARD -->
    <template v-else>
      <header class="profile-header">
        <h1>Super Admin Dashboard</h1>
        <p class="subtitle">
          Manage users, merchants, foodie groups, and view platform analytics.
        </p>
        <div class="user-context" v-if="user">
          <h2 class="user-name">{{ user.name || user.email }}</h2>
          <span class="role-pill">super_admin</span>
        </div>
      </header>

      <!-- Tab Navigation -->
      <nav class="tab-nav">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          :class="['tab-btn', { active: activeTab === tab.id }]"
          @click="activeTab = tab.id"
        >
          <i :class="['pi', tab.icon, 'icon-spacing-sm']"></i>
          {{ tab.label }}
        </button>
      </nav>

      <!-- Tab Content -->
      <div class="tab-content">
        <!-- OVERVIEW TAB -->
        <section v-if="activeTab === 'overview'" class="dashboard-section">
          <h2>Platform Overview</h2>
          <div v-if="overviewLoading" class="loading-state">Loading statistics...</div>
          <div v-else-if="overviewError" class="error-state">{{ overviewError }}</div>
          <div v-else class="stats-grid">
            <div class="stat-card clickable" @click="goToTab('users')" title="View all users">
              <span class="stat-label">Total Users</span>
              <span class="stat-value">{{ overview.counts?.users?.total || 0 }}</span>
              <span class="stat-hint">Click to manage</span>
            </div>
            <div class="stat-card clickable" @click="goToTab('merchants')" title="View all merchants">
              <span class="stat-label">Merchants</span>
              <span class="stat-value">{{ overview.counts?.merchants || 0 }}</span>
              <span class="stat-hint">Click to manage</span>
            </div>
            <div class="stat-card clickable" @click="goToTab('groups')" title="View all foodie groups">
              <span class="stat-label">Foodie Groups</span>
              <span class="stat-value">{{ overview.counts?.foodieGroups || 0 }}</span>
              <span class="stat-hint">Click to manage</span>
            </div>
            <div class="stat-card clickable" @click="goToTab('coupons'); couponsTabView = 'approved'" title="View all coupons">
              <span class="stat-label">Coupons</span>
              <span class="stat-value">{{ overview.counts?.coupons || 0 }}</span>
              <span class="stat-hint">Click to view</span>
            </div>
            <div class="stat-card clickable" @click="goToTab('coupons'); couponsTabView = 'pending'" title="Click to view pending submissions">
              <span class="stat-label">Pending Submissions</span>
              <span class="stat-value highlight-warning">{{ overview.counts?.couponSubmissions?.pending || 0 }}</span>
              <span class="stat-hint">Click to view</span>
            </div>
            <div class="stat-card clickable" @click="goToTab('payments')" title="View payment details">
              <span class="stat-label">Paid Purchases</span>
              <span class="stat-value highlight-success">{{ overview.counts?.purchases?.paid || 0 }}</span>
              <span class="stat-hint">Click to view</span>
            </div>
            <div class="stat-card clickable" @click="goToTab('groups')" title="View foodie groups">
              <span class="stat-label">Top Foodie Group (30d)</span>
              <span class="stat-value">{{ redemptionOverview.topGroup?.groupName || 'None yet' }}</span>
              <span class="stat-hint" v-if="redemptionOverview.topGroup">
                {{ redemptionOverview.topGroup.redemptions }} redemption{{ redemptionOverview.topGroup.redemptions === 1 ? '' : 's' }}
              </span>
            </div>
            <div class="stat-card wide">
              <span class="stat-label">Gross Revenue</span>
              <span class="stat-value highlight-success">{{ formatCurrency(overview.revenue?.grossCents || 0) }}</span>
            </div>
            <!--
              Subscription metrics (platform-wide). Render unconditionally so
              super-admins always see the full slate — zero values are valid
              placeholders that indicate "no activity yet" rather than noise.
            -->
            <div class="stat-card">
              <span class="stat-label">Active Subscribers</span>
              <span class="stat-value highlight-success">{{ overview.subscriptions?.activeSubscribers || 0 }}</span>
            </div>
            <div class="stat-card">
              <span class="stat-label">MRR</span>
              <span class="stat-value highlight-success">{{ formatCurrency(overview.subscriptions?.mrrCents || 0) }}</span>
            </div>
            <div class="stat-card">
              <span class="stat-label">Past Due (grace)</span>
              <span
                class="stat-value"
                :class="overview.subscriptions?.pastDueSubscribers > 0 ? 'highlight-warning' : ''"
              >{{ overview.subscriptions?.pastDueSubscribers || 0 }}</span>
            </div>
            <div class="stat-card">
              <span class="stat-label">Canceling at Period End</span>
              <span
                class="stat-value"
                :class="overview.subscriptions?.cancelingSubscribers > 0 ? 'highlight-warning' : ''"
              >{{ overview.subscriptions?.cancelingSubscribers || 0 }}</span>
            </div>
            <div class="stat-card">
              <span class="stat-label">Gifted Access</span>
              <span class="stat-value">{{ overview.subscriptions?.giftedAccess || 0 }}</span>
            </div>
            <div class="stat-card">
              <span class="stat-label">Admin Granted</span>
              <span class="stat-value">{{ overview.subscriptions?.adminGranted || 0 }}</span>
            </div>
            <div class="stat-card clickable" @click="goToTab('coupons')" title="View recent coupon redemptions">
              <span class="stat-label">Platform Redemptions (30d)</span>
              <span class="stat-value highlight-success">{{ redemptionOverview.redemptionsLast30Days || 0 }}</span>
              <span class="stat-hint">Recent coupon activity</span>
            </div>
            <div class="stat-card clickable" @click="goToTab('users')" title="View recent signups">
              <span class="stat-label">Recent Signups (30d)</span>
              <span class="stat-value">{{ overview.trends?.last30Days?.signups || 0 }}</span>
              <span class="stat-hint">Click to view users</span>
            </div>
            <div class="stat-card clickable" @click="goToTab('payments')" title="View recent purchases">
              <span class="stat-label">Recent Purchases (30d)</span>
              <span class="stat-value">{{ overview.trends?.last30Days?.purchases || 0 }}</span>
              <span class="stat-hint">Click to view payments</span>
            </div>
            <div class="stat-card clickable" @click="goToTab('events')" title="View all events">
              <span class="stat-label">Total Events</span>
              <span class="stat-value">{{ overview.counts?.events?.total || 0 }}</span>
              <span class="stat-hint">Click to manage</span>
            </div>
            <div class="stat-card clickable" @click="goToTab('events')" title="View upcoming events">
              <span class="stat-label">Upcoming Events</span>
              <span class="stat-value highlight-success">{{ overview.counts?.events?.upcoming || 0 }}</span>
              <span class="stat-hint">Click to manage</span>
            </div>
            <div class="stat-card clickable" @click="goToTab('events')" title="View recent events">
              <span class="stat-label">Recent Events (30d)</span>
              <span class="stat-value">{{ overview.trends?.last30Days?.events || 0 }}</span>
              <span class="stat-hint">Click to manage</span>
            </div>
          </div>

          <div v-if="redemptionOverviewError" class="error-state">{{ redemptionOverviewError }}</div>

          <div class="health-section" v-if="overview.paymentHealth">
            <h3>Payment Health</h3>
            <div class="health-indicators">
              <div :class="['health-item', { warning: overview.paymentHealth.unprocessedEvents > 0 }]">
                <span class="health-label">Unprocessed Events</span>
                <span class="health-value">{{ overview.paymentHealth.unprocessedEvents }}</span>
              </div>
              <div :class="['health-item', { error: overview.paymentHealth.failedEvents > 0 }]">
                <span class="health-label">Failed Events</span>
                <span class="health-value">{{ overview.paymentHealth.failedEvents }}</span>
              </div>
            </div>
          </div>
        </section>

        <!-- USERS TAB -->
        <section v-if="activeTab === 'users'" class="dashboard-section">
          <h2>User Management</h2>

          <CreateCustomerAccount @created="searchUsers" />

          <div class="search-bar">
            <input
              type="text"
              v-model="userSearch"
              placeholder="Search by email, name, or ID..."
              @keyup.enter="searchUsers"
            />
            <button class="btn primary" @click="searchUsers">Search</button>
            <label class="checkbox-label">
              <input type="checkbox" v-model="includeDeletedUsers" @change="searchUsers" />
              Include disabled
            </label>
          </div>

          <div v-if="usersLoading" class="loading-state">Loading users...</div>
          <div v-else-if="usersError" class="error-state">{{ usersError }}</div>
          <div v-else class="data-table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="u in users" :key="u.id" :class="{ 'row-disabled': u.deletedAt }">
                  <td>{{ u.name }}</td>
                  <td>{{ u.email }}</td>
                  <td>
                    <select
                      :value="u.role"
                      @change="updateUserRole(u, $event.target.value)"
                      :disabled="u.id === user.id"
                      class="role-select"
                    >
                      <option value="customer">customer</option>
                      <option value="merchant">merchant</option>
                      <option value="foodie_group_admin">foodie_group_admin</option>
                      <option value="super_admin">super_admin</option>
                    </select>
                  </td>
                  <td>
                    <span :class="['status-badge', u.deletedAt ? 'disabled' : 'active']">
                      {{ u.deletedAt ? 'Disabled' : 'Active' }}
                    </span>
                  </td>
                  <td class="actions-cell">
                    <button
                      v-if="!u.deletedAt && !u.email.includes('@anonymized')"
                      class="btn-action primary"
                      @click="showGrantAccessModal(u)"
                      title="Grant or revoke group access for this user"
                    >
                      Grant Access
                    </button>
                    <button
                      v-if="!u.deletedAt && u.id !== user.id && u.role !== 'super_admin' && !u.email.includes('@anonymized')"
                      class="btn-action"
                      @click="actAs(u)"
                      title="Log in as this user to help them set up (audited)"
                    >
                      Act as
                    </button>
                    <button
                      v-if="!u.deletedAt && u.id !== user.id"
                      class="btn-action warning"
                      @click="showDisableModal(u)"
                      title="Disable user"
                    >
                      Disable
                    </button>
                    <button
                      v-if="u.deletedAt && !u.email.includes('@anonymized')"
                      class="btn-action success"
                      @click="enableUser(u)"
                      title="Re-enable user"
                    >
                      Enable
                    </button>
                    <button
                      v-if="u.id !== user.id && !u.email.includes('@anonymized')"
                      class="btn-action danger"
                      @click="showAnonymizeModal(u)"
                      title="Anonymize user"
                    >
                      Anonymize
                    </button>
                  </td>
                </tr>
                <tr v-if="users.length === 0">
                  <td colspan="5" class="empty-state">No users found</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- MERCHANTS TAB -->
        <section v-if="activeTab === 'merchants'" class="dashboard-section">
          <h2>Merchant Management</h2>
          
          <div class="section-actions">
            <button class="btn primary" @click="showCreateMerchantModal = true">
              <i class="pi pi-plus icon-spacing-sm"></i>Create Merchant
            </button>
          </div>

          <div class="search-bar">
            <input
              type="text"
              v-model="merchantSearch"
              placeholder="Search merchants..."
              @keyup.enter="searchMerchants"
            />
            <button class="btn primary" @click="searchMerchants">Search</button>
          </div>

          <div v-if="merchantsLoading" class="loading-state">Loading merchants...</div>
          <div v-else-if="merchantsError" class="error-state">{{ merchantsError }}</div>
          <div v-else class="data-table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Owner</th>
                  <th>Admins</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="m in merchants" :key="m.id">
                  <td>{{ m.name }}</td>
                  <td>{{ m.ownerName || m.ownerEmail || 'Unknown' }}</td>
                  <td>{{ m.adminsCount || 0 }}</td>
                  <td>{{ formatDate(m.createdAt) }}</td>
                  <td class="actions-cell">
                    <button class="btn-action" @click="editMerchant(m)">Edit</button>
                  </td>
                </tr>
                <tr v-if="merchants.length === 0">
                  <td colspan="5" class="empty-state">No merchants found</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- GROUPS TAB -->
        <section v-if="activeTab === 'groups'" class="dashboard-section">
          <h2>Foodie Group Management</h2>
          
          <div class="section-actions">
            <button class="btn primary" @click="showCreateGroupModal = true">
              <i class="pi pi-plus icon-spacing-sm"></i>Create Group
            </button>
          </div>

          <div class="search-bar">
            <input
              type="text"
              v-model="groupSearch"
              placeholder="Search groups..."
              @keyup.enter="searchGroups"
            />
            <button class="btn primary" @click="searchGroups">Search</button>
          </div>

          <div v-if="groupsLoading" class="loading-state">Loading groups...</div>
          <div v-else-if="groupsError" class="error-state">{{ groupsError }}</div>
          <div v-else class="data-table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slug</th>
                  <th>Location</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="g in groups" :key="g.id">
                  <td>{{ g.name }}</td>
                  <td><code>{{ g.slug }}</code></td>
                  <td>{{ g.location || '-' }}</td>
                  <td>{{ formatDate(g.createdAt) }}</td>
                  <td class="actions-cell">
                    <button class="btn-action" @click="editGroup(g)">Edit</button>
                    <button class="btn-action" @click="manageGroupAdmins(g)">Admins</button>
                  </td>
                </tr>
                <tr v-if="groups.length === 0">
                  <td colspan="5" class="empty-state">No groups found</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- PAYMENTS TAB -->
        <section v-if="activeTab === 'payments'" class="dashboard-section">
          <h2>Payment Analytics</h2>
          
          <div class="date-filters">
            <div class="form-group inline">
              <label>From:</label>
              <input type="date" v-model="paymentDateFrom" />
            </div>
            <div class="form-group inline">
              <label>To:</label>
              <input type="date" v-model="paymentDateTo" />
            </div>
            <button class="btn primary" @click="loadPaymentsOverview">Apply</button>
          </div>

          <div v-if="paymentsLoading" class="loading-state">Loading payment data...</div>
          <div v-else-if="paymentsError" class="error-state">{{ paymentsError }}</div>
          <div v-else>
            <div class="stats-grid">
              <div class="stat-card">
                <span class="stat-label">Total Purchases</span>
                <span class="stat-value">{{ paymentsOverview.totalPurchases || 0 }}</span>
              </div>
              <div class="stat-card">
                <span class="stat-label">Paid</span>
                <span class="stat-value highlight-success">{{ paymentsOverview.byStatus?.paid || 0 }}</span>
              </div>
              <div class="stat-card">
                <span class="stat-label">Pending</span>
                <span class="stat-value highlight-warning">{{ paymentsOverview.byStatus?.pending || 0 }}</span>
              </div>
              <div class="stat-card">
                <span class="stat-label">Refunded</span>
                <span class="stat-value">{{ paymentsOverview.byStatus?.refunded || 0 }}</span>
              </div>
              <div class="stat-card wide">
                <span class="stat-label">Gross Revenue</span>
                <span class="stat-value highlight-success">{{ formatCurrency(paymentsOverview.grossRevenueCents || 0) }}</span>
              </div>
            </div>

            <div class="health-section">
              <h3>Webhook Health</h3>
              <div class="health-indicators">
                <div :class="['health-item', { warning: paymentsOverview.paymentHealth?.unprocessedEvents > 0 }]">
                  <span class="health-label">Unprocessed</span>
                  <span class="health-value">{{ paymentsOverview.paymentHealth?.unprocessedEvents || 0 }}</span>
                </div>
                <div :class="['health-item', { error: paymentsOverview.paymentHealth?.failedEvents > 0 }]">
                  <span class="health-label">Failed</span>
                  <span class="health-value">{{ paymentsOverview.paymentHealth?.failedEvents || 0 }}</span>
                </div>
              </div>
              <button class="btn secondary" @click="viewPaymentEvents" style="margin-top: var(--spacing-md);">
                View Payment Events
              </button>
            </div>

            <h3 style="margin-top: var(--spacing-xl);">Recent Purchases</h3>
            <div class="data-table-container">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Group</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="p in purchases" :key="p.id">
                    <td>{{ p.userEmail || 'Unknown' }}</td>
                    <td>{{ p.groupName || 'Unknown' }}</td>
                    <td>{{ formatCurrency(p.amountCents) }}</td>
                    <td>
                      <span :class="['status-badge', getStatusClass(p.status)]">
                        {{ p.status }}
                      </span>
                    </td>
                    <td>{{ formatDate(p.createdAt) }}</td>
                  </tr>
                  <tr v-if="purchases.length === 0">
                    <td colspan="5" class="empty-state">No purchases found</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <!-- COUPONS TAB -->
        <section v-if="activeTab === 'coupons'" class="dashboard-section">
          <h2>Coupon Operations</h2>

          <div class="coupon-redemptions-panel">
            <h3>Recent Redemptions (Last 30 Days)</h3>
            <div v-if="redemptionOverview.recentRedemptions?.length" class="data-table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Coupon</th>
                    <th>Merchant</th>
                    <th>Foodie Group</th>
                    <th>Customer</th>
                    <th>Redeemed</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="redemption in redemptionOverview.recentRedemptions"
                    :key="redemption.redemptionId"
                  >
                    <td>{{ redemption.couponTitle || '—' }}</td>
                    <td>{{ redemption.merchantName || '—' }}</td>
                    <td>{{ redemption.groupName || '—' }}</td>
                    <td>{{ redemption.customerEmail || '—' }}</td>
                    <td>{{ formatDate(redemption.redeemedAt) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="empty-state">No redemptions in the last 30 days.</div>
          </div>

          <nav class="sub-tab-nav">
            <button :class="['sub-tab-btn', { active: couponsTabView === 'pending' }]" @click="switchCouponsTabView('pending')">
              Pending Submissions
            </button>
            <button :class="['sub-tab-btn', { active: couponsTabView === 'approved' }]" @click="switchCouponsTabView('approved')">
              Approved / Live Coupons
            </button>
            <button :class="['sub-tab-btn', { active: couponsTabView === 'rejected' }]" @click="switchCouponsTabView('rejected')">
              Rejected Submissions
            </button>
          </nav>

          <div v-if="couponsTabLoading" class="loading-state">Loading...</div>
          <div v-else-if="couponsTabError" class="error-state">{{ couponsTabError }}</div>

          <!-- Pending Submissions Sub-Tab -->
          <div v-else-if="couponsTabView === 'pending'">
            <div v-if="couponsTabPending.length === 0" class="empty-state">No pending submissions.</div>
            <div v-else class="data-table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Merchant</th>
                    <th>Type</th>
                    <th>Submitted</th>
                    <th>Last Edited</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="sub in couponsTabPending" :key="sub.id">
                    <td>{{ sub.submissionData?.title || sub.submission_data?.title || '—' }}</td>
                    <td>{{ sub.merchantName || '—' }}</td>
                    <td>{{ sub.submissionData?.coupon_type || sub.submission_data?.coupon_type || '—' }}</td>
                    <td>{{ formatDate(sub.submittedAt || sub.submitted_at) }}</td>
                    <td>{{ sub.updatedAt || sub.updated_at ? formatDate(sub.updatedAt || sub.updated_at) : '—' }}</td>
                    <td class="action-cell">
                      <button class="btn compact primary" @click="adminApproveSub(sub)">Approve</button>
                      <button class="btn compact danger" @click="adminRejectSub(sub)">Reject</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Approved / Live Coupons Sub-Tab -->
          <div v-else-if="couponsTabView === 'approved'">
            <div v-if="couponsTabApproved.length === 0" class="empty-state">No approved coupons found.</div>
            <div v-else class="data-table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Merchant</th>
                    <th>Type</th>
                    <th>Discount</th>
                    <th>Expires</th>
                    <th>Locked</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="c in couponsTabApproved" :key="c.id">
                    <td>{{ c.title }}</td>
                    <td>{{ c.merchantName || '—' }}</td>
                    <td>{{ c.couponType || c.coupon_type }}</td>
                    <td>{{ c.discountValue || c.discount_value }}{{ (c.couponType || c.coupon_type) === 'percent' ? '%' : '' }}</td>
                    <td>{{ formatDate(c.expiresAt || c.expires_at) }}</td>
                    <td>{{ c.locked ? 'Yes' : 'No' }}</td>
                    <td class="action-cell">
                      <button class="btn compact tertiary" @click="openEditCouponModal(c)">Edit</button>
                      <button class="btn compact danger" @click="removeCoupon(c)">Remove</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Rejected Submissions Sub-Tab -->
          <div v-else-if="couponsTabView === 'rejected'">
            <div v-if="couponsTabRejected.length === 0" class="empty-state">No rejected submissions.</div>
            <div v-else class="data-table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Merchant</th>
                    <th>Submitted</th>
                    <th>Reviewed</th>
                    <th>Rejection Reason</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="sub in couponsTabRejected" :key="sub.id">
                    <td>{{ sub.submissionData?.title || sub.submission_data?.title || '—' }}</td>
                    <td>{{ sub.merchantName || '—' }}</td>
                    <td>{{ formatDate(sub.submittedAt || sub.submitted_at) }}</td>
                    <td>{{ sub.reviewedAt || sub.reviewed_at ? formatDate(sub.reviewedAt || sub.reviewed_at) : '—' }}</td>
                    <td>{{ sub.rejectionMessage || sub.rejection_message || '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <!-- ── Events Tab ──────────────────────────────────────── -->
        <section v-if="activeTab === 'events'" class="dashboard-section">
          <h2>Event Operations</h2>

          <!-- Recent RSVPs panel -->
          <div class="coupon-redemptions-panel">
            <h3>Recent RSVPs (Last 30 Days)</h3>
            <div v-if="recentRsvpsLoading" class="loading-state">Loading RSVPs…</div>
            <div v-else-if="recentRsvpsError" class="error-state">{{ recentRsvpsError }}</div>
            <div v-else-if="recentRsvps.length" class="data-table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Merchant</th>
                    <th>Foodie Group</th>
                    <th>Customer</th>
                    <th>Party</th>
                    <th>Status</th>
                    <th>RSVPed</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in recentRsvps" :key="r.id">
                    <td>{{ r.eventName }}</td>
                    <td>{{ r.merchantName }}</td>
                    <td>{{ r.groupName }}</td>
                    <td>{{ r.customerEmail }}</td>
                    <td>{{ r.attendees }}</td>
                    <td><span :class="['status-badge', r.status]">{{ r.status }}</span></td>
                    <td>{{ formatDate(r.createdAt) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="empty-state">No RSVPs in the last 30 days.</div>
          </div>

          <!-- Sub-tabs -->
          <nav class="sub-tab-nav">
            <button :class="['sub-tab-btn', { active: eventsTabView === 'published' }]" @click="switchEventsTabView('published')">
              Published Events
            </button>
            <button :class="['sub-tab-btn', { active: eventsTabView === 'pending' }]" @click="switchEventsTabView('pending')">
              Pending Submissions
            </button>
            <button :class="['sub-tab-btn', { active: eventsTabView === 'rejected' }]" @click="switchEventsTabView('rejected')">
              Rejected Submissions
            </button>
          </nav>

          <!-- Published Events Sub-Tab -->
          <div v-if="eventsTabView === 'published'">
            <div class="section-actions">
              <input
                v-model.trim="eventsSearch"
                type="text"
                placeholder="Search by event, merchant, or group…"
                class="search-input"
                @keyup.enter="loadAdminEvents"
              />
              <button class="btn secondary" @click="loadAdminEvents">Search</button>
            </div>
            <div v-if="eventsLoading" class="loading-state">Loading events…</div>
            <div v-else-if="eventsError" class="error-state">{{ eventsError }}</div>
            <div v-else-if="!adminEvents.length" class="empty-state">No published events found.</div>
            <div v-else class="data-table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Merchant</th>
                    <th>Group</th>
                    <th>Date</th>
                    <th>Confirmed</th>
                    <th>Waitlisted</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="evt in adminEvents" :key="evt.eventId">
                    <td>{{ evt.eventName }}</td>
                    <td>{{ evt.merchantName }}</td>
                    <td>{{ evt.groupName }}</td>
                    <td>{{ evt.startDatetime ? formatDate(evt.startDatetime) : '—' }}</td>
                    <td>{{ evt.confirmedRsvps }}</td>
                    <td>{{ evt.waitlistCount }}</td>
                    <td><span :class="['status-badge', evt.status]">{{ evt.status }}</span></td>
                    <td class="action-cell">
                      <button class="btn compact tertiary" @click="loadAdminEventAttendees(evt.eventId)">
                        {{ selectedAdminEventId === evt.eventId ? 'Refresh' : 'Attendees' }}
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Attendee drill-down panel -->
            <div v-if="selectedAdminEventId" class="coupon-redemptions-panel" style="margin-top: var(--spacing-lg);">
              <div class="details-header">
                <strong>{{ (adminEvents.find(e => e.eventId === selectedAdminEventId) || {}).eventName || 'Event' }}</strong>
                <span class="muted tiny">{{ adminEventAttendees.length }} attendee{{ adminEventAttendees.length === 1 ? '' : 's' }}</span>
              </div>
              <div v-if="adminAttendeesLoading" class="loading-state">Loading attendees…</div>
              <div v-else-if="adminAttendeesError" class="error-state">{{ adminAttendeesError }}</div>
              <div v-else-if="adminEventAttendees.length" class="data-table-wrap">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Party</th>
                      <th>Status</th>
                      <th>Waitlist</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="a in adminEventAttendees" :key="a.id">
                      <td>{{ a.userName || a.guestName || '—' }}</td>
                      <td>{{ a.userEmail || a.guestEmail || '—' }}</td>
                      <td>{{ a.attendees }}</td>
                      <td>{{ a.status }}</td>
                      <td>{{ a.waitlistPosition || '—' }}</td>
                      <td class="action-cell">
                        <button class="btn compact tertiary" :disabled="a.status !== 'waitlist'" @click="adminPromoteAttendee(a)">Promote</button>
                        <button class="btn compact tertiary" :disabled="a.status === 'cancelled'" @click="adminCancelAttendee(a)">Cancel</button>
                        <button class="btn compact tertiary" :disabled="a.status !== 'going'" @click="adminCheckIn(a)">Check-in</button>
                        <button class="btn compact tertiary" :disabled="a.status !== 'going' && a.status !== 'checked_in'" @click="adminNoShow(a)">No-show</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div v-else class="empty-state">No attendees for this event.</div>
            </div>
          </div>

          <!-- Pending Submissions Sub-Tab -->
          <div v-else-if="eventsTabView === 'pending'">
            <div v-if="adminEventSubsLoading" class="loading-state">Loading…</div>
            <div v-else-if="adminEventSubsError" class="error-state">{{ adminEventSubsError }}</div>
            <div v-else-if="!adminEventSubsPending.length" class="empty-state">No pending event submissions.</div>
            <div v-else class="data-table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Event Name</th>
                    <th>Merchant</th>
                    <th>Group</th>
                    <th>Start Date</th>
                    <th>Submitted</th>
                    <th>Last Edited</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="sub in adminEventSubsPending" :key="sub.id">
                    <td>{{ sub.submissionData?.name || '—' }}</td>
                    <td>{{ sub.merchantName || '—' }}</td>
                    <td>{{ sub.groupName || '—' }}</td>
                    <td>{{ sub.submissionData?.start_datetime ? formatDate(sub.submissionData.start_datetime) : '—' }}</td>
                    <td>{{ formatDate(sub.submittedAt) }}</td>
                    <td>{{ sub.updatedAt ? formatDate(sub.updatedAt) : '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Rejected Submissions Sub-Tab -->
          <div v-else-if="eventsTabView === 'rejected'">
            <div v-if="adminEventSubsLoading" class="loading-state">Loading…</div>
            <div v-else-if="adminEventSubsError" class="error-state">{{ adminEventSubsError }}</div>
            <div v-else-if="!adminEventSubsRejected.length" class="empty-state">No rejected event submissions.</div>
            <div v-else class="data-table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Event Name</th>
                    <th>Merchant</th>
                    <th>Group</th>
                    <th>Submitted</th>
                    <th>Reviewed</th>
                    <th>Rejection Reason</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="sub in adminEventSubsRejected" :key="sub.id">
                    <td>{{ sub.submissionData?.name || '—' }}</td>
                    <td>{{ sub.merchantName || '—' }}</td>
                    <td>{{ sub.groupName || '—' }}</td>
                    <td>{{ formatDate(sub.submittedAt) }}</td>
                    <td>{{ sub.reviewedAt ? formatDate(sub.reviewedAt) : '—' }}</td>
                    <td>{{ sub.rejectionMessage || '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </template>

    <!-- Edit Coupon Modal -->
    <Modal v-if="editCouponModal" @close="editCouponModal = null">
      <h2>Edit Coupon</h2>
      <div class="form-grid">
        <label>Title<input v-model="editCouponForm.title" class="form-input" /></label>
        <label>Description<textarea v-model="editCouponForm.description" class="form-input" rows="3"></textarea></label>
        <label>Coupon Type
          <select v-model="editCouponForm.couponType" class="form-input">
            <option value="percent">Percent</option>
            <option value="amount">Amount</option>
            <option value="bogo">BOGO</option>
            <option value="free_item">Free Item</option>
          </select>
        </label>
        <label>Discount Value<input v-model.number="editCouponForm.discountValue" type="number" class="form-input" /></label>
        <label>Valid From<input v-model="editCouponForm.validFrom" type="date" class="form-input" /></label>
        <label>Expires At<input v-model="editCouponForm.expiresAt" type="date" class="form-input" /></label>
        <label class="checkbox-label"><input type="checkbox" v-model="editCouponForm.locked" /> Locked</label>
      </div>
      <div class="modal-actions" style="margin-top: var(--spacing-lg);">
        <button class="btn primary" :disabled="editCouponSaving" @click="saveEditCoupon">
          {{ editCouponSaving ? 'Saving...' : 'Save Changes' }}
        </button>
        <button class="btn tertiary" @click="editCouponModal = null">Cancel</button>
      </div>
    </Modal>

    <!-- MODALS -->
    
    <!-- Disable User Modal -->
    <Modal v-if="showDisableModalFlag" @close="closeDisableModal">
      <h2>Disable User</h2>
      <p class="warning-text">
        Are you sure you want to disable this user? They will no longer be able to sign in.
      </p>
      <div class="modal-user-info">
        <p><strong>User:</strong> {{ userToDisable?.name }}</p>
        <p><strong>Email:</strong> {{ userToDisable?.email }}</p>
        <p><strong>Role:</strong> {{ userToDisable?.role }}</p>
      </div>
      <p class="info-text">
        This action can be reversed later by clicking "Enable" on the user.
      </p>
      <div class="modal-actions">
        <button class="btn secondary" @click="closeDisableModal">Cancel</button>
        <button class="btn warning" @click="confirmDisableUser">
          Yes, Disable User
        </button>
      </div>
    </Modal>

    <!-- Grant Access Modal -->
    <Modal v-if="showGrantAccessModalFlag" @close="closeGrantAccessModal">
      <h2>Grant Group Access</h2>
      <p class="info-text">
        Give a user access to a foodie group without going through Stripe.
        Used for comped access, partnerships, internal QA, and similar cases.
      </p>
      <div class="modal-user-info">
        <p><strong>User:</strong> {{ userToGrant?.name }}</p>
        <p><strong>Email:</strong> {{ userToGrant?.email }}</p>
      </div>

      <div class="form-group">
        <label>Foodie Group:</label>
        <select v-model="grantForm.groupId" :disabled="groupsLoading">
          <option value="">-- Select a group --</option>
          <option v-for="g in groups" :key="g.id" :value="g.id">
            {{ g.name }}
          </option>
        </select>
        <p v-if="groupsLoading" class="muted tiny">Loading groups...</p>
      </div>

      <div class="form-group">
        <label>Access Duration:</label>
        <div class="radio-group">
          <label class="radio-option">
            <input type="radio" v-model="grantForm.expiryPreset" value="perpetual" />
            <span>Perpetual (never expires)</span>
          </label>
          <label class="radio-option">
            <input type="radio" v-model="grantForm.expiryPreset" value="30d" />
            <span>30 days</span>
          </label>
          <label class="radio-option">
            <input type="radio" v-model="grantForm.expiryPreset" value="90d" />
            <span>90 days</span>
          </label>
          <label class="radio-option">
            <input type="radio" v-model="grantForm.expiryPreset" value="1y" />
            <span>1 year</span>
          </label>
          <label class="radio-option">
            <input type="radio" v-model="grantForm.expiryPreset" value="custom" />
            <span>Custom date</span>
          </label>
        </div>
        <input
          v-if="grantForm.expiryPreset === 'custom'"
          type="date"
          v-model="grantForm.customExpiry"
          :min="tomorrowIsoDate"
          class="date-input"
        />
      </div>

      <div class="form-group">
        <label>Reason (optional, stored in audit log):</label>
        <textarea
          v-model="grantForm.reason"
          placeholder="e.g., comped QA access, partnership grant..."
          rows="2"
        ></textarea>
      </div>

      <p v-if="grantError" class="error-state">{{ grantError }}</p>

      <div class="modal-actions">
        <button class="btn secondary" @click="closeGrantAccessModal">Cancel</button>
        <button
          class="btn primary"
          @click="submitGrantAccess"
          :disabled="!grantForm.groupId || grantSubmitting || (grantForm.expiryPreset === 'custom' && !grantForm.customExpiry)"
        >
          {{ grantSubmitting ? 'Granting...' : 'Grant Access' }}
        </button>
      </div>

      <!-- Active grants list -->
      <div class="grant-list-section">
        <h3>Active Grants for This User</h3>
        <p v-if="userGrantsLoading" class="muted tiny">Loading...</p>
        <p v-else-if="userGrants.length === 0" class="muted tiny">
          No active admin-granted access for this user.
        </p>
        <ul v-else class="grant-list">
          <li v-for="g in userGrants" :key="g.purchaseId" class="grant-row">
            <div class="grant-info">
              <strong>{{ g.groupName || '(unknown group)' }}</strong>
              <span class="muted tiny">
                · Expires: {{ g.expiresAt ? formatDate(g.expiresAt) : 'Never' }}
              </span>
              <span v-if="g.metadata?.reason" class="muted tiny">
                · {{ g.metadata.reason }}
              </span>
            </div>
            <button
              class="btn-action danger small"
              @click="revokeGrantAccess(g)"
              :disabled="revokingPurchaseId === g.purchaseId"
            >
              {{ revokingPurchaseId === g.purchaseId ? 'Revoking...' : 'Revoke' }}
            </button>
          </li>
        </ul>
      </div>
    </Modal>

    <!-- Anonymize User Modal -->
    <Modal v-if="showAnonymizeModalFlag" @close="closeAnonymizeModal">
      <h2>Anonymize User</h2>
      <p class="warning-text">
        This action is <strong>irreversible</strong>. The user's personal data will be permanently removed.
      </p>
      <div class="modal-user-info">
        <p><strong>User:</strong> {{ userToAnonymize?.name }}</p>
        <p><strong>Email:</strong> {{ userToAnonymize?.email }}</p>
      </div>
      
      <div v-if="userMerchants.length > 0" class="merchant-warning">
        <p class="warning-text">This user owns {{ userMerchants.length }} merchant(s):</p>
        <ul>
          <li v-for="m in userMerchants" :key="m.id">{{ m.name }}</li>
        </ul>
        <div class="form-group">
          <label>Reassign merchants to:</label>
          <input
            type="text"
            v-model="reassignMerchantsSearch"
            placeholder="Search user by email..."
            @input="searchReassignUsers"
          />
          <select v-if="reassignUserOptions.length > 0" v-model="reassignMerchantsTo">
            <option value="">-- Select user --</option>
            <option v-for="u in reassignUserOptions" :key="u.id" :value="u.id">
              {{ u.name }} ({{ u.email }})
            </option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <label>Reason for anonymization:</label>
        <textarea v-model="anonymizeReason" placeholder="e.g., GDPR request, user requested deletion"></textarea>
      </div>

      <div class="form-group">
        <label class="confirm-label">
          Type <strong>ANONYMIZE</strong> to confirm:
        </label>
        <input type="text" v-model="anonymizeConfirm" placeholder="ANONYMIZE" />
      </div>

      <div class="modal-actions">
        <button class="btn secondary" @click="closeAnonymizeModal">Cancel</button>
        <button
          class="btn danger"
          @click="confirmAnonymize"
          :disabled="anonymizeConfirm !== 'ANONYMIZE' || (userMerchants.length > 0 && !reassignMerchantsTo)"
        >
          Anonymize User
        </button>
      </div>
    </Modal>

    <!-- Create Merchant Modal -->
    <Modal v-if="showCreateMerchantModal" @close="showCreateMerchantModal = false">
      <h2>Create Merchant</h2>
      <div class="form-group">
        <label>Merchant Name:</label>
        <input type="text" v-model="newMerchant.name" placeholder="Business name" />
      </div>
      <div class="form-group">
        <label>Logo URL — square, 400 × 400 px (optional):</label>
        <input type="text" v-model="newMerchant.logoUrl" placeholder="https://..." />
      </div>
      <div class="form-group">
        <label>Owner (search by email):</label>
        <input
          type="text"
          v-model="ownerSearch"
          placeholder="Search user by email..."
          @input="searchOwnerUsers"
        />
        <select v-if="ownerUserOptions.length > 0" v-model="newMerchant.ownerId">
          <option value="">-- Select owner --</option>
          <option v-for="u in ownerUserOptions" :key="u.id" :value="u.id">
            {{ u.name }} ({{ u.email }})
          </option>
        </select>
      </div>
      <div class="modal-actions">
        <button class="btn secondary" @click="showCreateMerchantModal = false">Cancel</button>
        <button class="btn primary" @click="createMerchant" :disabled="!newMerchant.name || !newMerchant.ownerId">
          Create Merchant
        </button>
      </div>
    </Modal>

    <!-- Edit Merchant Modal -->
    <Modal v-if="showEditMerchantModal" @close="showEditMerchantModal = false">
      <h2>Edit Merchant</h2>
      <div class="form-group">
        <label>Merchant Name:</label>
        <input type="text" v-model="editingMerchant.name" />
      </div>
      <div class="form-group">
        <label>Logo URL:</label>
        <input type="text" v-model="editingMerchant.logoUrl" placeholder="https://..." />
      </div>
      <div class="form-group">
        <label>Current Owner:</label>
        <p class="muted">{{ editingMerchant.ownerName }} ({{ editingMerchant.ownerEmail }})</p>
      </div>
      <div class="form-group">
        <label>Reassign Owner (optional):</label>
        <input
          type="text"
          v-model="editOwnerSearch"
          placeholder="Search user by email..."
          @input="searchEditOwnerUsers"
        />
        <select v-if="editOwnerUserOptions.length > 0" v-model="editingMerchant.newOwnerId">
          <option value="">-- Keep current owner --</option>
          <option v-for="u in editOwnerUserOptions" :key="u.id" :value="u.id">
            {{ u.name }} ({{ u.email }})
          </option>
        </select>
      </div>
      <!-- Admins section -->
      <div class="form-group" style="margin-top: var(--spacing-lg);">
        <label style="font-weight: var(--font-weight-semibold);">Admins</label>

        <div v-if="merchantAdminsLoading" class="muted" style="font-size:0.875rem; margin-top:0.5rem;">Loading…</div>
        <ul v-else class="admin-list" style="margin-top:0.5rem;">
          <li v-for="admin in merchantAdmins" :key="admin.userId" class="admin-item">
            <span>{{ admin.name }} ({{ admin.email }})</span>
            <button
              class="btn-action danger"
              :disabled="removingMerchantAdminId === admin.userId"
              @click="removeMerchantAdminAdmin(admin.userId)"
            >Remove</button>
          </li>
          <li v-if="merchantAdmins.length === 0" class="muted" style="font-size:0.875rem;">No additional admins.</li>
        </ul>

        <div style="margin-top:0.75rem;">
          <p style="font-size:0.875rem; margin-bottom:0.35rem;">Add Admin:</p>
          <div style="display:flex; gap:0.5rem; align-items:center;">
            <input
              type="text"
              v-model="merchantAdminSearch"
              placeholder="Search by name or email…"
              style="flex:1;"
              @input="searchMerchantAdminUsers"
            />
          </div>
          <select
            v-if="merchantAdminSearchResults.length"
            style="width:100%; margin-top:0.35rem;"
            @change="(e) => { addMerchantAdminAdmin(e.target.value); e.target.value = ''; }"
          >
            <option value="">-- Select user to add --</option>
            <option v-for="u in merchantAdminSearchResults" :key="u.id" :value="u.id">
              {{ u.name }} ({{ u.email }})
            </option>
          </select>
          <p v-if="merchantAdminError" class="muted" style="color:var(--color-error); font-size:0.875rem; margin-top:0.35rem;">{{ merchantAdminError }}</p>
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn secondary" @click="showEditMerchantModal = false">Cancel</button>
        <button class="btn primary" @click="saveMerchant">Save Changes</button>
      </div>
    </Modal>

    <!-- Create Group Modal -->
    <Modal v-if="showCreateGroupModal" @close="showCreateGroupModal = false">
      <h2>Create Foodie Group</h2>
      <div class="form-group">
        <label>Group Name:</label>
        <input type="text" v-model="newGroup.name" placeholder="Chapel Hill Foodies" />
      </div>
      <div class="form-group">
        <label>Slug (auto-generated if empty):</label>
        <input type="text" v-model="newGroup.slug" placeholder="chapel-hill-foodies" />
      </div>
      <div class="form-group">
        <label>Description:</label>
        <textarea v-model="newGroup.description" placeholder="A community of food lovers..."></textarea>
      </div>
      <div class="form-group">
        <label>Location:</label>
        <input type="text" v-model="newGroup.location" placeholder="Chapel Hill, NC" />
      </div>
      <div class="modal-actions">
        <button class="btn secondary" @click="showCreateGroupModal = false">Cancel</button>
        <button class="btn primary" @click="createGroup" :disabled="!newGroup.name">
          Create Group
        </button>
      </div>
    </Modal>

    <!-- Edit Group Modal -->
    <Modal v-if="showEditGroupModal" @close="showEditGroupModal = false">
      <h2>Edit Foodie Group</h2>
      <div class="form-group">
        <label>Group Name:</label>
        <input type="text" v-model="editingGroup.name" />
      </div>
      <div class="form-group">
        <label>Description:</label>
        <textarea v-model="editingGroup.description"></textarea>
      </div>
      <div class="form-group">
        <label>Location:</label>
        <input type="text" v-model="editingGroup.location" />
      </div>
      <div class="form-group">
        <label>Banner Image URL — wide, 1600 × 500 px:</label>
        <input type="text" v-model="editingGroup.bannerImageUrl" />
      </div>
      <div class="modal-actions">
        <button class="btn secondary" @click="showEditGroupModal = false">Cancel</button>
        <button class="btn primary" @click="saveGroup">Save Changes</button>
      </div>
    </Modal>

    <!-- Group Admins Modal -->
    <Modal v-if="showGroupAdminsModal" @close="showGroupAdminsModal = false">
      <h2>Manage Group Admins</h2>
      <p class="muted">Group: {{ selectedGroupForAdmins?.name }}</p>
      
      <h3>Current Admins</h3>
      <div v-if="groupAdminsLoading" class="loading-state">Loading...</div>
      <ul v-else class="admin-list">
        <li v-for="admin in groupAdmins" :key="admin.membershipId" class="admin-item">
          <span>{{ admin.userName }} ({{ admin.userEmail }})</span>
          <button class="btn-action danger" @click="removeGroupAdmin(admin)">Remove</button>
        </li>
        <li v-if="groupAdmins.length === 0" class="muted">No admins assigned</li>
      </ul>

      <h3 style="margin-top: var(--spacing-lg);">Add Admin</h3>
      <div class="form-group">
        <input
          type="text"
          v-model="newAdminSearch"
          placeholder="Search user by email..."
          @input="searchNewAdminUsers"
        />
        <select v-if="newAdminUserOptions.length > 0" v-model="newAdminUserId">
          <option value="">-- Select user --</option>
          <option v-for="u in newAdminUserOptions" :key="u.id" :value="u.id">
            {{ u.name }} ({{ u.email }})
          </option>
        </select>
        <button class="btn primary" @click="addGroupAdmin" :disabled="!newAdminUserId" style="margin-top: var(--spacing-sm);">
          Add Admin
        </button>
      </div>

      <div class="modal-actions">
        <button class="btn secondary" @click="showGroupAdminsModal = false">Close</button>
      </div>
    </Modal>

    <!-- Payment Events Modal -->
    <Modal v-if="showPaymentEventsModal" @close="showPaymentEventsModal = false">
      <h2>Payment Events</h2>
      <div class="search-bar">
        <label class="checkbox-label">
          <input type="checkbox" v-model="showUnprocessedOnly" @change="loadPaymentEvents" />
          Unprocessed only
        </label>
        <label class="checkbox-label">
          <input type="checkbox" v-model="showFailedOnly" @change="loadPaymentEvents" />
          Failed only
        </label>
      </div>

      <div v-if="paymentEventsLoading" class="loading-state">Loading...</div>
      <div v-else class="data-table-container" style="max-height: 400px; overflow-y: auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Event Type</th>
              <th>Received</th>
              <th>Processed</th>
              <th>Error</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in paymentEvents" :key="e.id">
              <td>{{ e.eventType }}</td>
              <td>{{ formatDate(e.receivedAt) }}</td>
              <td>{{ e.processedAt ? formatDate(e.processedAt) : '-' }}</td>
              <td>
                <span v-if="e.processingError" class="error-text" :title="e.processingError">Error</span>
                <span v-else>-</span>
              </td>
              <td>
                <button
                  v-if="!e.processedAt || e.processingError"
                  class="btn-action"
                  @click="reprocessEvent(e)"
                >
                  Reprocess
                </button>
              </td>
            </tr>
            <tr v-if="paymentEvents.length === 0">
              <td colspan="5" class="empty-state">No events found</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="modal-actions">
        <button class="btn secondary" @click="showPaymentEventsModal = false">Close</button>
      </div>
    </Modal>

    <!-- PENDING SUBMISSIONS MODAL -->
    <Modal v-if="showSubmissionsModal" @close="showSubmissionsModal = false">
      <h2>Pending Submissions</h2>
      <p class="muted">Submissions awaiting group admin approval</p>
      
      <div v-if="submissionsLoading" class="loading-state">Loading submissions...</div>
      <div v-else-if="pendingSubmissions.length === 0" class="empty-state">
        <p>No pending submissions.</p>
      </div>
      <div v-else class="submissions-list">
        <table class="data-table">
          <thead>
            <tr>
              <th>Submitted</th>
              <th>Merchant</th>
              <th>Foodie Group</th>
              <th>Coupon Title</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="sub in pendingSubmissions" :key="sub.id">
              <td>{{ formatDate(sub.submittedAt) }}</td>
              <td>{{ sub.merchantName || 'Unknown' }}</td>
              <td>
                <router-link v-if="sub.groupSlug" :to="`/groups/${sub.groupSlug}`" class="group-link">
                  {{ sub.groupName || 'Unknown' }}
                </router-link>
                <span v-else>{{ sub.groupName || 'Unknown' }}</span>
              </td>
              <td>{{ sub.submissionData?.title || sub.submissionData?.dealTitle || 'Untitled' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="modal-actions">
        <button class="btn secondary" @click="showSubmissionsModal = false">Close</button>
      </div>
    </Modal>

    <!-- COUPONS MODAL -->
    <Modal v-if="showCouponsModal" @close="showCouponsModal = false">
      <h2>All Coupons</h2>
      <p class="muted">Active coupons across all foodie groups</p>
      
      <div class="search-bar compact">
        <input
          type="text"
          v-model="couponSearch"
          placeholder="Search by title or merchant..."
          @keyup.enter="loadCoupons"
        />
        <button class="btn primary sm" @click="loadCoupons">Search</button>
      </div>

      <div v-if="couponsLoading" class="loading-state">Loading coupons...</div>
      <div v-else-if="coupons.length === 0" class="empty-state">
        <p>No coupons found.</p>
      </div>
      <div v-else class="coupons-list">
        <table class="data-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Merchant</th>
              <th>Foodie Group</th>
              <th>Status</th>
              <th>Expires</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="coupon in coupons" :key="coupon.id">
              <td>{{ coupon.title || 'Untitled' }}</td>
              <td>{{ coupon.merchantName || 'Unknown' }}</td>
              <td>
                <router-link v-if="coupon.groupSlug" :to="`/groups/${coupon.groupSlug}`" class="group-link">
                  {{ coupon.groupName || 'Unknown' }}
                </router-link>
                <span v-else>{{ coupon.groupName || 'Unknown' }}</span>
              </td>
              <td>
                <span :class="['status-badge', coupon.isActive ? 'active' : 'inactive']">
                  {{ coupon.isActive ? 'Active' : 'Inactive' }}
                </span>
              </td>
              <td>{{ coupon.expiresAt ? formatDate(coupon.expiresAt) : 'No expiry' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="modal-actions">
        <button class="btn secondary" @click="showCouponsModal = false">Close</button>
      </div>
    </Modal>
  </div>
</template>

<script>
import { mapGetters } from "vuex";
import { getAccessToken, signIn, setImpersonation } from "@/services/authService";
import Modal from "@/components/Common/Modal.vue";
import CreateCustomerAccount from "@/components/Dashboard/CreateCustomerAccount.vue";

const API_BASE = "/api/v1";

export default {
  name: "SuperAdminDashboard",
  components: { Modal, CreateCustomerAccount },

  data() {
    return {
      // Auth state
      user: null,
      authChecked: false,
      notAuthorized: false,
      notAuthorizedMessage: "You are not authorized to access the Super Admin Dashboard.",

      // Tabs
      activeTab: "overview",
      tabs: [
        { id: "overview", label: "Overview", icon: "pi-chart-bar" },
        { id: "users", label: "Users", icon: "pi-users" },
        { id: "merchants", label: "Merchants", icon: "pi-building" },
        { id: "groups", label: "Groups", icon: "pi-sitemap" },
        { id: "payments", label: "Payments", icon: "pi-credit-card" },
        { id: "coupons", label: "Coupons", icon: "pi-ticket" },
        { id: "events", label: "Events", icon: "pi-calendar" },
      ],

      // Overview
      overview: {},
      redemptionOverview: {
        redemptionsLast30Days: 0,
        topGroup: null,
        recentRedemptions: [],
      },
      overviewLoading: false,
      overviewError: null,
      redemptionOverviewError: null,

      // Users
      users: [],
      userSearch: "",
      includeDeletedUsers: false,
      usersLoading: false,
      usersError: null,

      // Disable modal
      showDisableModalFlag: false,
      userToDisable: null,

      // Grant access modal
      showGrantAccessModalFlag: false,
      userToGrant: null,
      grantForm: {
        groupId: '',
        expiryPreset: 'perpetual',
        customExpiry: '',
        reason: '',
      },
      grantSubmitting: false,
      grantError: null,
      userGrants: [],
      userGrantsLoading: false,
      revokingPurchaseId: null,

      // Anonymize modal
      showAnonymizeModalFlag: false,
      userToAnonymize: null,
      userMerchants: [],
      anonymizeReason: "",
      anonymizeConfirm: "",
      reassignMerchantsSearch: "",
      reassignUserOptions: [],
      reassignMerchantsTo: "",

      // Merchants
      merchants: [],
      merchantSearch: "",
      merchantsLoading: false,
      merchantsError: null,
      showCreateMerchantModal: false,
      showEditMerchantModal: false,
      newMerchant: { name: "", logoUrl: "", ownerId: "" },
      editingMerchant: {},
      ownerSearch: "",
      ownerUserOptions: [],
      editOwnerSearch: "",
      editOwnerUserOptions: [],

      // Merchant admins (within edit modal)
      merchantAdmins: [],
      merchantAdminsLoading: false,
      merchantAdminSearch: "",
      merchantAdminSearchResults: [],
      merchantAdminSearchLoading: false,
      merchantAdminError: null,
      removingMerchantAdminId: null,

      // Groups
      groups: [],
      groupSearch: "",
      groupsLoading: false,
      groupsError: null,
      showCreateGroupModal: false,
      showEditGroupModal: false,
      newGroup: { name: "", slug: "", description: "", location: "" },
      editingGroup: {},

      // Group admins
      showGroupAdminsModal: false,
      selectedGroupForAdmins: null,
      groupAdmins: [],
      groupAdminsLoading: false,
      newAdminSearch: "",
      newAdminUserOptions: [],
      newAdminUserId: "",

      // Payments
      paymentsOverview: {},
      purchases: [],
      paymentsLoading: false,
      paymentsError: null,
      paymentDateFrom: "",
      paymentDateTo: "",

      // Payment events modal
      showPaymentEventsModal: false,
      paymentEvents: [],
      paymentEventsLoading: false,
      showUnprocessedOnly: true,
      showFailedOnly: false,

      // Pending submissions modal
      showSubmissionsModal: false,
      pendingSubmissions: [],
      submissionsLoading: false,

      // Coupons modal
      showCouponsModal: false,
      coupons: [],
      couponsLoading: false,
      couponSearch: "",

      // Coupons tab
      couponsTabView: 'pending',
      couponsTabPending: [],
      couponsTabApproved: [],
      couponsTabRejected: [],
      couponsTabLoading: false,
      couponsTabError: null,
      editCouponModal: null,
      editCouponForm: {},
      editCouponSaving: false,

      // Events tab
      eventsSearch: '',
      adminEvents: [],
      eventsLoading: false,
      eventsError: null,
      selectedAdminEventId: null,
      adminEventAttendees: [],
      adminAttendeesLoading: false,
      adminAttendeesError: null,
      eventsTabView: 'published',

      // Event submissions sub-tabs
      adminEventSubsPending: [],
      adminEventSubsRejected: [],
      adminEventSubsLoading: false,
      adminEventSubsError: null,

      // Recent RSVPs panel
      recentRsvps: [],
      recentRsvpsLoading: false,
      recentRsvpsError: null,
    };
  },

  computed: {
    ...mapGetters("auth", ["isAuthenticated"]),

    /**
     * YYYY-MM-DD for tomorrow. Used as the `min` attribute on the
     * custom-expiry date picker so admins can't pick a date in the past.
     */
    tomorrowIsoDate() {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return d.toISOString().slice(0, 10);
    },
  },

  async created() {
    if (!this.isAuthenticated) {
      this.authChecked = true;
      return;
    }

    try {
      await this.loadCurrentUser();
      if (this.notAuthorized) return;

      await this.loadOverview();
    } finally {
      this.authChecked = true;
    }
  },

  watch: {
    activeTab(newTab) {
      this.loadTabData(newTab);
    },
  },

  methods: {
    signInNow() {
      signIn();
    },

    markNotAuthorized(msg) {
      this.notAuthorized = true;
      if (msg) this.notAuthorizedMessage = msg;
    },

    async getAuthHeaders() {
      const token = await getAccessToken();
      return token ? { Authorization: `Bearer ${token}` } : {};
    },

    async loadCurrentUser() {
      try {
        const headers = await this.getAuthHeaders();
        const res = await fetch(`${API_BASE}/users/me`, { headers });

        if (res.status === 401) {
          this.markNotAuthorized("Your session is not valid. Please sign in again.");
          return;
        }

        if (!res.ok) {
          this.markNotAuthorized("Unable to verify your account.");
          return;
        }

        const data = await res.json();
        this.user = { id: data.id, email: data.email, name: data.name, role: data.role };

        if (this.user.role !== "super_admin") {
          this.markNotAuthorized("You are signed in, but you do not have Super Admin permissions.");
        }
      } catch (err) {
        console.error("loadCurrentUser error:", err);
        this.markNotAuthorized("Unable to verify your permissions.");
      }
    },

    async loadTabData(tab) {
      switch (tab) {
        case "overview":
          await this.loadOverview();
          break;
        case "users":
          await this.searchUsers();
          break;
        case "merchants":
          await this.searchMerchants();
          break;
        case "groups":
          await this.searchGroups();
          break;
        case "payments":
          await this.loadPaymentsOverview();
          await this.loadPurchases();
          break;
        case "coupons":
          await this.loadCouponsTab();
          break;
        case "events":
          await Promise.all([this.loadAdminEvents(), this.loadRecentRsvps(), this.loadAdminEventSubmissions()]);
          break;
      }
    },

    // ==================== OVERVIEW ====================
    async loadOverview() {
      this.overviewLoading = true;
      this.overviewError = null;
      this.redemptionOverviewError = null;
      try {
        const headers = await this.getAuthHeaders();
        const [overviewRes, redemptionRes] = await Promise.all([
          fetch(`${API_BASE}/admin/overview`, { headers }),
          fetch(`${API_BASE}/admin/redemption-overview`, { headers }),
        ]);

        if (!overviewRes.ok) throw new Error(`Failed to load overview: ${overviewRes.status}`);
        this.overview = await overviewRes.json();

        if (!redemptionRes.ok) {
          this.redemptionOverviewError = `Failed to load redemption overview: ${redemptionRes.status}`;
          this.redemptionOverview = {
            redemptionsLast30Days: 0,
            topGroup: null,
            recentRedemptions: [],
          };
        } else {
          const redemptionData = await redemptionRes.json();
          this.redemptionOverview = {
            redemptionsLast30Days: Number(redemptionData.redemptionsLast30Days || 0),
            topGroup: redemptionData.topGroup || null,
            recentRedemptions: Array.isArray(redemptionData.recentRedemptions)
              ? redemptionData.recentRedemptions
              : [],
          };
        }
      } catch (err) {
        console.error("loadOverview error:", err);
        this.overviewError = err.message;
      } finally {
        this.overviewLoading = false;
      }
    },

    // ==================== USERS ====================
    async searchUsers() {
      this.usersLoading = true;
      this.usersError = null;
      try {
        const headers = await this.getAuthHeaders();
        const params = new URLSearchParams();
        if (this.userSearch) params.set("query", this.userSearch);
        if (this.includeDeletedUsers) params.set("includeDeleted", "true");
        params.set("limit", "100");

        const res = await fetch(`${API_BASE}/admin/users?${params}`, { headers });
        if (!res.ok) throw new Error(`Failed to load users: ${res.status}`);
        const data = await res.json();
        this.users = data.users || [];
      } catch (err) {
        console.error("searchUsers error:", err);
        this.usersError = err.message;
      } finally {
        this.usersLoading = false;
      }
    },

    async updateUserRole(user, newRole) {
      const previousRole = user.role;
      try {
        const headers = await this.getAuthHeaders();
        headers["Content-Type"] = "application/json";

        const res = await fetch(`${API_BASE}/admin/users/${user.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ role: newRole }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          alert(data.error || `Failed to update role: ${res.status}`);
          return;
        }

        user.role = newRole;

        // A "merchant" role alone doesn't create a business: the user won't appear
        // in the Merchant List — or be able to add coupons/events — until a merchant
        // (business) record is assigned to them. Offer to create it now, with this
        // user pre-selected as the owner, so the two-step flow isn't a surprise.
        if (newRole === "merchant" && previousRole !== "merchant") {
          const who = user.name || user.email || "This user";
          if (window.confirm(`${who} is now a merchant.\n\nCreate their business now? They won't show in the Merchant List — or be able to add coupons or events — until a business is assigned to them.`)) {
            this.newMerchant = { name: user.name || "", logoUrl: "", ownerId: user.id };
            this.ownerSearch = user.email || user.name || "";
            this.ownerUserOptions = [user];
            this.showCreateMerchantModal = true;
          }
        }
      } catch (err) {
        console.error("updateUserRole error:", err);
        alert("Failed to update user role");
      }
    },

    async actAs(u) {
      if (!window.confirm(`Act as ${u.name || u.email}? You'll browse the app as this user to help them set up. Every action is logged. Use the red banner at the top to exit.`)) return;
      try {
        const headers = await this.getAuthHeaders();
        headers["Content-Type"] = "application/json";
        const res = await fetch(`${API_BASE}/admin/impersonate/${u.id}`, {
          method: "POST",
          headers,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          alert(data.error || `Could not start impersonation: ${res.status}`);
          return;
        }
        setImpersonation(data);
        window.location.assign("/profile");
      } catch (err) {
        console.error("actAs error:", err);
        alert("Could not start impersonation");
      }
    },

    showDisableModal(user) {
      this.userToDisable = user;
      this.showDisableModalFlag = true;
    },

    closeDisableModal() {
      this.showDisableModalFlag = false;
      this.userToDisable = null;
    },

    /**
     * Open the "Grant Group Access" modal for a user. Loads the groups list
     * (for the picker) and the user's existing active admin grants (so the
     * admin can revoke them from the same dialog).
     */
    async showGrantAccessModal(u) {
      this.userToGrant = u;
      this.grantForm = {
        groupId: '',
        expiryPreset: 'perpetual',
        customExpiry: '',
        reason: '',
      };
      this.grantError = null;
      this.userGrants = [];
      this.showGrantAccessModalFlag = true;

      if (this.groups.length === 0) {
        await this.searchGroups();
      }
      await this.loadUserGrants(u.id);
    },

    closeGrantAccessModal() {
      this.showGrantAccessModalFlag = false;
      this.userToGrant = null;
      this.userGrants = [];
      this.grantError = null;
    },

    async loadUserGrants(userId) {
      this.userGrantsLoading = true;
      try {
        const headers = await this.getAuthHeaders();
        const res = await fetch(`${API_BASE}/admin/users/${userId}/access-grants`, { headers });
        if (!res.ok) throw new Error(`Failed to load grants: ${res.status}`);
        const data = await res.json();
        this.userGrants = data.grants || [];
      } catch (err) {
        console.error('loadUserGrants error', err);
        this.userGrants = [];
      } finally {
        this.userGrantsLoading = false;
      }
    },

    /**
     * Convert the selected expiry preset into an ISO date string (or null
     * for perpetual). Returns undefined if the custom date is empty.
     */
    resolveGrantExpiryIso() {
      const preset = this.grantForm.expiryPreset;
      if (preset === 'perpetual') return null;
      const now = new Date();
      if (preset === '30d') { now.setDate(now.getDate() + 30); return now.toISOString(); }
      if (preset === '90d') { now.setDate(now.getDate() + 90); return now.toISOString(); }
      if (preset === '1y')  { now.setFullYear(now.getFullYear() + 1); return now.toISOString(); }
      if (preset === 'custom') {
        if (!this.grantForm.customExpiry) return undefined;
        return new Date(this.grantForm.customExpiry + 'T23:59:59Z').toISOString();
      }
      return null;
    },

    async submitGrantAccess() {
      if (!this.userToGrant || !this.grantForm.groupId) return;
      const expiresAt = this.resolveGrantExpiryIso();
      if (expiresAt === undefined) {
        this.grantError = 'Please pick a custom expiry date.';
        return;
      }

      this.grantSubmitting = true;
      this.grantError = null;
      try {
        const headers = await this.getAuthHeaders();
        const res = await fetch(
          `${API_BASE}/admin/groups/${this.grantForm.groupId}/access-grants`,
          {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: this.userToGrant.id,
              expiresAt,
              reason: this.grantForm.reason || null,
            }),
          }
        );

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          this.grantError = data.error || `Grant failed: ${res.status}`;
          return;
        }

        this.grantForm.groupId = '';
        this.grantForm.reason = '';
        this.grantForm.expiryPreset = 'perpetual';
        this.grantForm.customExpiry = '';
        await this.loadUserGrants(this.userToGrant.id);
      } catch (err) {
        console.error('submitGrantAccess error', err);
        this.grantError = 'Failed to grant access. Please try again.';
      } finally {
        this.grantSubmitting = false;
      }
    },

    async revokeGrantAccess(grant) {
      if (!this.userToGrant || !grant?.groupId) return;
      if (!window.confirm(`Revoke access to "${grant.groupName}" for ${this.userToGrant.email}?`)) {
        return;
      }

      this.revokingPurchaseId = grant.purchaseId;
      try {
        const headers = await this.getAuthHeaders();
        const res = await fetch(
          `${API_BASE}/admin/groups/${grant.groupId}/access-grants/${this.userToGrant.id}`,
          { method: 'DELETE', headers }
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          alert(data.error || `Revoke failed: ${res.status}`);
          return;
        }
        await this.loadUserGrants(this.userToGrant.id);
      } catch (err) {
        console.error('revokeGrantAccess error', err);
        alert('Failed to revoke access.');
      } finally {
        this.revokingPurchaseId = null;
      }
    },

    async confirmDisableUser() {
      if (!this.userToDisable) return;

      try {
        const headers = await this.getAuthHeaders();
        const res = await fetch(`${API_BASE}/admin/users/${this.userToDisable.id}/disable`, {
          method: "POST",
          headers,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          alert(data.error || `Failed to disable user: ${res.status}`);
          return;
        }

        const data = await res.json();
        // Update the user in the list
        const userInList = this.users.find(u => u.id === this.userToDisable.id);
        if (userInList) {
          userInList.deletedAt = data.deletedAt;
        }
        this.closeDisableModal();
      } catch (err) {
        console.error("confirmDisableUser error:", err);
        alert("Failed to disable user");
      }
    },

    async enableUser(user) {
      try {
        const headers = await this.getAuthHeaders();
        const res = await fetch(`${API_BASE}/admin/users/${user.id}/enable`, {
          method: "POST",
          headers,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          alert(data.error || `Failed to enable user: ${res.status}`);
          return;
        }

        user.deletedAt = null;
      } catch (err) {
        console.error("enableUser error:", err);
        alert("Failed to enable user");
      }
    },

    async showAnonymizeModal(user) {
      this.userToAnonymize = user;
      this.anonymizeReason = "";
      this.anonymizeConfirm = "";
      this.reassignMerchantsTo = "";
      this.reassignMerchantsSearch = "";
      this.reassignUserOptions = [];

      // Check if user owns any merchants
      try {
        const headers = await this.getAuthHeaders();
        const res = await fetch(`${API_BASE}/admin/merchants?query=${user.id}`, { headers });
        if (res.ok) {
          const data = await res.json();
          this.userMerchants = (data.merchants || []).filter(m => m.ownerId === user.id);
        }
      } catch (err) {
        console.error("Failed to check user merchants:", err);
      }

      this.showAnonymizeModalFlag = true;
    },

    closeAnonymizeModal() {
      this.showAnonymizeModalFlag = false;
      this.userToAnonymize = null;
      this.userMerchants = [];
    },

    async searchReassignUsers() {
      if (this.reassignMerchantsSearch.length < 2) {
        this.reassignUserOptions = [];
        return;
      }
      try {
        const headers = await this.getAuthHeaders();
        const res = await fetch(`${API_BASE}/admin/users?query=${encodeURIComponent(this.reassignMerchantsSearch)}&limit=10`, { headers });
        if (res.ok) {
          const data = await res.json();
          this.reassignUserOptions = (data.users || []).filter(u => u.id !== this.userToAnonymize?.id && !u.deletedAt);
        }
      } catch (err) {
        console.error("searchReassignUsers error:", err);
      }
    },

    async confirmAnonymize() {
      if (this.anonymizeConfirm !== "ANONYMIZE") return;
      if (this.userMerchants.length > 0 && !this.reassignMerchantsTo) return;

      try {
        const headers = await this.getAuthHeaders();
        headers["Content-Type"] = "application/json";

        const body = { reason: this.anonymizeReason };
        if (this.reassignMerchantsTo) body.reassignMerchantsTo = this.reassignMerchantsTo;

        const res = await fetch(`${API_BASE}/admin/users/${this.userToAnonymize.id}/anonymize`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          alert(data.error || `Failed to anonymize user: ${res.status}`);
          return;
        }

        alert("User has been anonymized");
        this.closeAnonymizeModal();
        await this.searchUsers();
      } catch (err) {
        console.error("confirmAnonymize error:", err);
        alert("Failed to anonymize user");
      }
    },

    // ==================== MERCHANTS ====================
    async searchMerchants() {
      this.merchantsLoading = true;
      this.merchantsError = null;
      try {
        const headers = await this.getAuthHeaders();
        const params = new URLSearchParams();
        if (this.merchantSearch) params.set("query", this.merchantSearch);
        params.set("limit", "100");

        const res = await fetch(`${API_BASE}/admin/merchants?${params}`, { headers });
        if (!res.ok) throw new Error(`Failed to load merchants: ${res.status}`);
        const data = await res.json();
        this.merchants = data.merchants || [];
      } catch (err) {
        console.error("searchMerchants error:", err);
        this.merchantsError = err.message;
      } finally {
        this.merchantsLoading = false;
      }
    },

    async searchOwnerUsers() {
      if (this.ownerSearch.length < 2) {
        this.ownerUserOptions = [];
        return;
      }
      try {
        const headers = await this.getAuthHeaders();
        const res = await fetch(`${API_BASE}/admin/users?query=${encodeURIComponent(this.ownerSearch)}&limit=10`, { headers });
        if (res.ok) {
          const data = await res.json();
          this.ownerUserOptions = (data.users || []).filter(u => !u.deletedAt);
        }
      } catch (err) {
        console.error("searchOwnerUsers error:", err);
      }
    },

    async createMerchant() {
      try {
        const headers = await this.getAuthHeaders();
        headers["Content-Type"] = "application/json";

        const res = await fetch(`${API_BASE}/admin/merchants`, {
          method: "POST",
          headers,
          body: JSON.stringify(this.newMerchant),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          alert(data.error || `Failed to create merchant: ${res.status}`);
          return;
        }

        this.showCreateMerchantModal = false;
        this.newMerchant = { name: "", logoUrl: "", ownerId: "" };
        this.ownerSearch = "";
        this.ownerUserOptions = [];
        await this.searchMerchants();
      } catch (err) {
        console.error("createMerchant error:", err);
        alert("Failed to create merchant");
      }
    },

    editMerchant(merchant) {
      this.editingMerchant = { ...merchant, newOwnerId: "" };
      this.editOwnerSearch = "";
      this.editOwnerUserOptions = [];
      this.merchantAdmins = [];
      this.merchantAdminSearch = "";
      this.merchantAdminSearchResults = [];
      this.merchantAdminError = null;
      this.showEditMerchantModal = true;
      this.loadMerchantAdminsAdmin(merchant.id);
    },

    async loadMerchantAdminsAdmin(merchantId) {
      this.merchantAdminsLoading = true;
      try {
        const headers = await this.getAuthHeaders();
        const res = await fetch(`${API_BASE}/admin/merchants/${merchantId}/admins`, { headers });
        if (res.ok) {
          const data = await res.json();
          this.merchantAdmins = data.admins || [];
        }
      } catch (err) {
        console.error("loadMerchantAdminsAdmin error:", err);
      } finally {
        this.merchantAdminsLoading = false;
      }
    },

    async searchMerchantAdminUsers() {
      const q = this.merchantAdminSearch.trim();
      if (q.length < 2) {
        this.merchantAdminSearchResults = [];
        return;
      }
      this.merchantAdminSearchLoading = true;
      try {
        const headers = await this.getAuthHeaders();
        const res = await fetch(`${API_BASE}/admin/users?query=${encodeURIComponent(q)}&limit=10`, { headers });
        if (res.ok) {
          const data = await res.json();
          this.merchantAdminSearchResults = (data.users || []).filter((u) => !u.deletedAt);
        }
      } catch (err) {
        console.error("searchMerchantAdminUsers error:", err);
      } finally {
        this.merchantAdminSearchLoading = false;
      }
    },

    async addMerchantAdminAdmin(userId) {
      this.merchantAdminError = null;
      try {
        const headers = await this.getAuthHeaders();
        headers["Content-Type"] = "application/json";
        const res = await fetch(`${API_BASE}/admin/merchants/${this.editingMerchant.id}/admins`, {
          method: "POST",
          headers,
          body: JSON.stringify({ userId }),
        });
        if (res.ok) {
          await this.loadMerchantAdminsAdmin(this.editingMerchant.id);
          this.merchantAdminSearch = "";
          this.merchantAdminSearchResults = [];
          // Update count in merchant list
          const m = this.merchants.find((m) => m.id === this.editingMerchant.id);
          if (m) m.adminsCount = (m.adminsCount || 0) + 1;
        } else {
          const data = await res.json().catch(() => ({}));
          this.merchantAdminError = data.error || "Failed to add admin.";
        }
      } catch (err) {
        this.merchantAdminError = "Unexpected error.";
      }
    },

    async removeMerchantAdminAdmin(userId) {
      this.removingMerchantAdminId = userId;
      try {
        const headers = await this.getAuthHeaders();
        const res = await fetch(`${API_BASE}/admin/merchants/${this.editingMerchant.id}/admins/${userId}`, {
          method: "DELETE",
          headers,
        });
        if (res.ok) {
          await this.loadMerchantAdminsAdmin(this.editingMerchant.id);
          const m = this.merchants.find((m) => m.id === this.editingMerchant.id);
          if (m && m.adminsCount > 0) m.adminsCount -= 1;
        }
      } catch (err) {
        console.error("removeMerchantAdminAdmin error:", err);
      } finally {
        this.removingMerchantAdminId = null;
      }
    },

    async searchEditOwnerUsers() {
      if (this.editOwnerSearch.length < 2) {
        this.editOwnerUserOptions = [];
        return;
      }
      try {
        const headers = await this.getAuthHeaders();
        const res = await fetch(`${API_BASE}/admin/users?query=${encodeURIComponent(this.editOwnerSearch)}&limit=10`, { headers });
        if (res.ok) {
          const data = await res.json();
          this.editOwnerUserOptions = (data.users || []).filter(u => !u.deletedAt);
        }
      } catch (err) {
        console.error("searchEditOwnerUsers error:", err);
      }
    },

    async saveMerchant() {
      try {
        const headers = await this.getAuthHeaders();
        headers["Content-Type"] = "application/json";

        const body = {
          name: this.editingMerchant.name,
          logoUrl: this.editingMerchant.logoUrl,
        };
        if (this.editingMerchant.newOwnerId) {
          body.ownerId = this.editingMerchant.newOwnerId;
        }

        const res = await fetch(`${API_BASE}/admin/merchants/${this.editingMerchant.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          alert(data.error || `Failed to update merchant: ${res.status}`);
          return;
        }

        this.showEditMerchantModal = false;
        await this.searchMerchants();
      } catch (err) {
        console.error("saveMerchant error:", err);
        alert("Failed to save merchant");
      }
    },

    // ==================== GROUPS ====================
    async searchGroups() {
      this.groupsLoading = true;
      this.groupsError = null;
      try {
        const headers = await this.getAuthHeaders();
        const params = new URLSearchParams();
        if (this.groupSearch) params.set("query", this.groupSearch);
        params.set("limit", "100");

        const res = await fetch(`${API_BASE}/admin/groups?${params}`, { headers });
        if (!res.ok) throw new Error(`Failed to load groups: ${res.status}`);
        const data = await res.json();
        this.groups = data.groups || [];
      } catch (err) {
        console.error("searchGroups error:", err);
        this.groupsError = err.message;
      } finally {
        this.groupsLoading = false;
      }
    },

    async createGroup() {
      try {
        const headers = await this.getAuthHeaders();
        headers["Content-Type"] = "application/json";

        const res = await fetch(`${API_BASE}/admin/groups`, {
          method: "POST",
          headers,
          body: JSON.stringify(this.newGroup),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          alert(data.error || `Failed to create group: ${res.status}`);
          return;
        }

        this.showCreateGroupModal = false;
        this.newGroup = { name: "", slug: "", description: "", location: "" };
        await this.searchGroups();
      } catch (err) {
        console.error("createGroup error:", err);
        alert("Failed to create group");
      }
    },

    editGroup(group) {
      this.editingGroup = { ...group };
      this.showEditGroupModal = true;
    },

    async saveGroup() {
      try {
        const headers = await this.getAuthHeaders();
        headers["Content-Type"] = "application/json";

        const res = await fetch(`${API_BASE}/admin/groups/${this.editingGroup.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            name: this.editingGroup.name,
            description: this.editingGroup.description,
            location: this.editingGroup.location,
            bannerImageUrl: this.editingGroup.bannerImageUrl,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          alert(data.error || `Failed to update group: ${res.status}`);
          return;
        }

        this.showEditGroupModal = false;
        await this.searchGroups();
      } catch (err) {
        console.error("saveGroup error:", err);
        alert("Failed to save group");
      }
    },

    async manageGroupAdmins(group) {
      this.selectedGroupForAdmins = group;
      this.groupAdmins = [];
      this.newAdminSearch = "";
      this.newAdminUserOptions = [];
      this.newAdminUserId = "";
      this.showGroupAdminsModal = true;
      await this.loadGroupAdmins();
    },

    async loadGroupAdmins() {
      this.groupAdminsLoading = true;
      try {
        const headers = await this.getAuthHeaders();
        const res = await fetch(`${API_BASE}/admin/groups/${this.selectedGroupForAdmins.id}/admins`, { headers });
        if (res.ok) {
          const data = await res.json();
          this.groupAdmins = data.admins || [];
        }
      } catch (err) {
        console.error("loadGroupAdmins error:", err);
      } finally {
        this.groupAdminsLoading = false;
      }
    },

    async searchNewAdminUsers() {
      if (this.newAdminSearch.length < 2) {
        this.newAdminUserOptions = [];
        return;
      }
      try {
        const headers = await this.getAuthHeaders();
        const res = await fetch(`${API_BASE}/admin/users?query=${encodeURIComponent(this.newAdminSearch)}&limit=10`, { headers });
        if (res.ok) {
          const data = await res.json();
          const existingAdminIds = this.groupAdmins.map(a => a.userId);
          this.newAdminUserOptions = (data.users || []).filter(u => !u.deletedAt && !existingAdminIds.includes(u.id));
        }
      } catch (err) {
        console.error("searchNewAdminUsers error:", err);
      }
    },

    async addGroupAdmin() {
      if (!this.newAdminUserId) return;
      try {
        const headers = await this.getAuthHeaders();
        headers["Content-Type"] = "application/json";

        const res = await fetch(`${API_BASE}/admin/groups/${this.selectedGroupForAdmins.id}/admins`, {
          method: "POST",
          headers,
          body: JSON.stringify({ userId: this.newAdminUserId }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          alert(data.error || `Failed to add admin: ${res.status}`);
          return;
        }

        this.newAdminUserId = "";
        this.newAdminSearch = "";
        this.newAdminUserOptions = [];
        await this.loadGroupAdmins();
      } catch (err) {
        console.error("addGroupAdmin error:", err);
        alert("Failed to add admin");
      }
    },

    async removeGroupAdmin(admin) {
      if (!confirm(`Remove ${admin.userName} as admin?`)) return;
      try {
        const headers = await this.getAuthHeaders();
        const res = await fetch(`${API_BASE}/admin/groups/${this.selectedGroupForAdmins.id}/admins/${admin.membershipId}`, {
          method: "DELETE",
          headers,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          alert(data.error || `Failed to remove admin: ${res.status}`);
          return;
        }

        await this.loadGroupAdmins();
      } catch (err) {
        console.error("removeGroupAdmin error:", err);
        alert("Failed to remove admin");
      }
    },

    // ==================== PAYMENTS ====================
    async loadPaymentsOverview() {
      this.paymentsLoading = true;
      this.paymentsError = null;
      try {
        const headers = await this.getAuthHeaders();
        const params = new URLSearchParams();
        if (this.paymentDateFrom) params.set("from", this.paymentDateFrom);
        if (this.paymentDateTo) params.set("to", this.paymentDateTo);

        const res = await fetch(`${API_BASE}/admin/payments/overview?${params}`, { headers });
        if (!res.ok) throw new Error(`Failed to load payments: ${res.status}`);
        this.paymentsOverview = await res.json();
      } catch (err) {
        console.error("loadPaymentsOverview error:", err);
        this.paymentsError = err.message;
      } finally {
        this.paymentsLoading = false;
      }
    },

    async loadPurchases() {
      try {
        const headers = await this.getAuthHeaders();
        const params = new URLSearchParams();
        if (this.paymentDateFrom) params.set("from", this.paymentDateFrom);
        if (this.paymentDateTo) params.set("to", this.paymentDateTo);
        params.set("limit", "50");

        const res = await fetch(`${API_BASE}/admin/purchases?${params}`, { headers });
        if (res.ok) {
          const data = await res.json();
          this.purchases = data.purchases || [];
        }
      } catch (err) {
        console.error("loadPurchases error:", err);
      }
    },

    // ─────────────────────────────────────────────────────────────
    // TAB NAVIGATION FROM OVERVIEW
    // ─────────────────────────────────────────────────────────────
    goToTab(tabId) {
      this.activeTab = tabId;
      // Trigger data load for the tab if needed
      if (tabId === 'users' && this.users.length === 0) {
        this.searchUsers();
      } else if (tabId === 'merchants' && this.merchants.length === 0) {
        this.searchMerchants();
      } else if (tabId === 'groups' && this.groups.length === 0) {
        this.searchGroups();
      } else if (tabId === 'payments' && this.purchases.length === 0) {
        this.loadPurchases();
      } else if (tabId === 'events' && this.adminEvents.length === 0) {
        Promise.all([this.loadAdminEvents(), this.loadRecentRsvps(), this.loadAdminEventSubmissions()]);
      }
    },

    // ─────────────────────────────────────────────────────────────
    // COUPONS MODAL
    // ─────────────────────────────────────────────────────────────
    viewCoupons() {
      this.showCouponsModal = true;
      this.loadCoupons();
    },

    async loadCoupons() {
      this.couponsLoading = true;
      try {
        const headers = await this.getAuthHeaders();
        const params = new URLSearchParams();
        if (this.couponSearch) params.set("query", this.couponSearch);
        const res = await fetch(`${API_BASE}/admin/coupons?${params}`, { headers });
        if (!res.ok) throw new Error("Failed to load coupons");
        const data = await res.json();
        this.coupons = data.coupons || [];
      } catch (err) {
        console.error("Failed to load coupons:", err);
        this.coupons = [];
      } finally {
        this.couponsLoading = false;
      }
    },

    // ─────────────────────────────────────────────────────────────
    // PENDING SUBMISSIONS
    // ─────────────────────────────────────────────────────────────
    viewPendingSubmissions() {
      this.showSubmissionsModal = true;
      this.loadPendingSubmissions();
    },

    async loadPendingSubmissions() {
      this.submissionsLoading = true;
      try {
        const headers = await this.getAuthHeaders();
        const res = await fetch(`${API_BASE}/admin/submissions?state=pending`, { headers });
        if (!res.ok) throw new Error("Failed to load submissions");
        const data = await res.json();
        this.pendingSubmissions = data.submissions || [];
      } catch (err) {
        console.error("Failed to load pending submissions:", err);
        this.pendingSubmissions = [];
      } finally {
        this.submissionsLoading = false;
      }
    },

    // ─────────────────────────────────────────────────────────────
    // COUPONS TAB
    // ─────────────────────────────────────────────────────────────
    switchCouponsTabView(view) {
      this.couponsTabView = view;
      this.loadCouponsTab();
    },

    async loadCouponsTab() {
      this.couponsTabLoading = true;
      this.couponsTabError = null;
      try {
        const headers = await this.getAuthHeaders();

        if (this.couponsTabView === 'pending') {
          const res = await fetch(`${API_BASE}/admin/submissions?state=pending`, { headers });
          if (!res.ok) throw new Error('Failed to load pending submissions');
          const data = await res.json();
          this.couponsTabPending = data.submissions || [];
        } else if (this.couponsTabView === 'approved') {
          const res = await fetch(`${API_BASE}/admin/coupons`, { headers });
          if (!res.ok) throw new Error('Failed to load approved coupons');
          const data = await res.json();
          this.couponsTabApproved = data.coupons || [];
        } else if (this.couponsTabView === 'rejected') {
          const res = await fetch(`${API_BASE}/admin/submissions?state=rejected`, { headers });
          if (!res.ok) throw new Error('Failed to load rejected submissions');
          const data = await res.json();
          this.couponsTabRejected = data.submissions || [];
        }
      } catch (err) {
        console.error('Coupons tab load error:', err);
        this.couponsTabError = err.message;
      } finally {
        this.couponsTabLoading = false;
      }
    },

    async adminApproveSub(sub) {
      if (!confirm('Approve this submission?')) return;
      try {
        const headers = await this.getAuthHeaders();
        const res = await fetch(`${API_BASE}/coupon-submissions/${sub.id}`, {
          method: 'PUT',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: 'approved' }),
        });
        if (!res.ok) throw new Error('Approval failed');
        this.couponsTabPending = this.couponsTabPending.filter(s => s.id !== sub.id);
      } catch (err) {
        alert('Failed to approve: ' + err.message);
      }
    },

    async adminRejectSub(sub) {
      const reason = prompt('Rejection reason:');
      if (reason === null) return;
      try {
        const headers = await this.getAuthHeaders();
        const res = await fetch(`${API_BASE}/coupon-submissions/${sub.id}`, {
          method: 'PUT',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: 'rejected', message: reason }),
        });
        if (!res.ok) throw new Error('Rejection failed');
        this.couponsTabPending = this.couponsTabPending.filter(s => s.id !== sub.id);
      } catch (err) {
        alert('Failed to reject: ' + err.message);
      }
    },

    openEditCouponModal(coupon) {
      this.editCouponModal = coupon;
      this.editCouponForm = {
        title: coupon.title,
        description: coupon.description,
        couponType: coupon.couponType || coupon.coupon_type,
        discountValue: coupon.discountValue || coupon.discount_value,
        validFrom: (coupon.validFrom || coupon.valid_from || '').slice(0, 10),
        expiresAt: (coupon.expiresAt || coupon.expires_at || '').slice(0, 10),
        locked: coupon.locked,
      };
    },

    async saveEditCoupon() {
      this.editCouponSaving = true;
      try {
        const headers = await this.getAuthHeaders();
        const res = await fetch(`${API_BASE}/coupons/${this.editCouponModal.id}`, {
          method: 'PATCH',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(this.editCouponForm),
        });
        if (!res.ok) throw new Error('Failed to save coupon');
        const updated = await res.json();
        const idx = this.couponsTabApproved.findIndex(c => c.id === this.editCouponModal.id);
        if (idx !== -1) {
          this.couponsTabApproved[idx] = { ...this.couponsTabApproved[idx], ...updated };
        }
        this.editCouponModal = null;
      } catch (err) {
        alert('Failed to save: ' + err.message);
      } finally {
        this.editCouponSaving = false;
      }
    },

    async removeCoupon(coupon) {
      if (!confirm(`Remove coupon "${coupon.title}"? This will permanently delete it.`)) return;
      try {
        const headers = await this.getAuthHeaders();
        const res = await fetch(`${API_BASE}/coupons/${coupon.id}`, {
          method: 'DELETE',
          headers,
        });
        if (!res.ok) throw new Error('Failed to remove coupon');
        this.couponsTabApproved = this.couponsTabApproved.filter(c => c.id !== coupon.id);
      } catch (err) {
        alert('Failed to remove coupon: ' + err.message);
      }
    },

    // ─────────────────────────────────────────────────────────────
    // PAYMENT EVENTS
    // ─────────────────────────────────────────────────────────────
    viewPaymentEvents() {
      this.showPaymentEventsModal = true;
      this.loadPaymentEvents();
    },

    async loadPaymentEvents() {
      this.paymentEventsLoading = true;
      try {
        const headers = await this.getAuthHeaders();
        const params = new URLSearchParams();
        if (this.showUnprocessedOnly) params.set("unprocessed", "true");
        if (this.showFailedOnly) params.set("failed", "true");
        params.set("limit", "50");

        const res = await fetch(`${API_BASE}/admin/payment-events?${params}`, { headers });
        if (res.ok) {
          const data = await res.json();
          this.paymentEvents = data.events || [];
        }
      } catch (err) {
        console.error("loadPaymentEvents error:", err);
      } finally {
        this.paymentEventsLoading = false;
      }
    },

    async reprocessEvent(event) {
      if (!confirm("Reprocess this payment event?")) return;
      try {
        const headers = await this.getAuthHeaders();
        const res = await fetch(`${API_BASE}/admin/payment-events/${event.id}/reprocess`, {
          method: "POST",
          headers,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          alert(data.error || `Failed to reprocess: ${res.status}`);
          return;
        }

        alert("Event marked for reprocessing");
        await this.loadPaymentEvents();
      } catch (err) {
        console.error("reprocessEvent error:", err);
        alert("Failed to reprocess event");
      }
    },

    // ==================== EVENTS TAB ====================
    async loadAdminEvents() {
      this.eventsLoading = true;
      this.eventsError = null;
      this.selectedAdminEventId = null;
      this.adminEventAttendees = [];
      try {
        const headers = await this.getAuthHeaders();
        const params = new URLSearchParams();
        if (this.eventsSearch) params.set('search', this.eventsSearch);
        const res = await fetch(`${API_BASE}/admin/events${params.toString() ? '?' + params : ''}`, { headers });
        if (!res.ok) throw new Error(`Failed to load events: ${res.status}`);
        this.adminEvents = await res.json();
      } catch (err) {
        console.error('loadAdminEvents error:', err);
        this.eventsError = err.message || 'Could not load events.';
      } finally {
        this.eventsLoading = false;
      }
    },

    async switchEventsTabView(view) {
      this.eventsTabView = view;
      if (view === 'published' && this.adminEvents.length === 0) {
        await this.loadAdminEvents();
      } else if ((view === 'pending' || view === 'rejected') && this.adminEventSubsPending.length === 0 && this.adminEventSubsRejected.length === 0) {
        await this.loadAdminEventSubmissions();
      }
    },

    async loadAdminEventSubmissions() {
      this.adminEventSubsLoading = true;
      this.adminEventSubsError = null;
      try {
        const headers = await this.getAuthHeaders();
        const [pendingRes, rejectedRes] = await Promise.all([
          fetch(`${API_BASE}/admin/event-submissions?state=pending`, { headers }),
          fetch(`${API_BASE}/admin/event-submissions?state=rejected`, { headers }),
        ]);
        if (!pendingRes.ok) throw new Error(`Failed to load pending event submissions: ${pendingRes.status}`);
        if (!rejectedRes.ok) throw new Error(`Failed to load rejected event submissions: ${rejectedRes.status}`);
        this.adminEventSubsPending = await pendingRes.json();
        this.adminEventSubsRejected = await rejectedRes.json();
      } catch (err) {
        console.error('loadAdminEventSubmissions error:', err);
        this.adminEventSubsError = err.message || 'Could not load event submissions.';
      } finally {
        this.adminEventSubsLoading = false;
      }
    },

    async loadRecentRsvps() {
      this.recentRsvpsLoading = true;
      this.recentRsvpsError = null;
      try {
        const headers = await this.getAuthHeaders();
        const res = await fetch(`${API_BASE}/admin/rsvps/recent`, { headers });
        if (!res.ok) throw new Error(`Failed to load recent RSVPs: ${res.status}`);
        this.recentRsvps = await res.json();
      } catch (err) {
        console.error('loadRecentRsvps error:', err);
        this.recentRsvpsError = err.message || 'Could not load recent RSVPs.';
      } finally {
        this.recentRsvpsLoading = false;
      }
    },

    async loadAdminEventAttendees(eventId) {
      this.selectedAdminEventId = eventId;
      this.adminAttendeesLoading = true;
      this.adminAttendeesError = null;
      this.adminEventAttendees = [];
      try {
        const headers = await this.getAuthHeaders();
        const res = await fetch(`${API_BASE}/events/${eventId}/attendees`, { headers });
        if (!res.ok) throw new Error(`Failed to load attendees: ${res.status}`);
        this.adminEventAttendees = await res.json();
      } catch (err) {
        console.error('loadAdminEventAttendees error:', err);
        this.adminAttendeesError = err.message || 'Could not load attendees.';
      } finally {
        this.adminAttendeesLoading = false;
      }
    },

    async adminPromoteAttendee(attendee) {
      try {
        const headers = await this.getAuthHeaders();
        const res = await fetch(`${API_BASE}/events/${this.selectedAdminEventId}/rsvp/${attendee.id}/promote`, {
          method: 'POST', headers,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Failed: ${res.status}`);
        }
        await this.loadAdminEventAttendees(this.selectedAdminEventId);
      } catch (err) {
        this.adminAttendeesError = err.message || 'Could not promote attendee.';
      }
    },

    async adminCancelAttendee(attendee) {
      try {
        const headers = await this.getAuthHeaders();
        const res = await fetch(`${API_BASE}/events/${this.selectedAdminEventId}/rsvp/${attendee.id}/cancel`, {
          method: 'POST',
          headers,
        });
        if (!res.ok) throw new Error(`Cancel failed: ${res.status}`);
        await this.loadAdminEventAttendees(this.selectedAdminEventId);
      } catch (err) {
        this.adminAttendeesError = err.message || 'Could not cancel attendee.';
      }
    },

    async adminCheckIn(attendee) {
      try {
        const headers = await this.getAuthHeaders();
        const res = await fetch(`${API_BASE}/events/${this.selectedAdminEventId}/rsvp/${attendee.id}/status`, {
          method: 'PATCH',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'checked_in' }),
        });
        if (!res.ok) throw new Error(`Check-in failed: ${res.status}`);
        await this.loadAdminEventAttendees(this.selectedAdminEventId);
      } catch (err) {
        this.adminAttendeesError = err.message || 'Could not check in attendee.';
      }
    },

    async adminNoShow(attendee) {
      try {
        const headers = await this.getAuthHeaders();
        const res = await fetch(`${API_BASE}/events/${this.selectedAdminEventId}/rsvp/${attendee.id}/status`, {
          method: 'PATCH',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'no_show' }),
        });
        if (!res.ok) throw new Error(`No-show failed: ${res.status}`);
        await this.loadAdminEventAttendees(this.selectedAdminEventId);
      } catch (err) {
        this.adminAttendeesError = err.message || 'Could not mark no-show.';
      }
    },

    // ==================== UTILITIES ====================
    formatDate(dateStr) {
      if (!dateStr) return "-";
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return "-";
      return d.toLocaleDateString();
    },

    formatCurrency(cents) {
      return `$${(cents / 100).toFixed(2)}`;
    },

    getStatusClass(status) {
      switch (status) {
        case "paid": return "success";
        case "pending": return "warning";
        case "refunded": return "info";
        case "expired":
        case "failed": return "error";
        default: return "";
      }
    },
  },
};
</script>

<style scoped>
.super-admin-dashboard {
  padding: var(--spacing-2xl);
  max-width: var(--container-xl);
  margin: 0 auto;
}

@media (max-width: 768px) {
  .super-admin-dashboard {
    padding: var(--spacing-lg);
  }
}

.profile-header {
  text-align: center;
  margin-bottom: var(--spacing-2xl);
}

.user-context {
  padding: var(--spacing-md) var(--spacing-lg);
  border-radius: var(--radius-full);
  background: var(--color-bg-muted, #e9ecef);
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-xs);
  font-size: var(--font-size-sm);
  margin-top: var(--spacing-md);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.06);
}

.user-name {
  font-weight: var(--font-weight-semibold);
  font-size: var(--font-size-base);
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
  color: var(--color-text-primary);
}

.signin-card,
.access-check-card,
.access-denied-card {
  text-align: center;
  max-width: 500px;
  margin: var(--spacing-3xl) auto;
}

.subtitle {
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-lg);
}

/* Tab Navigation */
.tab-nav {
  display: flex;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-xl);
  flex-wrap: wrap;
  border-bottom: 1px solid var(--color-border);
  padding-bottom: var(--spacing-sm);
}

.tab-btn {
  padding: var(--spacing-sm) var(--spacing-lg);
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  transition: all var(--transition-base);
}

.tab-btn:hover {
  background: var(--color-bg-muted);
  color: var(--color-text-primary);
}

.tab-btn.active {
  background: var(--color-primary);
  color: var(--color-text-on-primary);
}

/* Dashboard Section */
.dashboard-section {
  background: var(--color-bg-secondary, #f8f9fa);
  padding: var(--spacing-lg);
  border-radius: var(--radius-lg);
  margin-bottom: var(--spacing-xl);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.dashboard-section h2 {
  margin-bottom: var(--spacing-lg);
  color: var(--color-text-primary);
}

.dashboard-section h3 {
  margin-bottom: var(--spacing-md);
  color: var(--color-text-primary);
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  grid-auto-flow: dense;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-xl);
}

.stat-card {
  background: var(--color-bg-primary, #fff);
  padding: var(--spacing-md);
  border-radius: var(--radius-md);
  text-align: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  position: relative;
}

.stat-card.clickable {
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
}

.stat-card.clickable:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
}

.stat-hint {
  display: block;
  font-size: var(--font-size-xs);
  color: var(--color-primary, #007bff);
  margin-top: var(--spacing-xs);
  opacity: 0.8;
}

.stat-card.wide {
  grid-column: span 2;
}

.stat-label {
  display: block;
  font-size: var(--font-size-sm, 0.875rem);
  font-weight: var(--font-weight-medium, 500);
  color: var(--color-text-secondary, #6c757d);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stat-value {
  display: block;
  font-size: var(--font-size-2xl, 1.75rem);
  font-weight: var(--font-weight-bold, 700);
  color: var(--color-text-primary);
  line-height: 1.2;
  margin: var(--spacing-xs) 0;
}

.stat-value.highlight-success {
  color: var(--color-success, #28a745);
}

.stat-value.highlight-warning {
  color: var(--color-warning, #ffc107);
}

/* Highlight the pending submissions card */
.stat-card:has(.highlight-warning) {
  border-left: 3px solid var(--color-warning, #ffc107);
}

/* Highlight success cards */
.stat-card:has(.highlight-success) {
  border-left: 3px solid var(--color-success, #28a745);
}

/* Health Section */
.health-section {
  background: var(--color-bg-primary);
  padding: var(--spacing-md);
  border-radius: var(--radius-md);
  margin-top: var(--spacing-lg);
}

.health-indicators {
  display: flex;
  gap: var(--spacing-lg);
  flex-wrap: wrap;
}

.health-item {
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
  background: var(--color-bg-muted);
}

.health-item.warning {
  background: var(--color-warning-bg, rgba(255, 193, 7, 0.1));
}

.health-item.error {
  background: var(--color-error-bg, rgba(244, 67, 54, 0.1));
}

.health-label {
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
}

.health-value {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
}

/* Search Bar */
.search-bar {
  display: flex;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-lg);
  flex-wrap: wrap;
  align-items: center;
}

.search-bar input[type="text"] {
  flex: 1;
  min-width: 200px;
  padding: var(--spacing-sm);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--font-size-base);
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  cursor: pointer;
}

/* Section Actions */
.section-actions {
  margin-bottom: var(--spacing-lg);
}

/* Date Filters */
.date-filters {
  display: flex;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-lg);
  flex-wrap: wrap;
  align-items: flex-end;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.form-group.inline {
  flex-direction: row;
  align-items: center;
}

.form-group label {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.form-group input,
.form-group textarea,
.form-group select {
  padding: var(--spacing-sm);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--font-size-base);
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
}

.form-group textarea {
  min-height: 80px;
  resize: vertical;
}

/* Data Table */
.data-table-container {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-sm);
}

.data-table th,
.data-table td {
  padding: var(--spacing-sm) var(--spacing-md);
  text-align: left;
  border-bottom: 1px solid var(--color-border);
}

.data-table th {
  background: var(--color-bg-subtle);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-secondary);
}

.data-table tr:hover {
  background: var(--color-bg-subtle);
}

.data-table tr.row-disabled {
  opacity: 0.6;
}

.actions-cell {
  display: flex;
  gap: var(--spacing-xs);
  flex-wrap: wrap;
}

.role-select {
  padding: var(--spacing-xs) var(--spacing-sm);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  background: var(--color-bg-surface);
}

.status-badge {
  display: inline-block;
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
}

.status-badge.active,
.status-badge.success {
  background: var(--color-success-bg, rgba(76, 175, 80, 0.1));
  color: var(--color-success);
}

.status-badge.disabled,
.status-badge.error {
  background: var(--color-error-bg, rgba(244, 67, 54, 0.1));
  color: var(--color-error);
}

.status-badge.warning {
  background: var(--color-warning-bg, rgba(255, 193, 7, 0.1));
  color: var(--color-warning);
}

.status-badge.info {
  background: var(--color-info-bg, rgba(33, 150, 243, 0.1));
  color: var(--color-info, #2196F3);
}

.empty-state {
  text-align: center;
  color: var(--color-text-muted);
  padding: var(--spacing-xl) !important;
}

/* Buttons */
.btn {
  padding: var(--spacing-sm) var(--spacing-lg);
  border-radius: var(--radius-md);
  border: none;
  cursor: pointer;
  font-size: var(--font-size-sm);
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

.btn.secondary {
  background: var(--color-bg-muted);
  color: var(--color-text-primary);
}

.btn.secondary:hover:not(:disabled) {
  background: var(--color-bg-subtle);
}

.btn.danger {
  background: var(--color-error);
  color: white;
}

.btn.danger:hover:not(:disabled) {
  background: var(--color-error-hover, #c62828);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-action {
  padding: var(--spacing-xs) var(--spacing-sm);
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: var(--font-size-xs);
  background: var(--color-bg-subtle);
  color: var(--color-text-primary);
  transition: all var(--transition-fast);
}

.btn-action:hover {
  background: var(--color-primary);
  color: var(--color-text-on-primary);
}

.btn-action.warning {
  background: var(--color-warning-bg, rgba(255, 193, 7, 0.2));
  color: var(--color-warning);
}

.btn-action.warning:hover {
  background: var(--color-warning);
  color: white;
}

.btn-action.success {
  background: var(--color-success-bg, rgba(76, 175, 80, 0.2));
  color: var(--color-success);
}

.btn-action.success:hover {
  background: var(--color-success);
  color: white;
}

.btn-action.danger {
  background: var(--color-error-bg, rgba(244, 67, 54, 0.2));
  color: var(--color-error);
}

.btn-action.danger:hover {
  background: var(--color-error);
  color: white;
}

.btn-action.primary {
  background: var(--color-primary, #f2542d);
  color: var(--color-text-on-primary, #ffffff);
}

.btn-action.primary:hover {
  background: var(--color-primary-hover, #f76a43);
  color: var(--color-text-on-primary, #ffffff);
}

.btn-action.small {
  padding: 2px 8px;
  font-size: 0.8em;
}

/* Grant-access modal */
.radio-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs, 0.25rem);
  margin-top: var(--spacing-xs, 0.25rem);
}

.radio-option {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm, 0.5rem);
  cursor: pointer;
}

.date-input {
  margin-top: var(--spacing-sm, 0.5rem);
  padding: var(--spacing-xs, 0.25rem) var(--spacing-sm, 0.5rem);
}

.grant-list-section {
  margin-top: var(--spacing-lg, 1rem);
  padding-top: var(--spacing-md, 0.75rem);
  border-top: 1px solid var(--color-border, #333);
}

.grant-list-section h3 {
  font-size: var(--font-size-base, 1rem);
  margin-bottom: var(--spacing-sm, 0.5rem);
}

.grant-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs, 0.25rem);
}

.grant-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-sm, 0.5rem);
  background: var(--color-bg-muted, rgba(255, 255, 255, 0.05));
  border-radius: var(--radius-sm, 4px);
}

.grant-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* Loading / Error States */
.loading-state,
.error-state {
  padding: var(--spacing-xl);
  text-align: center;
}

.error-state {
  color: var(--color-error);
}

.error-text {
  color: var(--color-error);
}

.warning-text {
  color: var(--color-warning, #dc3545);
  font-weight: 500;
}

.info-text {
  color: var(--color-text-secondary, #6c757d);
  font-size: var(--font-size-sm);
  margin: var(--spacing-md) 0;
}

.muted {
  color: var(--color-text-muted);
}

.tiny {
  font-size: var(--font-size-xs);
}

/* Modal Specific */
.modal-user-info {
  background: var(--color-bg-muted);
  padding: var(--spacing-md);
  border-radius: var(--radius-md);
  margin: var(--spacing-md) 0;
}

.modal-user-info p {
  margin: var(--spacing-xs) 0;
}

.merchant-warning {
  background: var(--color-warning-bg, rgba(255, 193, 7, 0.1));
  padding: var(--spacing-md);
  border-radius: var(--radius-md);
  margin: var(--spacing-md) 0;
}

.merchant-warning ul {
  margin: var(--spacing-sm) 0;
  padding-left: var(--spacing-lg);
}

.confirm-label {
  font-weight: var(--font-weight-semibold);
}

.modal-actions {
  display: flex;
  gap: var(--spacing-md);
  justify-content: flex-end;
  margin-top: var(--spacing-xl);
}

.admin-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.admin-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-sm) 0;
  border-bottom: 1px solid var(--color-border);
}

.admin-item:last-child {
  border-bottom: none;
}

code {
  background: var(--color-bg-subtle);
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
}

/* Submissions modal */
.submissions-list,
.coupons-list {
  max-height: 400px;
  overflow-y: auto;
}

.group-link {
  color: var(--color-primary);
  text-decoration: none;
}

.group-link:hover {
  text-decoration: underline;
}

/* Status badges */
.status-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  font-weight: 500;
}

.status-badge.active {
  background: var(--color-success-light, #d4edda);
  color: var(--color-success, #28a745);
}

.status-badge.inactive {
  background: var(--color-bg-subtle);
  color: var(--color-text-muted);
}

/* Event status badges */
.status-badge.published {
  background: var(--color-success-light, #d4edda);
  color: var(--color-success, #28a745);
}

/* RSVP status badges */
.status-badge.going,
.status-badge.checked_in {
  background: var(--color-success-light, #d4edda);
  color: var(--color-success, #28a745);
}

.status-badge.waitlist {
  background: rgba(255, 193, 7, 0.15);
  color: var(--color-warning, #856404);
}

.status-badge.cancelled {
  background: var(--color-error-bg, rgba(244, 67, 54, 0.1));
  color: var(--color-error, #dc3545);
}

.status-badge.pending {
  background: rgba(33, 150, 243, 0.1);
  color: var(--color-info, #2196F3);
}

/* Compact search bar for modals */
.search-bar.compact {
  margin-bottom: var(--spacing-md);
  gap: var(--spacing-sm);
}

.search-bar.compact input {
  flex: 1;
}

.btn.sm {
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: var(--font-size-sm);
}

/* Sub-tab navigation (for Coupons tab) */
.sub-tab-nav {
  display: flex;
  gap: var(--spacing-xs);
  margin-bottom: var(--spacing-lg);
  flex-wrap: wrap;
}

.coupon-redemptions-panel {
  margin-bottom: var(--spacing-xl);
}

.details-header {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
}

.sub-tab-btn {
  padding: var(--spacing-xs) var(--spacing-md);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md);
  background: var(--color-bg-surface);
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: var(--font-size-sm);
  transition: all var(--transition-base);
}

.sub-tab-btn.active {
  background: var(--color-primary);
  color: var(--color-text-on-primary);
  border-color: var(--color-primary);
}

.sub-tab-btn:hover:not(.active) {
  background: var(--color-bg-secondary);
}

.action-cell {
  display: flex;
  gap: var(--spacing-xs);
  flex-wrap: wrap;
}

.btn.compact {
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: var(--font-size-xs);
  min-height: unset;
}

.btn.danger {
  background: var(--color-error);
  color: var(--color-text-on-error);
}

.btn.danger:hover {
  background: var(--color-error-hover);
}

.empty-state {
  text-align: center;
  color: var(--color-text-muted);
  font-style: italic;
  padding: var(--spacing-xl);
}

.form-grid {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.form-grid label {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
}

.form-input {
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md);
  font-size: var(--font-size-base);
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
}

.checkbox-label {
  flex-direction: row !important;
  align-items: center;
  gap: var(--spacing-sm) !important;
}

.modal-actions {
  display: flex;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}
</style>
