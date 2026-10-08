import { query, one, callProcedure, withTransaction, withNamedLock } from '../services/dbService.js';
import { assertAccountAccess } from '../services/access.js';
import { badRequest, conflict } from '../utils/errors.js';
import { id as toId, money } from '../utils/validate.js';
import { slToday, ageOn } from '../utils/dates.js';

const ACCOUNT_SELECT = `SELECT sa.account_id, sa.account_number, sp.plan_name, sp.interest_rate AS plan_rate,
  sp.minimum_balance, b.branch_name, sa.balance, sa.status, sa.is_joint, sa.opened_date,
  (SELECT GROUP_CONCAT(c.full_name ORDER BY c.full_name SEPARATOR ', ')
     FROM account_holder h JOIN customer c ON c.customer_id = h.customer_id
     WHERE h.account_id = sa.account_id) AS holder_names,
  (SELECT fd.fd_id FROM fixed_deposit fd WHERE fd.account_id = sa.account_id AND fd.status = 'ACTIVE' LIMIT 1) AS active_fd_id
  FROM savings_account sa
  JOIN savings_plan sp ON sp.plan_id = sa.plan_id
  JOIN branch b ON b.branch_id = sa.branch_id`;

const NEXT_STATUS = {
  ACTIVE: ['DORMANT', 'CLOSED'],
  DORMANT: ['ACTIVE', 'CLOSED'],
  CLOSED: [],
};

