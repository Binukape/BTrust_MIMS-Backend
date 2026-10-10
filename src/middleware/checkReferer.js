import { env } from '../config/env.js';
import { forbidden } from '../utils/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function sameOrigin(value) {
  if (!value) return false;
  try {
    return new URL(value).origin === env.allowedOrigin;
  } catch {
    return false;
  }
}

export function checkReferer(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const referer = req.headers.referer;
  const origin = req.headers.origin;
  const source = referer || origin;

  if (!sameOrigin(source)) {
    return next(forbidden('Request rejected: it did not come from the MIMS web application'));
  }
  return next();
}
