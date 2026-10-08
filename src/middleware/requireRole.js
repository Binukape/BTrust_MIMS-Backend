import {forbidden} from '../utils/errors.js';

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(forbidden('Your role is not allowed to use this feature'));
    }
    return next();
  };
}
