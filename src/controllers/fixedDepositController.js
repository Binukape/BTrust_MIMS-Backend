import { query, one, callProcedure } from '../services/dbService.js';
import { assertAccountAccess } from '../services/access.js';

// Added utility import
import { notFound } from '../utils/errors.js';
import { id as toId, money } from '../utils/validate.js';



const FD_SELECT = `SELECT f.fd_id, f.account_id, sa.account_number, fp.tenure_months, f.principal_amount,
  f.interest_rate_snapshot, fp.early_closure_penalty_days, f.start_date, f.maturity_date,
  f.last_interest_credit_date, f.status,
  LEAST(f.maturity_date, DATE_ADD(COALESCE(f.last_interest_credit_date, f.start_date), INTERVAL 30 DAY)) AS next_payout_date
  FROM fixed_deposit f
  JOIN fd_plan fp ON fp.fd_plan_id = f.fd_plan_id
  JOIN savings_account sa ON sa.account_id = f.account_id`;

async function loadFd(user, rawId) {
  const fdId = toId(rawId, 'fixed deposit id');
  const fd = await one(`${FD_SELECT} WHERE f.fd_id = ?`, [fdId]);

  if (!fd) throw notFound('Fixed deposit not found');

  await assertAccountAccess(user, fd.account_id);
  return fd;
}

export async function listFixedDeposits(req, res, next) {
  try {
    const accountId = toId(req.query.account_id, 'account_id');

    await assertAccountAccess(req.user, accountId);

    res.json(
      await query(
        `${FD_SELECT} WHERE f.account_id = ? ORDER BY f.fd_id DESC`,
        [accountId]
      )
    );
  } catch (err) {
    next(err);
  }
}

export async function getFixedDeposit(req, res, next) {
  try {
    res.json(await loadFd(req.user, req.params.id));
  } catch (err) {
    next(err);
  }
}

export async function openFixedDeposit(req, res, next) {
  try {
    const accountId = toId(req.body?.account_id, 'account_id');
    const planId = toId(req.body?.fd_plan_id, 'FD plan');
    const principal = money(
      req.body?.principal_amount,
      'Principal amount'
    );

    await assertAccountAccess(req.user, accountId);

    const result = await callProcedure(
      'sp_open_fd',
      [accountId, planId, principal]
    );

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function earlyClosurePreview(req, res, next) {
  try {
    const fd = await loadFd(req.user, req.params.id);

    const principalCents =
      Math.round(Number(fd.principal_amount) * 100);

    const rawPenalty =
      (principalCents * Number(fd.interest_rate_snapshot) / 100) *
      (fd.early_closure_penalty_days / 365);

    const penaltyCents =
      Math.min(Math.round(rawPenalty), principalCents);

    res.json({
      fd_id: fd.fd_id,
      principal: (principalCents / 100).toFixed(2),
      penalty: (penaltyCents / 100).toFixed(2),
      net_credited:
        ((principalCents - penaltyCents) / 100).toFixed(2),
      penalty_days: fd.early_closure_penalty_days,
    });
  } catch (err) {
    next(err);
  }
}

export async function closeEarly(req, res, next) {
  try {
    const fd = await loadFd(req.user, req.params.id);

    const result = await callProcedure(
      'sp_close_fd_early',
      [fd.fd_id]
    );

    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function listSavingsPlans(_req, res, next) {
  try {
    res.json(
      await query(
        'SELECT plan_id, plan_name, interest_rate, minimum_balance, min_age, max_age FROM savings_plan ORDER BY plan_id'
      )
    );
  } catch (err) {
    next(err);
  }
}

export async function listFdPlans(_req, res, next) {
  try {
    res.json(
      await query(
        'SELECT fd_plan_id, tenure_months, interest_rate, early_closure_penalty_days FROM fd_plan ORDER BY tenure_months'
      )
    );
  } catch (err) {
    next(err);
  }
}