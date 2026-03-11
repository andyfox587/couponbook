<!-- src/components/Coupons/CouponRedeemPopup.vue -->
<template>
  <div class="page">
    <div class="dialog">
      <div class="popup-wrap">
        <header class="popup-header">
          <h2>{{ couponTitle || 'Redeem Coupon' }}</h2>
        </header>

        <section v-if="loading" class="state">Loading…</section>
        <section v-else-if="error" class="state error">⚠️ {{ error }}</section>

        <section v-else>
          <!-- NOT REDEEMED YET -->
          <div v-if="!redeemed" class="confirm">
            <p class="lead">
              <strong>Are you sure?</strong>
              This coupon can be redeemed only once with your account. After confirming,
              you won’t be able to redeem it again.
            </p>

            <p class="note">
              Printing or downloading the coupon and viewing full coupon details is disabled
              until you confirm redemption.
            </p>

            <p class="instructions">
              Show this Current Page - "Confirm Redeem" to your server or cashier so they can
              verify your redemption and apply your discount to your bill.
            </p>

            <div class="actions">
              <button class="btn primary" @click="confirmRedeem" :disabled="submitting">
                {{ submitting ? 'Redeeming…' : 'Confirm Redeem' }}
              </button>
              <button class="btn ghost" @click="windowClose">Cancel</button>
            </div>

            <div v-if="error" class="state error">⚠️ {{ error }}</div>
          </div>

          <!-- ALREADY / NOW REDEEMED -->
          <div v-else class="redeemed">
            <p class="success">✅ Redeemed on {{ fmtDate(redeemedAt) }}</p>

            <!-- NEW: usage instructions -->
            <p class="instructions">
              Show this Current Page - "Confirm Redeem" to your server or cashier so they can
              verify your redemption and apply your discount to your bill.
            </p>

            <div class="details-card">
              <h3>Coupon Details</h3>
              <dl class="details-list">
                <div>
                  <dt>Title</dt>
                  <dd>{{ couponTitle }}</dd>
                </div>
                <div>
                  <dt>Description</dt>
                  <dd>{{ couponDescription || '—' }}</dd>
                </div>
                <div>
                  <dt>Type</dt>
                  <dd>{{ couponType || '—' }}</dd>
                </div>
                <div>
                  <dt>Value</dt>
                  <dd>{{ couponValueDisplay }}</dd>
                </div>
                <div>
                  <dt>Valid From</dt>
                  <dd>{{ couponValidFromDisplay }}</dd>
                </div>
                <div>
                  <dt>Expires At</dt>
                  <dd>{{ couponExpiresAtDisplay }}</dd>
                </div>
                <div>
                  <dt>Merchant</dt>
                  <dd>{{ couponMerchantDisplay }}</dd>
                </div>
              </dl>

              <div class="qr-wrapper" v-if="qrCodeUrl">
                <img :src="qrCodeUrl" alt="Coupon QR" class="qr" />
              </div>
            </div>

            <div class="actions">
              <button class="btn" @click="printCoupon">Print</button>
              <a v-if="pdfUrl" class="btn" :href="downloadUrlSecured" target="_self" download>
                Download PDF
              </a>
              <button class="btn ghost" @click="windowClose">Close</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script>
import { userManager as svcUserManager } from "@/services/authService.js";

