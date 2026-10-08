import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {env} from '../config/env.js';
import {one} from '../services/dbService.js';
import {badRequest, unauthorized} from '../utils/errors.js';

const ACCOUNT_TABLES = [
  { role: 'admin', sql: 'SELECT admin_id AS uid, full_name AS name, username, password_hash FROM admin WHERE username = ?' },
  { role: 'agent', sql: 'SELECT agent_id AS uid, agent_name AS name, username, password_hash FROM agent WHERE username = ?' },
  { role: 'customer', sql: 'SELECT customer_id AS uid, full_name AS name, username, password_hash FROM customer WHERE username = ?' },
];

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export async function login(req, res, next) {
  try {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
      throw badRequest('Username and password are required');
    }

    let found = null;
    for (const table of ACCOUNT_TABLES) {
      const row = await one(table.sql, [username.trim()]);
      if (row) {
        found = { ...row, role: table.role };
        break;
      }
    }

    const hash = found ? found.password_hash : DUMMY_HASH;
    const matches = await bcrypt.compare(password, hash);
    if (!found || !matches) throw unauthorized('Incorrect username or password');

    const user = { role: found.role, id: found.uid, name: found.name, username: found.username };
    const token = jwt.sign(
      { role: user.role, uid: user.id, name: user.name, username: user.username },
      env.jwtSecret,
      {algorithm: 'HS256', expiresIn: env.jwtExpiresIn},
    );
    res.json({token, user});
  } catch (err) {
    next(err);
  }
}

export function me(req, res) {
  const { role, id, name, username } = req.user;
  res.json({ user: {role, id, name, username} });
}
