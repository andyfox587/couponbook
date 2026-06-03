import 'dotenv/config';
import { timingSafeEqual } from 'crypto';

const HEADER_NAME = 'x-service-token';
const ENV_VAR = 'METRICS_SERVICE_TOKEN';

function constantTimeEquals(a, b) {
  const ab = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export default function requireServiceToken() {
  return (req, res, next) => {
    const expected = process.env[ENV_VAR];
    if (!expected) {
      console.error(`🔐 ${ENV_VAR} is not configured; refusing metrics request`);
      return res.status(503).json({ error: 'Metrics service token not configured' });
    }

    const provided = req.headers[HEADER_NAME];
    if (!provided || typeof provided !== 'string') {
      return res.status(401).json({ error: 'Service token required' });
    }

    if (!constantTimeEquals(provided, expected)) {
      return res.status(401).json({ error: 'Invalid service token' });
    }

    return next();
  };
}