export default {
  name: "CouponRedeemPopup",
  data() {
    return {
      coupon: null,
      loading: true,
      error: null,
      redeemed: false,
      redeemedAt: null,
      submitting: false,
      blockPrintStyleEl: null,
      origPrint: null,
    };
  },
  computed: {
    couponId() {
      return this.$route.params.id;
    },

    // ---- Normalized coupon fields ----
    couponTitle() {
      return this.coupon?.title ?? "";
    },
    couponDescription() {
      return this.coupon?.description ?? this.coupon?.desc ?? "";
    },
    qrCodeUrl() {
      return this.coupon?.qr_code_url ?? this.coupon?.qrCodeUrl ?? null;
    },
    pdfUrl() {
      return this.coupon?.pdf_url ?? this.coupon?.pdfUrl ?? null;
    },
    downloadUrlSecured() {
      return this.pdfUrl || "#";
    },
    couponType() {
      return this.coupon?.coupon_type ?? this.coupon?.couponType ?? "";
    },
    couponValueRaw() {
      return this.coupon?.discount_value ?? this.coupon?.discountValue ?? 0;
    },
    couponValueDisplay() {
      if (this.couponType === "percent") {
        return `${this.couponValueRaw ?? 0}%`;
      }
      if (this.couponType === "amount") {
        return `$${this.couponValueRaw ?? 0}`;
      }
      return String(this.couponValueRaw ?? 0);
    },
    couponValidFrom() {
      return this.coupon?.valid_from ?? this.coupon?.validFrom ?? null;
    },
    couponExpiresAt() {
      return this.coupon?.expires_at ?? this.coupon?.expiresAt ?? null;
    },
    couponValidFromDisplay() {
      return this.couponValidFrom ? this.fmtDateShort(this.couponValidFrom) : "—";
    },
    couponExpiresAtDisplay() {
      return this.couponExpiresAt ? this.fmtDateShort(this.couponExpiresAt) : "—";
    },
    couponMerchantId() {
      return this.coupon?.merchant_id ?? this.coupon?.merchantId ?? null;
    },
    couponMerchantDisplay() {
      return this.coupon?.merchant_name ?? this.couponMerchantId ?? "—";
    },
  },

  async created() {
    try {
      const res = await fetch(`/api/v1/coupons/${this.couponId}`);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      this.coupon = await res.json();
    } catch (e) {
      this.error = e.message || "Failed to load coupon";
    } finally {
      this.loading = false;
    }

    this.installPrintBlocker();
    window.addEventListener("keydown", this.preventPrintHotkeys, true);
    window.addEventListener("beforeunload", this.cleanup, { once: true });
  },

  beforeUnmount() {
    this.cleanup();
  },

  methods: {
    manager() {
      return svcUserManager || window.userManager || null;
    },

    async getAccessToken() {
      try {
        const um = this.manager();
        if (um?.getUser) {
          let u = await um.getUser();
          if (!u || !u.access_token) {
            if (um.signinSilent) {
              try {
                u = await um.signinSilent();
              } catch (e) {
                void e;
              }
            }
          }
          if (u?.access_token) return u.access_token;
        }
      } catch (e) {
        console.error("[redeem] userManager access_token lookup failed", e);
      }

      try {
        const fromLocal = localStorage.getItem("accessToken");
        if (fromLocal) return fromLocal;
      } catch (e) {
        void e;
      }

      const scan = (storage) => {
        try {
          for (let i = 0; i < storage.length; i++) {
            const k = storage.key(i);
            if (k && k.startsWith("oidc.user:")) {
              const raw = storage.getItem(k);
              if (!raw) continue;
              const obj = JSON.parse(raw);
              if (obj?.access_token) return obj.access_token;
            }
          }
        } catch (e) {
          void e;
        }
        return null;
      };
      const fromSession = scan(window.sessionStorage || {});
      if (fromSession) return fromSession;
      const fromLocalOidc = scan(window.localStorage || {});
      if (fromLocalOidc) return fromLocalOidc;

      return null;
    },

    async getIdTokenFallback() {
      try {
        const um = this.manager();
        if (um?.getUser) {
          const u = await um.getUser();
          if (u?.id_token) return u.id_token;
        }
      } catch (e) {
        void e;
      }

      try {
        const fromLocal = localStorage.getItem("idToken");
        if (fromLocal) return fromLocal;
      } catch (e) {
        void e;
      }

      const scan = (storage) => {
        try {
          for (let i = 0; i < storage.length; i++) {
            const k = storage.key(i);
            if (k && k.startsWith("oidc.user:")) {
              const raw = storage.getItem(k);
              const obj = raw && JSON.parse(raw);
              if (obj?.id_token) return obj.id_token;
            }
          }
        } catch (e) {
          void e;
        }
        return null;
      };
      const fromSession = scan(window.sessionStorage || {});
      if (fromSession) return fromSession;
      const fromLocalOidc = scan(window.localStorage || {});
      if (fromLocalOidc) return fromLocalOidc;

      return null;
    },

    async confirmRedeem() {
      if (this.submitting) return;
      this.error = null;
      this.submitting = true;

      const accessToken = await this.getAccessToken();
      const token = accessToken || (await this.getIdTokenFallback());

      if (!token) {
        this.error = "Please sign in to redeem this coupon.";
        this.submitting = false;
        return;
      }

      try {
        const mid = token.split(".")[1] || "";
        const payload = mid ? JSON.parse(atob(mid)) : null;
        console.debug("[redeem] token_use:", payload && payload.token_use);
      } catch (e) {
        void e;
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const res = await fetch(`/api/v1/coupons/${this.couponId}/redeem`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({}),
          signal: controller.signal,
        }).catch((e) => {
          throw new Error(
            e?.name === "AbortError"
              ? "Request timed out. Please try again."
              : "Network error. Check your connection or CORS settings."
          );
        });

        clearTimeout(timeoutId);

        if (res.status === 401) {
          this.error = "Please sign in to redeem this coupon.";
          return;
        }

        if (res.status === 409) {
          const j = await res.json().catch(() => ({}));
          this.redeemed = true;
          this.redeemedAt =
            j.redeemed_at || j.redeemedAt || new Date().toISOString();
          this.uninstallPrintBlocker();
          try {
            if (window.opener) {
              window.opener.postMessage(
                {
                  type: "coupon-redeemed",
                  couponId: this.couponId,
                  redeemedAt: this.redeemedAt,
                },
                "*"
              );
            }
          } catch (e) {
            void e;
          }
          return;
        }

        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          const text =
            typeof payload === "string"
              ? payload
              : payload?.error || "";
          throw new Error(text || `Redeem failed (status ${res.status}).`);
        }

        if (payload?.alreadyRedeemed) {
          this.redeemed = true;
          this.redeemedAt =
            payload.redeemed_at ||
            payload.redeemedAt ||
            new Date().toISOString();
          this.uninstallPrintBlocker();
          try {
            if (window.opener) {
              window.opener.postMessage(
                {
                  type: "coupon-redeemed",
                  couponId: this.couponId,
                  redeemedAt: this.redeemedAt,
                },
                "*"
              );
            }
          } catch (e) {
            void e;
          }
          return;
        }

        this.redeemed = true;
        this.redeemedAt =
          payload.redeemed_at ||
          payload.redeemedAt ||
          new Date().toISOString();

        if (payload.download_token && this.pdfUrl) {
          const u = new URL(this.pdfUrl, window.location.origin);
          u.searchParams.set("token", payload.download_token);
          this.coupon = {
            ...this.coupon,
            pdfUrl: u.toString(),
            pdf_url: u.toString(),
          };
        }

        this.uninstallPrintBlocker();
        try {
          if (window.opener) {
            window.opener.postMessage(
              {
                type: "coupon-redeemed",
                couponId: this.couponId,
                redeemedAt: this.redeemedAt,
              },
              "*"
            );
          }
        } catch (e) {
          void e;
        }
      } catch (e) {
        this.error = e?.message || "Failed to redeem. Please try again.";
        alert(this.error);
      } finally {
        this.submitting = false;
      }
    },

    installPrintBlocker() {
      const css = `@media print { body { display: none !important; } }`;
      const el = document.createElement("style");
      el.setAttribute("data-block-print", "true");
      el.appendChild(document.createTextNode(css));
      document.head.appendChild(el);
      this.blockPrintStyleEl = el;

      const self = this;
      this.origPrint = window.print;
      window.print = function () {
        if (!self.redeemed) {
          alert("Please confirm redemption before printing.");
          return;
        }
        return self.origPrint.call(window);
      };
    },

    uninstallPrintBlocker() {
      if (this.blockPrintStyleEl?.parentNode) {
        this.blockPrintStyleEl.parentNode.removeChild(this.blockPrintStyleEl);
      }
      if (this.origPrint) {
        window.print = this.origPrint;
        this.origPrint = null;
      }
    },

    preventPrintHotkeys(e) {
      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
      if (!this.redeemed && cmdOrCtrl && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        e.stopPropagation();
        alert("Please confirm redemption before printing.");
      }
    },

    printCoupon() {
      window.print();
    },

    windowClose() {
      window.close();
    },

    cleanup() {
      window.removeEventListener("keydown", this.preventPrintHotkeys, true);
      this.uninstallPrintBlocker();
    },

    fmtDate(iso) {
      try {
        return new Date(iso).toLocaleString();
      } catch (e) {
        void e;
        return iso;
      }
    },

    fmtDateShort(iso) {
      try {
        return new Date(iso).toLocaleDateString();
      } catch (e) {
        void e;
        return iso;
      }
    },
  },
};
</script>

