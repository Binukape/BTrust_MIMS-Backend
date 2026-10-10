import { one } from './dbService.js';
// import utils added

import { forbidden, notFound } from '../utils/errors.js';
import { id as toId } from '../utils/validate.js';






export async function assertAccountAccess(user, rawAccountId) {
  const accountId = toId(rawAccountId, 'account_id');
  const account = await one('SELECT account_id, status FROM savings_account WHERE account_id = ?', [accountId]);
  if (!account) throw notFound('Savings account not found');

  if (user.role === 'admin') return account;

  if (user.role === 'customer') {
    const holder = await one(
      'SELECT 1 AS ok FROM account_holder WHERE account_id = ? AND customer_id = ?',
      [accountId, user.customerId],
    );
    if (!holder) throw forbidden('This account does not belong to you');
    return account;
  }

  if (user.role === 'agent') {
    const assigned = await one(
      `SELECT 1 AS ok
       FROM account_holder ah
       JOIN customer c ON c.customer_id = ah.customer_id
       WHERE ah.account_id = ? AND c.agent_id = ?`,
      [accountId, user.agentId],
    );
    if (!assigned) throw forbidden('This account does not belong to one of your customers');
    return account;
  }

  throw forbidden();
}

export async function assertCustomerAccess(user, rawCustomerId) {
  const customerId = toId(rawCustomerId, 'customer_id');
  const customer = await one('SELECT customer_id, agent_id FROM customer WHERE customer_id = ?', [customerId]);
  if (!customer) throw notFound('Customer not found');

  if (user.role === 'admin') return customer;
  if (user.role === 'customer' && customer.customer_id === user.customerId) return customer;
  if (user.role === 'agent' && customer.agent_id === user.agentId) return customer;
  throw forbidden('You are not allowed to see this customer');
}

export async function usernameTaken(username, conn) {
  const row = await one(
    `SELECT 1 AS taken FROM admin WHERE username = ?
     UNION ALL SELECT 1 FROM agent WHERE username = ?
     UNION ALL SELECT 1 FROM customer WHERE username = ?`,
    [username, username, username],
    conn,
  );
  return Boolean(row);
}