export async function listAccounts(req, res, next) {
  try {
    const params = [];
    let where = '1 = 1';

    if (req.user.role === 'customer') {
      where = 'sa.account_id IN (SELECT account_id FROM account_holder WHERE customer_id = ?)';
      params.push(req.user.customerId);
    } else if (req.user.role === 'agent') {
      where = `sa.account_id IN (
        SELECT h.account_id FROM account_holder h
        JOIN customer c ON c.customer_id = h.customer_id WHERE c.agent_id = ?)`;
      params.push(req.user.agentId);
    }

    if (req.query.customer_id !== undefined) {
      where += ' AND sa.account_id IN (SELECT account_id FROM account_holder WHERE customer_id = ?)';
      params.push(toId(req.query.customer_id, 'customer_id'));
    }

    const rows = await query(`${ACCOUNT_SELECT} WHERE ${where} ORDER BY sa.account_id`, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

export async function getAccount(req, res, next) {
  try {
    await assertAccountAccess(req.user, req.params.id);
    const account = await one(`${ACCOUNT_SELECT} WHERE sa.account_id = ?`, [req.params.id]);
    const holders = await query(
      `SELECT c.customer_id, c.full_name, h.holder_role
       FROM account_holder h JOIN customer c ON c.customer_id = h.customer_id
       WHERE h.account_id = ? ORDER BY h.holder_role, c.full_name`,
      [req.params.id],
    );
    const fixedDeposits = await query(
      `SELECT f.fd_id, fp.tenure_months, f.principal_amount, f.interest_rate_snapshot, f.start_date,
              f.maturity_date, f.last_interest_credit_date, f.status,
              LEAST(f.maturity_date, DATE_ADD(COALESCE(f.last_interest_credit_date, f.start_date), INTERVAL 30 DAY)) AS next_payout_date
       FROM fixed_deposit f JOIN fd_plan fp ON fp.fd_plan_id = f.fd_plan_id
       WHERE f.account_id = ? ORDER BY f.fd_id DESC`,
      [req.params.id],
    );
    res.json({ ...account, holders, fixed_deposits: fixedDeposits });
  } catch (err) {
    next(err);
  }
}

export async function openAccount(req, res, next) {
  try {
    const body = req.body ?? {};
    const planId = toId(body.plan_id, 'plan');
    if (!Array.isArray(body.holder_customer_ids) || body.holder_customer_ids.length === 0) {
      throw badRequest('Select at least one account holder');
    }
    const holderIds = [...new Set(body.holder_customer_ids.map((v) => toId(v, 'holder')))];
    const initialDeposit = body.initial_deposit ? money(body.initial_deposit, 'Initial deposit') : null;

    const plan = await one('SELECT * FROM savings_plan WHERE plan_id = ?', [planId]);
    if (!plan) throw badRequest('The selected savings plan does not exist');

    const isJoint = plan.plan_name === 'Joint';
    if (isJoint && holderIds.length < 2) throw badRequest('A Joint account needs two or more holders');
    if (!isJoint && holderIds.length !== 1) throw badRequest(`A ${plan.plan_name} account has exactly one holder`);

    const placeholders = holderIds.map(() => '?').join(', ');
    const holders = await query(
      `SELECT customer_id, full_name, date_of_birth FROM customer
       WHERE agent_id = ? AND customer_id IN (${placeholders})`,
      [req.user.agentId, ...holderIds],
    );
    if (holders.length !== holderIds.length) {
      throw badRequest('Every account holder must be one of your assigned customers');
    }

    const today = slToday();
    if (plan.min_age !== null || plan.max_age !== null) {
      for (const holder of holders) {
        const age = ageOn(holder.date_of_birth, today);
        const tooYoung = plan.min_age !== null && age < plan.min_age;
        const tooOld = plan.max_age !== null && age > plan.max_age;
        if (tooYoung || tooOld) {
          throw badRequest(`${holder.full_name} is ${age} years old, which is outside the ${plan.plan_name} plan age range`);
        }
      }
    }

    const agent = await one('SELECT branch_id FROM agent WHERE agent_id = ?', [req.user.agentId]);

    const accountId = await withNamedLock('mims_new_account_number', async () => {
      return withTransaction(async (conn) => {
        const next = await one(
          `SELECT COALESCE(MAX(CAST(SUBSTRING(account_number, 3) AS UNSIGNED)), 0) + 1 AS n
           FROM savings_account WHERE account_number REGEXP '^SA[0-9]+$'`,
          [],
          conn,
        );
        const accountNumber = `SA${String(next.n).padStart(8, '0')}`;
        const [result] = await conn.execute(
          `INSERT INTO savings_account (plan_id, branch_id, account_number, is_joint, status, opened_date)
           VALUES (?, ?, ?, ?, 'ACTIVE', ?)`,
          [planId, agent.branch_id, accountNumber, isJoint ? 1 : 0, today],
        );
        for (let i = 0; i < holderIds.length; i += 1) {
          await conn.execute(
            'INSERT INTO account_holder (account_id, customer_id, holder_role) VALUES (?, ?, ?)',
            [result.insertId, holderIds[i], i === 0 ? 'PRIMARY' : 'SECONDARY'],
          );
        }
        return result.insertId;
      });
    });

    let depositNote = null;
    if (initialDeposit) {
      try {
        await callProcedure('sp_deposit', [accountId, initialDeposit, req.user.agentId]);
      } catch (err) {
        depositNote = `Account opened, but the initial deposit failed: ${err.sqlMessage || err.message}`;
      }
    }

    const account = await one(`${ACCOUNT_SELECT} WHERE sa.account_id = ?`, [accountId]);
    res.status(201).json({ ...account, note: depositNote });
  } catch (err) {
    next(err);
  }
}

export async function changeStatus(req, res, next) {
  try {
    await assertAccountAccess(req.user, req.params.id);
    const target = req.body?.status;
    if (!['ACTIVE', 'DORMANT', 'CLOSED'].includes(target)) throw badRequest('Status must be ACTIVE, DORMANT or CLOSED');
    await applyStatus(req.params.id, target);
    res.json(await one(`${ACCOUNT_SELECT} WHERE sa.account_id = ?`, [req.params.id]));
  } catch (err) {
    next(err);
  }
}

export async function closeAccount(req, res, next) {
  try {
    await assertAccountAccess(req.user, req.params.id);
    await applyStatus(req.params.id, 'CLOSED');
    res.json(await one(`${ACCOUNT_SELECT} WHERE sa.account_id = ?`, [req.params.id]));
  } catch (err) {
    next(err);
  }
}

async function applyStatus(accountId, target) {
  await withTransaction(async (conn) => {
    const account = await one('SELECT status FROM savings_account WHERE account_id = ? FOR UPDATE', [accountId], conn);
    if (account.status === target) throw conflict(`The account is already ${target}`);
    if (!NEXT_STATUS[account.status].includes(target)) {
      throw badRequest(`An account that is ${account.status} cannot be changed to ${target}`);
    }
    if (target === 'CLOSED' || target === 'DORMANT') {
      const activeFd = await one(
        "SELECT fd_id FROM fixed_deposit WHERE account_id = ? AND status = 'ACTIVE' LIMIT 1",
        [accountId],
        conn,
      );
      if (activeFd) {
        throw badRequest('Settle the active Fixed Deposit first (let it mature or close it early)');
      }
    }
    await conn.execute('UPDATE savings_account SET status = ? WHERE account_id = ?', [target, accountId]);
  });
}