<style scoped>
/* Outer layout */
.page {
  min-height: 100vh;
  display: flex;
  align-items: stretch;
  justify-content: center;
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
}

.dialog {
  width: 100%;
  max-width: 520px;
  margin: var(--spacing-3xl) auto;
  background: var(--color-bg-surface);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-xl);
  display: flex;
  color: var(--color-text-primary);
}

/* Inner content */
.popup-wrap {
  padding: var(--spacing-xl) var(--spacing-lg);
  font-family: var(--font-family-base);
  width: 100%;
  max-height: calc(100vh - 48px);
  overflow-y: auto;
  color: var(--color-text-primary);
}

.popup-header {
  margin-bottom: var(--spacing-lg);
}

.popup-header h2 {
  margin: 0;
  font-size: var(--font-size-2xl);
  color: var(--color-text-primary);
}

/* States */
.state {
  padding: var(--spacing-lg) 0;
  font-size: var(--font-size-base);
  color: var(--color-text-primary);
}

.state.error {
  color: var(--color-error);
}

/* Content blocks */
.lead {
  margin: var(--spacing-sm) 0 var(--spacing-lg);
  line-height: var(--line-height-normal);
  color: var(--color-text-primary);
}

.note {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  margin-top: var(--spacing-xs);
}

/* Buttons / actions */
.confirm .actions,
.redeemed .actions {
  display: flex;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-xl);
  flex-wrap: wrap;
}

