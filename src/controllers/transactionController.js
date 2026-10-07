import { query, callProcedure } from '../services/dbService.js';
import { assertAccountAccess } from '../services/access.js';

//import utilities


// Temporary functions instead of utils to test

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function toId(value, label = 'id') {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw badRequest(`${label} must be a positive whole number`);
  }
  return n;
}

function money(value, label = 'amount') {
  const text = typeof value === 'number' ? String(value) : value;

  if (typeof text !== 'string' || !/^\d{1,13}(\.\d{1,2})?$/.test(text.trim())) {
    throw badRequest(`${label} must be a positive amount with at most 2 decimals`);
  }

  const cleaned = text.trim();

  if (Number(cleaned) <= 0) {
    throw badRequest(`${label} must be greater than zero`);
  }

  return cleaned;
}

function optionalDate(value, label) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw badRequest(`${label} must be in YYYY-MM-DD format`);
  }

  const d = new Date(`${value}T00:00:00Z`);

  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
    throw badRequest(`${label} is not a real date`);
  }

  return value;
}

//

const TYPES = [
  'DEPOSIT', 'WITHDRAWAL', 'SAVINGS_INTEREST_CREDIT', 'FD_INTEREST_CREDIT',
  'FD_MATURITY_PAYOUT', 'FD_OPENING_DEBIT', 'FD_EARLY_CLOSURE_PAYOUT', 'FD_EARLY_CLOSURE_ADJUSTMENT',
];

function movement(procedure) {
  return async (req, res, next) => {
    try {
      const accountId = toId(req.body?.account_id, 'account_id');
      const amount = money(req.body?.amount);
      await assertAccountAccess(req.user, accountId);
      const agentId = req.user.role === 'agent' ? req.user.agentId : null;
      const result = await callProcedure(procedure, [accountId, amount, agentId]);
      res.status(201).json({ reference_number: result?.reference_number ?? null });
    } catch (err) {
      next(err);
    }
  };
}

export const deposit = movement('sp_deposit');
export const withdraw = movement('sp_withdraw');

export async function listTransactions(req, res, next) {
  try {
    const accountId = toId(req.query.account_id, 'account_id');
    await assertAccountAccess(req.user, accountId);

    const params = [accountId];
    let where = 't.account_id = ?';

    const from = optionalDate(req.query.from, 'from');
    const to = optionalDate(req.query.to, 'to');
    if (from) {
      where += ' AND t.transaction_timestamp >= ?';
      params.push(`${from} 00:00:00`);
    }
    if (to) {
      where += ' AND t.transaction_timestamp <= ?';
      params.push(`${to} 23:59:59`);
    }
    if (req.query.type) {
      if (!TYPES.includes(req.query.type)) throw badRequest('Unknown transaction type');
      where += ' AND t.transaction_type = ?';
      params.push(req.query.type);
    }

    const rows = await query(
      `SELECT t.transaction_id, t.reference_number, t.transaction_type, t.amount, t.transaction_timestamp,
              t.fd_id, a.agent_name
       FROM transaction t LEFT JOIN agent a ON a.agent_id = t.agent_id
       WHERE ${where}
       ORDER BY t.transaction_timestamp DESC, t.transaction_id DESC
       LIMIT 500`,
      params,
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}
