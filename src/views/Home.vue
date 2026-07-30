<!-- src/views/Home.vue
     Group-aware front page. A non-member (or signed-out visitor) sees the
     NEUTRAL cover — no specific group badge or area counts. A signed-in member
     sees THEIR joined group's cover (badge + that group's counts + open-book). -->
<template>
  <div class="home">
    <FoodieCover :group-id="myGroupId" :is-member="isMember" context="home" />
  </div>
</template>

<script>
import { mapGetters } from 'vuex';
import FoodieCover from '@/components/Consumer/FoodieCover.vue';
import { getAccessToken } from '@/services/authService';

export default {
  name: 'AppHome',
  components: { FoodieCover },
  data() {
    return {
      myGroupId: null,
      isMember: false,
    };
  },
  computed: {
    ...mapGetters('auth', ['isAuthenticated']),
  },
  watch: {
    isAuthenticated: {
      immediate: true,
      handler(v) {
        if (v) this.loadMembership();
        else {
          this.myGroupId = null;
          this.isMember = false;
        }
      },
    },
  },
  methods: {
    // If the signed-in user has an active purchased book, this becomes their
    // group's home. Otherwise the cover stays neutral.
    async loadMembership() {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const res = await fetch('/api/v1/groups/my/purchases', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const purchases = await res.json();
        const now = new Date();
        const active = (Array.isArray(purchases) ? purchases : []).filter((p) => {
          if (p.status !== 'paid') return false;
          if (!p.expiresAt) return true;
          const exp = new Date(p.expiresAt);
          return Number.isNaN(exp.getTime()) ? true : exp >= now;
        });
        if (active.length) {
          this.myGroupId = active[0].groupId;
          this.isMember = true;
        } else {
          this.myGroupId = null;
          this.isMember = false;
        }
      } catch (e) {
        /* stay neutral on error */
      }
    },
  },
};
</script>

<style scoped>
.home {
  background: #0f151c;
}
</style>
