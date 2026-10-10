import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';
import { query, one } from '../services/dbService.js';
import { assertCustomerAccess, usernameTaken } from '../services/access.js';
import { badRequest, conflict } from '../utils/errors.js';
import {
  str, isoDate, nic, phone, username as validUsername, password as validPassword,
} from '../utils/validate.js';
import { slToday, ageOn } from '../utils/dates.js';

const CUSTOMER_COLUMNS = `c.customer_id, c.agent_id, a.agent_name, b.branch_name, c.full_name, c.nic_number, c.address,
  c.phone, c.date_of_birth, c.username, c.created_at,
  (SELECT COUNT(*) FROM account_holder ah WHERE ah.customer_id = c.customer_id) AS account_count`;

const CUSTOMER_FROM = `FROM customer c
  JOIN agent a ON a.agent_id = c.agent_id
  JOIN branch b ON b.branch_id = a.branch_id`;

export async function createCustomer(req, res, next) {
  try {
    const body = req.body ?? {};
    const fullName = str(body, 'full_name', { max: 100, label: 'Full name' });
    const customerNic = nic(body.nic_number);
    const address = str(body, 'address', { max: 255, label: 'Address' });
    const phoneNumber = phone(body.phone);
    const dob = isoDate(body.date_of_birth, 'Date of birth');
    const user = validUsername(body.username);
    const hash = await bcrypt.hash(validPassword(body.password), 10);

    const age = ageOn(dob, slToday());
    if (age < 0 || age > 120) throw badRequest('Date of birth is not realistic');
    if (await usernameTaken(user)) throw conflict('That username is already taken');

    const [result] = await pool.execute(
      `INSERT INTO customer (agent_id, full_name, nic_number, address, phone, date_of_birth, username, password_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.agentId, fullName, customerNic, address, phoneNumber, dob, user, hash],
    );
    const created = await one(`SELECT ${CUSTOMER_COLUMNS} ${CUSTOMER_FROM} WHERE c.customer_id = ?`, [result.insertId]);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}

export async function listCustomers(req, res, next) {
  try {
    const params = [];
    let where = '1 = 1';

    if (req.user.role === 'agent') {
      where += ' AND c.agent_id = ?';
      params.push(req.user.agentId);
    }

    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (q) {
      where += ' AND (c.full_name LIKE ? OR c.nic_number LIKE ? OR c.username LIKE ?)';
      const like = `%${q}%`;
      params.push(like, like, like);
    }

    const rows = await query(
      `SELECT ${CUSTOMER_COLUMNS} ${CUSTOMER_FROM} WHERE ${where} ORDER BY c.full_name`,
      params,
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

export async function getCustomer(req, res, next) {
  try {
    await assertCustomerAccess(req.user, req.params.id);
    const customer = await one(`SELECT ${CUSTOMER_COLUMNS} ${CUSTOMER_FROM} WHERE c.customer_id = ?`, [req.params.id]);
    res.json(customer);
  } catch (err) {
    next(err);
  }
}
