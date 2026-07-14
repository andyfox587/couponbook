// authService.js
import { UserManager, WebStorageStateStore } from "oidc-client-ts";

const origin = window.location.origin;
const redirectUri = `${origin}/callback`;
const logoutUri = origin;

const cognitoAuthConfig = {
  authority: "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_O1hbHZsSq",
  client_id: "71mh713mljkcg4jftbcj85e24f",
  redirect_uri: redirectUri,
  post_logout_redirect_uri: logoutUri,
  response_type: "code",
  scope: "openid email phone", // keep same scope
  userStore: new WebStorageStateStore({ store: window.localStorage }),
};

export const userManager = new UserManager(cognitoAuthConfig);

// make globally available
if (typeof window !== "undefined") {
  window.userManager = userManager;
}

export async function signIn() {
  try {
    // 🔙 Remember where the user was before redirecting to Cognito
    if (typeof window !== "undefined") {
      const currentPath =
        window.location.pathname +
        window.location.search +
        window.location.hash;

      // Only store internal paths to avoid any weird open-redirect stuff
      if (currentPath.startsWith("/")) {
        localStorage.setItem("postLoginRedirect", currentPath);
      }
    }

    console.log("🔑 Redirecting to Cognito Hosted UI…");
    await userManager.signinRedirect();
  } catch (e) {
    console.error("Sign-in failed", e);
  }
}

export async function signOut() {
  try {
    const cognitoDomain =
      "https://us-east-1o1hbhzssq.auth.us-east-1.amazoncognito.com";
    const clientId = cognitoAuthConfig.client_id;
    const logoutUrl =
      `${cognitoDomain}/logout?client_id=${clientId}` +
      `&logout_uri=${encodeURIComponent(logoutUri)}`;

    await userManager.removeUser();
    localStorage.removeItem("idToken");
    localStorage.removeItem("accessToken");

    console.log("🚪 Redirecting to Cognito logout…");
    window.location.href = logoutUrl;
  } catch (e) {
    console.error("Sign-out error", e);
  }
}

// ---------------- Utilities ----------------
export async function getCurrentUser() {
  try {
    const user = await userManager.getUser();
    if (user && !user.expired) return user;
    if (userManager.signinSilent) {
      const renewed = await userManager.signinSilent();
      return renewed;
    }
  } catch (e) {
    console.warn("getCurrentUser() failed", e);
  }
  return null;
}

// Use the ACCESS token for API calls
export async function getAccessToken() {
  const user = await getCurrentUser();
  if (user?.access_token) return user.access_token;

  const localToken = localStorage.getItem("accessToken");
  if (localToken) return localToken;

  return "";
}

// still available if you need id_token for profile displays
export async function getIdToken() {
  const user = await getCurrentUser();
  if (user?.id_token) return user.id_token;
  const localToken = localStorage.getItem("idToken");
  if (localToken) return localToken;
  return "";
}

export async function handleSignInCallback() {
  try {
    const user = await userManager.signinRedirectCallback();
    if (user?.id_token) localStorage.setItem("idToken", user.id_token);
    if (user?.access_token)
      localStorage.setItem("accessToken", user.access_token);
    return user;
  } catch (e) {
    console.error("Callback handling failed", e);
    throw e;
  }
}

// ---------------- Impersonation ("Act as") ----------------
// Super-admins can browse the app as another user for support. We stash the
// target here; apiService (axios) and a fetch wrapper in main.js forward it as
// the X-Impersonate-User-Id header. The backend only honors it for super-admins.
const IMPERSONATE_KEY = "impersonateUser";

export function setImpersonation(u) {
  if (u && u.id) {
    localStorage.setItem(
      IMPERSONATE_KEY,
      JSON.stringify({ id: u.id, name: u.name, email: u.email, role: u.role })
    );
  }
}

export function clearImpersonation() {
  localStorage.removeItem(IMPERSONATE_KEY);
}

export function getImpersonatedUser() {
  try {
    const s = localStorage.getItem(IMPERSONATE_KEY);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

export function getImpersonationId() {
  return getImpersonatedUser()?.id || null;
}
