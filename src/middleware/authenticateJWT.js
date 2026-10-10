import jwt from 'jsonwebtoken';
import {env} from '../config/env.js';
import {unauthorized} from '../utils/errors.js';

export function authenticateJWT(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return next(unauthorized());

  try {
    const payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
    req.user = {
      role: payload.role,
      id: payload.uid,
      name: payload.name,
      username: payload.username,
      adminId: payload.role === 'admin' ? payload.uid : null,
      agentId: payload.role === 'agent' ? payload.uid : null,
      customerId: payload.role === 'customer' ? payload.uid : null,
    };
    return next();
  } catch {
    return next(unauthorized('Your session has expired, please log in again'));
  }
}
