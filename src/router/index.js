// src/router/index.js
import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'
import CouponBook from '../views/CouponBook.vue'
import EventPage from '../views/EventPage.vue'
import FoodieGroupView from '../views/FoodieGroup.vue'
import FoodieGroupList from '../views/FoodieGroupList.vue'
import Profile from '../views/Profile.vue'
import AuthCallback from '@/views/AuthCallback.vue'
import CouponSubmissions from '@/views/CouponSubmissions.vue'
import CheckoutSuccess from '@/views/CheckoutSuccess.vue'
import EventSubmissions from '@/views/EventSubmissions.vue'
import EventDetail from '@/views/EventDetail.vue'
import EventGuestCancel from '@/views/EventGuestCancel.vue'

// Import dashboards directly from their component paths:
import FoodieGroupDashboard from '../components/Dashboard/FoodieGroupDashboard.vue'
import SuperAdminDashboard from '../components/Dashboard/SuperAdminDashboard.vue'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: Home
  },
  {
    path: '/coupon-book',
    name: 'CouponBook',
    component: CouponBook
  },
  {
    path: '/events',
    name: 'EventPage',
    component: EventPage
  },
  {
    path: '/events/:id',
    name: 'EventDetail',
    component: EventDetail,
    props: true
  },
  {
    path: '/events/:id/cancel',
    name: 'EventGuestCancel',
    component: EventGuestCancel,
    props: true
  },
  {
    path: '/e/:slug',
    name: 'EventDetailSlug',
    component: EventDetail,
    props: true
  },
  {
    path: '/event-submissions',
    name: 'EventSubmissions',
    component: EventSubmissions
  },
  {
    path: '/event-submissions/:id/edit',
    name: 'EditEventSubmission',
    component: EventSubmissions,
    props: true
  },
  {
    path: '/coupon/redeem/:id',
    name: 'CouponRedeemPopup',
    component: () => import('@/components/Coupons/CouponRedeemPopup.vue')
  },
  {
    path: '/foodie-group/:id',
    name: 'FoodieGroupView',
    component: FoodieGroupView,
    props: true
  },
  {
    path: '/checkout/success/:groupSlug',
    name: 'CheckoutSuccess',
    component: CheckoutSuccess,
    props: true
  },
  {
    path: '/checkin/:id',
    name: 'EventCheckin',
    component: () => import('@/views/EventCheckin.vue'),
    props: true
  },
  {
    path: '/foodie-groups',
    name: 'FoodieGroupList',
    component: FoodieGroupList
  },
  {
    path: '/profile',
    name: 'Profile',
    component: Profile
  },
  { path: '/callback',
    name: 'AuthCallback',
    component: AuthCallback
  },
  // Public coupon-first merchant onboarding — one form, no login.
  {
    path: '/join',
    name: 'JoinTheBook',
    component: () => import('@/views/JoinTheBook.vue')
  },
  // Consumer-UI design prototype (three directions, real coupon data).
  // meta.bare hides the site header/footer so it reads as a real mobile app.
  {
    path: '/ui-preview',
    name: 'UiPreview',
    component: () => import('@/views/UiPreview.vue'),
    meta: { bare: true }
  },
  // Dashboard routes (for testing purposes)
  {
    path: '/dashboard/foodie-group',
    redirect: '/profile'
  },
  {
    path: '/dashboard/foodie-group/:groupId',
    name: 'FoodieGroupDashboard',
    component: FoodieGroupDashboard,
    props: true
  },
  {
    path: '/dashboard/super-admin',
    name: 'SuperAdminDashboard',
    component: SuperAdminDashboard
  },
  {
    path: '/submissions',
    name: 'CouponSubmissions',
    component: CouponSubmissions
  },
  {
    path: '/submissions/:id/edit',
    name: 'EditCouponSubmission',
    component: CouponSubmissions,
    props: true
  },
]

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes
})

export default router
