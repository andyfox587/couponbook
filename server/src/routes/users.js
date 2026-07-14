// server/src/routes/users.js
import express from 'express';
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  InitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '../db.js';
import { user, merchant, merchantMembership } from '../schema.js';
import auth from '../middleware/auth.js';
import { resolveLocalUser } from '../authz/index.js';

const router = express.Router();

console.log('📦  users router loaded');

const cognito = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION,
});

// --- JWKS client (for verifying Cognito ID tokens) ---
// --- helpers ---
function asciiHyphenateRegion(r) {
  return (r || '').trim()
    // replace any non-ascii hyphen/dash with ascii '-'
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
    // collapse doubles, strip spaces
    .replace(/\s+/g, '')
    .replace(/-+/g, '-');
}
const REGION = asciiHyphenateRegion(process.env.AWS_REGION);
if (process.env.AWS_REGION && process.env.AWS_REGION !== REGION) {
  console.warn(`📦  AWS_REGION normalized from "${process.env.AWS_REGION}" → "${REGION}"`);
}
const EXPECTED_ISSUER = `https://cognito-idp.${REGION}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}`;

function makeJwksClient(issuer) {
  return jwksRsa({ jwksUri: `${issuer}/.well-known/jwks.json` });
}

function getKey(header, cb) {
  jwksClient.getSigningKey(header.kid, (err, key) => {
    if (err) return cb(err);
    const signingKey = key.getPublicKey();
    cb(null, signingKey);
  });
}

// POST /api/v1/users/signup
router.post('/signup', async (req, res) => {
  console.log('📦  POST /api/v1/users/signup hit');
  const { email, password, name } = req.body || {};
  if (!email || !password) {
    console.log('📦  signup missing email or password');
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    console.log(`📦  signing up user in Cognito: ${email}`);
    const { UserSub } = await cognito.send(
      new SignUpCommand({
        ClientId: process.env.COGNITO_CLIENT_ID,
        Username: email,
        Password: password,
        UserAttributes: attrs,
      })
    );
    console.log(`📦  Cognito SignUp ok → sub=${UserSub}`);

    const fallbackName =
      typeof name === 'string' && name.trim() ? name.trim() : email.split('@')[0];

    const [newUser] = await db
      .insert(user)
      .values({
        cognitoSub: UserSub,
        email,
        name: fallbackName,
        role: 'customer',
      })
      .returning();

    console.log(`📦  inserted user row id=${newUser.id} for sub=${UserSub}`);
    console.log('📦  returning 201 with user basics');
    return res.status(201).json({
      id: newUser.id,
      email: newUser.email,
      cognito_sub: UserSub,
    });
  } catch (err) {
    console.error('📦  Signup error:', err);
    if (err && err.name === 'UsernameExistsException') {
      console.log('📦  user already exists (409)');
      return res.status(409).json({ error: 'User already exists' });
    }
    return res.status(500).json({ error: err?.message || 'Server error' });
  }
});

// POST /api/v1/users/login
router.post('/login', async (req, res) => {
  console.log('📦  POST /api/v1/users/login hit');
  const { email, password } = req.body || {};
  if (!email || !password) {
    console.log('📦  login missing email or password');
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    console.log(`📦  initiating Cognito auth for ${email}`);
    const { AuthenticationResult } = await cognito.send(
      new InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: process.env.COGNITO_CLIENT_ID,
        AuthParameters: { USERNAME: email, PASSWORD: password },
      })
    );

    console.log('📦  Cognito login ok, returning tokens');
    return res.json({
      idToken: AuthenticationResult?.IdToken,
      accessToken: AuthenticationResult?.AccessToken,
      refreshToken: AuthenticationResult?.RefreshToken,
      expiresIn: AuthenticationResult?.ExpiresIn,
    });
  } catch (err) {
    console.error('📦  Cognito login error:', err);
    switch (err?.name) {
      case 'NotAuthorizedException':
        console.log('📦  401 invalid email or password');
        return res.status(401).json({ error: 'Invalid email or password' });
      case 'UserNotConfirmedException':
        console.log('📦  403 user not confirmed');
        return res.status(403).json({ error: 'User not confirmed' });
      default:
        return res.status(500).json({ error: err?.message || 'Server error' });
    }
  }
});

