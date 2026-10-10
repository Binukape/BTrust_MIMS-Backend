const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const attempts = new Map();

export function loginLimiter(req, res, next) {
  const key = `${req.ip}|${String(req.body?.username || '').toLowerCase()}`;
  const now = Date.now();
  const entry = attempts.get(key);

  if (entry && now - entry.first < WINDOW_MS && entry.count >= MAX_ATTEMPTS) {
    return res.status(429).json({ message: 'Too many login attempts. Please wait a few minutes and try again.' });
  }

  res.on('finish', () => {
    if (res.statusCode === 401) {
      const current = attempts.get(key);
      if (!current || now - current.first >= WINDOW_MS) attempts.set(key, { first: now, count: 1 });
      else current.count += 1;
    } else if (res.statusCode < 400) {
      attempts.delete(key);
    }
  });

  return next();
}
