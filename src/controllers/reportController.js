import { reportsPool } from '../config/db.js';
import { badRequest, forbidden, notFound } from '../utils/errors.js';
import { optionalDate } from '../utils/validate.js';
import { toCsv, toPdf } from '../reports/exporters.js';

async function run(sql, params) {
  const [rows] = await reportsPool.execute(sql, params);
  return rows;
}

function dateClause(column, from, to, params) {
  let sql = '';
  if (from) {
    sql += ` AND ${column} >= ?`;
    params.push(from);
  }
  if (to) {
    sql += ` AND ${column} <= ?`;
    params.push(to);
  }
  return sql;
}

const ACCOUNTS_OF_AGENT = 'SELECT account_id FROM v_account_agent WHERE agent_id = ?';

const money = { align: 'right' };
const count = { align: 'right' };

const REPORTS = {
  'agent-wise': {
    title: 'Report 1 - Agent-wise Transactions',
    roles: ['agent', 'admin'],
    columns: [
      { key: 'agent_name', label: 'Agent' },
      { key: 'branch_name', label: 'Branch' },
      { key: 'processed_count', label: 'Processed (count)', ...count },
      { key: 'processed_value', label: 'Processed (LKR)', ...money },
      { key: 'self_service_count', label: 'Self-service (count)', ...count },
      { key: 'self_service_value', label: 'Self-service (LKR)', ...money },
      { key: 'total_count', label: 'Total (count)', ...count },
      { key: 'total_value', label: 'Total (LKR)', ...money },
    ],
    run: (user, { from, to }) => {
      const params = [];
      let where = '1 = 1';
      if (user.role === 'agent') {
        where += ' AND agent_id = ?';
        params.push(user.agentId);
      }
      where += dateClause('transaction_date', from, to, params);
      return run(
        `SELECT agent_id, agent_name, branch_name,
                SUM(CASE WHEN channel = 'PROCESSED' THEN txn_count ELSE 0 END) AS processed_count,
                SUM(CASE WHEN channel = 'PROCESSED' THEN total_amount ELSE 0 END) AS processed_value,
                SUM(CASE WHEN channel = 'SELF_SERVICE' THEN txn_count ELSE 0 END) AS self_service_count,
                SUM(CASE WHEN channel = 'SELF_SERVICE' THEN total_amount ELSE 0 END) AS self_service_value,
                SUM(txn_count) AS total_count, SUM(total_amount) AS total_value
         FROM v_report_agent_wise
         WHERE ${where}
         GROUP BY agent_id, agent_name, branch_name
         ORDER BY agent_name`,
        params,
      );
    },
  },

  'account-wise': {
    title: 'Report 2 - Account-wise Summary',
    roles: ['agent', 'admin'],
    columns: [
      { key: 'account_number', label: 'Account' },
      { key: 'holder_names', label: 'Holder(s)' },
      { key: 'plan_name', label: 'Plan' },
      { key: 'branch_name', label: 'Branch' },
      { key: 'status', label: 'Status' },
      { key: 'deposit_count', label: 'Deposits (count)', ...count },
      { key: 'deposit_total', label: 'Deposits (LKR)', ...money },
      { key: 'withdrawal_count', label: 'Withdrawals (count)', ...count },
      { key: 'withdrawal_total', label: 'Withdrawals (LKR)', ...money },
      { key: 'interest_total', label: 'Interest (LKR)', ...money },
      { key: 'current_balance', label: 'Current balance (LKR)', ...money },
    ],
    run: (user, { from, to }) => {
      const joinParams = [];
      const joinDates = dateClause('a.transaction_date', from, to, joinParams);
      const params = [...joinParams];
      let where = '1 = 1';
      if (user.role === 'agent') {
        where += ` AND b.account_id IN (${ACCOUNTS_OF_AGENT})`;
        params.push(user.agentId);
      }
      return run(
        `SELECT b.account_id, b.account_number, b.holder_names, b.plan_name, b.branch_name, b.status, b.current_balance,
                COALESCE(SUM(CASE WHEN a.transaction_type = 'DEPOSIT' THEN a.txn_count END), 0) AS deposit_count,
                COALESCE(SUM(CASE WHEN a.transaction_type = 'DEPOSIT' THEN a.total_amount END), 0) AS deposit_total,
                COALESCE(SUM(CASE WHEN a.transaction_type = 'WITHDRAWAL' THEN a.txn_count END), 0) AS withdrawal_count,
                COALESCE(SUM(CASE WHEN a.transaction_type = 'WITHDRAWAL' THEN a.total_amount END), 0) AS withdrawal_total,
                COALESCE(SUM(CASE WHEN a.transaction_type IN ('SAVINGS_INTEREST_CREDIT', 'FD_INTEREST_CREDIT')
                                  THEN a.total_amount END), 0) AS interest_total
         FROM v_report_account_balances b
         LEFT JOIN v_report_account_activity a ON a.account_id = b.account_id${joinDates}
         WHERE ${where}
         GROUP BY b.account_id, b.account_number, b.holder_names, b.plan_name, b.branch_name, b.status, b.current_balance
         ORDER BY b.account_number`,
        params,
      );
    },
  },

  'active-fds': {
    title: 'Report 3 - Active Fixed Deposits and Next Payout Date',
    roles: ['agent', 'admin'],
    columns: [
      { key: 'fd_id', label: 'FD' },
      { key: 'account_number', label: 'Account' },
      { key: 'holder_names', label: 'Holder(s)' },
      { key: 'tenure_months', label: 'Tenure (months)', ...count },
      { key: 'principal_amount', label: 'Principal (LKR)', ...money },
      { key: 'interest_rate_snapshot', label: 'Rate (%)', ...count },
      { key: 'start_date', label: 'Start' },
      { key: 'maturity_date', label: 'Maturity' },
      { key: 'next_payout_date', label: 'Next payout' },
    ],
    run: (user, { from, to }) => {
      const params = [];
      let where = '1 = 1';
      if (user.role === 'agent') {
        where += ` AND account_id IN (${ACCOUNTS_OF_AGENT})`;
        params.push(user.agentId);
      }
      where += dateClause('next_payout_date', from, to, params);
      return run(
        `SELECT fd_id, account_number, holder_names, tenure_months, principal_amount, interest_rate_snapshot,
                start_date, maturity_date, next_payout_date
         FROM v_report_active_fds
         WHERE ${where}
         ORDER BY next_payout_date, fd_id`,
        params,
      );
    },
  },

  'interest-distribution': {
    title: 'Report 4 - Monthly Interest Distribution by Account Type',
    roles: ['admin'],
    columns: [
      { key: 'month', label: 'Month' },
      { key: 'plan_name', label: 'Account type' },
      { key: 'interest_type', label: 'Interest type' },
      { key: 'txn_count', label: 'Credits (count)', ...count },
      { key: 'total_amount', label: 'Total (LKR)', ...money },
    ],
    run: (_user, { from, to }) => {
      const params = [];
      const where = `1 = 1${dateClause('transaction_date', from, to, params)}`;
      return run(
        `SELECT DATE_FORMAT(transaction_date, '%Y-%m') AS month, plan_name, interest_type,
                SUM(txn_count) AS txn_count, SUM(total_amount) AS total_amount
         FROM v_report_interest_distribution
         WHERE ${where}
         GROUP BY DATE_FORMAT(transaction_date, '%Y-%m'), plan_name, interest_type
         ORDER BY month DESC, plan_name, interest_type`,
        params,
      );
    },
  },

  'customer-activity': {
    title: 'Report 5 - Customer Activity',
    roles: ['agent', 'admin'],
    columns: [
      { key: 'full_name', label: 'Customer' },
      { key: 'account_number', label: 'Account' },
      { key: 'deposit_count', label: 'Deposits (count)', ...count },
      { key: 'total_deposits', label: 'Deposits (LKR)', ...money },
      { key: 'withdrawal_count', label: 'Withdrawals (count)', ...count },
      { key: 'total_withdrawals', label: 'Withdrawals (LKR)', ...money },
      { key: 'net_change', label: 'Net change (LKR)', ...money },
    ],
    run: (user, { from, to }) => {
      const params = [];
      let where = '1 = 1';
      if (user.role === 'agent') {
        where += ' AND agent_id = ?';
        params.push(user.agentId);
      }
      where += dateClause('transaction_date', from, to, params);
      return run(
        `SELECT customer_id, full_name, account_number,
                SUM(deposit_count) AS deposit_count, SUM(total_deposits) AS total_deposits,
                SUM(withdrawal_count) AS withdrawal_count, SUM(total_withdrawals) AS total_withdrawals,
                SUM(net_change) AS net_change
         FROM v_report_customer_activity
         WHERE ${where}
         GROUP BY customer_id, full_name, account_number
         ORDER BY full_name, account_number`,
        params,
      );
    },
  },
};