.btn {
  padding: var(--spacing-sm) var(--spacing-xl);
  border-radius: var(--radius-full);
  border: none;
  cursor: pointer;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  flex: 0 0 auto;
  min-height: var(--button-height-md);
  transition: all var(--transition-base);
}

.btn.primary {
  background: var(--color-secondary);
  color: var(--color-text-on-secondary);
}

.btn.primary:hover:not(:disabled) {
  background: var(--color-secondary-hover);
  color: var(--color-text-on-secondary);
}

.btn.primary:disabled {
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
}

.btn.ghost {
  background: transparent;
  color: var(--color-text-primary);
  box-shadow: var(--shadow-xs);
}

.btn.ghost:hover {
  background: var(--color-bg-muted);
  color: var(--color-text-primary);
  box-shadow: var(--shadow-sm);
}

.success {
  margin: var(--spacing-sm) 0 var(--spacing-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-success);
}

.instructions {
  color: var(--color-text-primary);
  margin: var(--spacing-md) 0;
  line-height: var(--line-height-normal);
}

.confirm,
.redeemed {
  color: var(--color-text-primary);
}

.confirm p,
.redeemed p {
  color: var(--color-text-primary);
}

/* Details card */
.details-card {
  margin-top: var(--spacing-lg);
  padding: var(--spacing-lg);
  border-radius: var(--radius-lg);
  background: var(--color-bg-surface);
  color: var(--color-text-primary);
  box-shadow: var(--shadow-xs);
}

.details-card h3 {
  margin: 0 0 var(--spacing-sm);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.details-list {
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: 150px 1fr;
  row-gap: var(--spacing-sm);
  column-gap: var(--spacing-lg);
  align-items: start;
}

.details-list>div {
  display: contents;
}

.details-list dt {
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-secondary);
  text-align: left;
  font-size: var(--font-size-sm);
}

.details-list dd {
  margin: 0;
  color: var(--color-text-primary);
  text-align: left;
  font-size: var(--font-size-sm);
}

.details-list>div:nth-child(n + 2)::before {
  content: "";
  grid-column: 1 / span 2;
  height: 1px;
  background: var(--color-border);
  margin: var(--spacing-xs) 0;
}

/* QR image */
.qr-wrapper {
  margin-top: var(--spacing-lg);
  text-align: center;
}

.qr {
  display: inline-block;
  width: 180px;
  height: 180px;
  object-fit: contain;
  margin: var(--spacing-sm) 0;
}

/* Mobile tweaks */
@media (max-width: 768px) {
  .page {
    background: var(--color-bg-primary);
  }

  .dialog {
    max-width: none;
    margin: 0;
    border-radius: 0;
    min-height: 100vh;
    box-shadow: none;
  }

  .popup-wrap {
    max-height: 100vh;
    padding: var(--spacing-xl);
  }

  .popup-header h2 {
    font-size: var(--font-size-xl);
  }

  .details-list {
    grid-template-columns: 1fr;
  }

  .details-list>div:nth-child(n + 2)::before {
    grid-column: 1 / span 1;
  }

  .confirm .actions,
  .redeemed .actions {
    flex-direction: column;
    align-items: stretch;
  }

  .btn {
    width: 100%;
    text-align: center;
  }
}
</style>