// POST /api/v1/users/sync
// Verifies the Cognito token and UPSERTS the user into Postgres.
router.post('/sync', async (req, res) => {
  console.log('📦  POST /api/v1/users/sync hit');
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      console.log('📦  sync missing Bearer token (401)');
      return res.status(401).json({ error: 'Missing token' });
    }

    // ---- 1) Decode (unverified) to extract ISS + kid ----
    const decodedUnverified = jwt.decode(token, { complete: true });
    const iss = decodedUnverified?.payload?.iss;
    const kid = decodedUnverified?.header?.kid;

    if (!iss || !kid) {
      console.log('📦  invalid token structure (no iss/kid)');
      return res.status(400).json({ error: 'Malformed token' });
    }

    if (iss !== EXPECTED_ISSUER) {
      console.warn(`📦  issuer mismatch. expected=${EXPECTED_ISSUER} got=${iss}`);
      return res.status(401).json({ error: 'Invalid token issuer' });
    }

    console.log(`📦  token issuer: ${iss} (kid=${kid})`);

    // ---- 2) Verify signature via JWKS ----
    const jwksClient = makeJwksClient(iss);
    const getKey = (header, cb) =>
      jwksClient.getSigningKey(header.kid, (err, key) => {
        if (err) return cb(err);
        cb(null, key.getPublicKey());
      });

    const decoded = await new Promise((resolve, reject) =>
      jwt.verify(
        token,
        getKey,
        {
          algorithms: ['RS256'],
          issuer: iss,
          audience: process.env.COGNITO_CLIENT_ID,
        },
        (err, payload) => (err ? reject(err) : resolve(payload))
      )
    );

    const sub = decoded.sub;
    const email = decoded.email || decoded['cognito:username'] || '';
    const preferredName =
      decoded.name ||
      [decoded.given_name, decoded.family_name].filter(Boolean).join(' ').trim() ||
      decoded.preferred_username ||
      '';
    const name = preferredName || (email ? email.split('@')[0] : 'user');

    console.log(`📦  token ok → sub=${sub} email=${email} aud=${decoded.aud}`);

    // ---- 3) Try lookup by cognitoSub (canonical) ----
    const existingBySub = await db
      .select()
      .from(user)
      .where(eq(user.cognitoSub, sub))
      .limit(1);

    let row = existingBySub[0];

    if (!row) {
      console.log('📦  no user row found by cognitoSub; checking by email…');

      // ---- 3b) Try lookup by email (fallback) ----
      let existingByEmail = [];
      if (email) {
        existingByEmail = await db
          .select()
          .from(user)
          .where(eq(user.email, email))
          .limit(1);
      }

      if (existingByEmail[0]) {
        // Reuse existing user row and update its cognitoSub
        row = existingByEmail[0];

        if (row.cognitoSub !== sub) {
          console.log(
            `📦  found existing user by email with different sub → updating cognitoSub (id=${row.id})`
          );
          [row] = await db
            .update(user)
            .set({ cognitoSub: sub })
            .where(eq(user.id, row.id))
            .returning();
        } else {
          console.log(`📦  found existing user by email (same sub) id=${row.id}`);
        }
      } else {
        // ---- 3c) Truly new user → safe to insert ----
        console.log('📦  no user row for this sub or email; inserting new user…');
        [row] = await db
          .insert(user)
          .values({
            cognitoSub: sub,
            email,
            name,
            role: 'customer',
          })
          .returning();
        console.log(`📦  inserted new user id=${row.id}`);
      }
    } else {
      // ---- 4) User exists by sub → patch missing fields ----
      const patch = {};
      if (!row.email && email) patch.email = email;
      if (!row.name && name) patch.name = name;

      if (Object.keys(patch).length > 0) {
        console.log(
          `📦  updating user id=${row.id} with patch=${JSON.stringify(patch)}`
        );
        [row] = await db
          .update(user)
          .set(patch)
          .where(eq(user.id, row.id))
          .returning();
      } else {
        console.log(`📦  user id=${row.id} already up-to-date`);
      }
    }

    // ---- 5) Return payload to frontend ----
    console.log('📦  returning sync payload');
    return res.json({
      id: row.id,
      email: row.email,
      cognito_sub: sub,
    });
  } catch (err) {
    console.error('📦  users/sync error', err);
    return res.status(400).json({ error: 'Invalid or expired token' });
  }
});

// GET /api/v1/users/me
router.get('/me', auth(), resolveLocalUser, async (req, res, next) => {
  try {
    // resolveLocalUser sets req.dbUser to the *effective* user — which is the
    // impersonation target when a super_admin is "acting as" someone — so /me
    // (identity, role, merchant list) and everything the client derives from it
    // reflect that user, not the real logged-in super admin.
    const dbUser = req.dbUser;
    if (!dbUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // 2) Base payload
    const payload = {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role, // 'customer' | 'merchant' | 'foodie_group_admin' | etc.
    };

    // 3) Attach owned merchants and admin-accessible merchants
    const ownedRows = await db
      .select()
      .from(merchant)
      .where(eq(merchant.ownerId, dbUser.id));

    const memberRows = await db
      .select({
        id: merchant.id,
        name: merchant.name,
        logoUrl: merchant.logoUrl,
        websiteUrl: merchant.websiteUrl,
        ownerId: merchant.ownerId,
        createdAt: merchant.createdAt,
        updatedAt: merchant.updatedAt,
        deletedAt: merchant.deletedAt,
      })
      .from(merchantMembership)
      .innerJoin(merchant, eq(merchant.id, merchantMembership.merchantId))
      .where(
        and(
          eq(merchantMembership.userId, dbUser.id),
          isNull(merchantMembership.deletedAt),
          isNull(merchant.deletedAt),
        )
      );

    const ownedIds = new Set(ownedRows.map((m) => m.id));

    const shapeRow = (m, access) => ({
      id: m.id,
      name: m.name,
      logo_url: m.logoUrl,
      website_url: m.websiteUrl || null,
      access,
    });

    payload.merchants = [
      ...ownedRows.map((m) => shapeRow(m, 'owner')),
      ...memberRows.filter((m) => !ownedIds.has(m.id)).map((m) => shapeRow(m, 'admin')),
    ];

    return res.json(payload);
  } catch (err) {
    console.error('📦  Error in GET /api/v1/users/me:', err);
    next(err);
  }
});

export default router;