function periodText(from, to) {
  if (from && to) return `Period: ${from} to ${to}`;
  if (from) return `Period: from ${from}`;
  if (to) return `Period: up to ${to}`;
  return 'Period: all dates';
}

async function build(req) {
  const definition = REPORTS[req.params.type];
  if (!definition) throw notFound('Unknown report');
  if (!definition.roles.includes(req.user.role)) {
    throw forbidden(req.user.role === 'agent'
      ? 'The monthly interest report is only available to administrators'
      : 'Your role cannot view reports');
  }
  const from = optionalDate(req.query.from, 'from');
  const to = optionalDate(req.query.to, 'to');
  if (from && to && from > to) throw badRequest('The start date must not be after the end date');

  const rows = await definition.run(req.user, { from, to });
  return {
    type: req.params.type,
    title: definition.title,
    period: periodText(from, to),
    scope: req.user.role === 'agent' ? 'Your assigned customers only' : 'Whole bank',
    columns: definition.columns,
    rows,
  };
}

export async function viewReport(req, res, next) {
  try {
    res.json(await build(req));
  } catch (err) {
    next(err);
  }
}

export async function exportReport(req, res, next) {
  try {
    const format = req.query.format;
    if (format !== 'csv' && format !== 'pdf') throw badRequest('format must be csv or pdf');
    const report = await build(req);
    const fileName = `mims-${report.type}-${new Date().toISOString().slice(0, 10)}`;

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}.csv"`);
      res.send(`﻿${toCsv(report)}`);
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}.pdf"`);
    toPdf(report, res);
  } catch (err) {
    next(err);
  }
}
