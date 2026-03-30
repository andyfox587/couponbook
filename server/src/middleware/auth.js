// server/src/middleware/auth.js   ← pure ESM
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import jwkToPem from 'jwk-to-pem';
import axios from 'axios';


const clientId = process.env.COGNITO_CLIENT_ID; // ✅ add this
// Normalize region to avoid hidden Unicode or whitespace issues
const rawRegion  = process.env.AWS_REGION || 'us-east-1';
// remove leading/trailing spaces and normalize common unicode dashes to '-'
const region     = rawRegion
  .trim()
  .replace(/[\u2010-\u2015]/g, '-'); // hyphen-like unicode chars

const userPoolId = (process.env.COGNITO_USER_POOL_ID || '').trim();
const issuer     = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;

console.log('🔧 auth config', { region, userPoolId, issuer });


let pems = null; // cached after first call
async function getPems() {
  if (pems) return pems;
  const { data } = await axios.get(`${issuer}/.well-known/jwks.json`);
  pems = Object.fromEntries(data.keys.map(k => [k.kid, jwkToPem(k)]));
  return pems;
}

export function required() {
  return verifyJwt();
}

/**
 * Like verifyJwt but does NOT reject unauthenticated requests.
 * Sets req.user when a valid token is present, otherwise continues silently.
 */
export function optional() {
  return async (req, res, next) => {
    try {
      const token = (req.headers.authorization || '').replace(/^Bearer /i, '');
      if (!token) return next();

      const decodedHead = jwt.decode(token, { complete: true });
      if (!decodedHead) return next();

      const pem = (await getPems())[decodedHead.header.kid];
      if (!pem) return next();

      jwt.verify(token, pem, { issuer }, (err, payload) => {
        if (!err) req.user = payload;
        next();
      });
    } catch {
      next();
    }
  };
}

/**
 * Express middleware – verifies a Cognito-issued JWT.
 * On success sets req.user = decoded payload, else 401.
 */
export default function verifyJwt() {
  return async (req, res, next) => {
    try {
      /* 1️⃣ extract token */
      const token = (req.headers.authorization || '').replace(/^Bearer /i, '');
      if (!token) return res.status(401).json({ message: 'Token required' });

      /* 2️⃣ pick matching PEM */
      const decodedHead = jwt.decode(token, { complete: true });
      if (!decodedHead) throw new Error('Token malformed');
      const pem = (await getPems())[decodedHead.header.kid];
      if (!pem) throw new Error('Unknown kid');

      /* 3️⃣ verify signature & issuer */
      /* 3️⃣ verify signature & issuer with debug of what we got */
      try {
        // Log the raw header presence and a short token preview
        const short = token.slice(0, 12) + '...' + token.slice(-6);
        console.log('🔐 auth header present, token preview:', short);

        // Decode (UNVERIFIED) just to log useful fields
        const decoded = jwt.decode(token, { complete: true });
        const p = decoded && decoded.payload ? decoded.payload : null;
        console.log('🔎 decoded (unverified)', p ? {
          iss: p.iss,
          token_use: p.token_use,
          aud: p.aud,
          client_id: p.client_id,
          sub: (p.sub || '').slice(0, 8)
        } : 'null');

      } catch (e) { /* keep this silent */ }

      jwt.verify(token, pem, { issuer }, (err, payload) => {
        if (err) {
          console.error('❌ verify failed:', err.message);
          return res.status(401).json({ message: err.message });
        }

        // Successful verify – minimal log
        console.log('✅ verify ok', {
          token_use: payload.token_use,
          aud: payload.aud,
          client_id: payload.client_id,
          sub: String(payload.sub || '').slice(0, 8)
        });

        req.user = payload;
        next();
      });
      ;
    } catch (err) {
      res.status(401).json({ message: err.message });
    }
  };
}
