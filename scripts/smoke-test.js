import 'dotenv/config';

const BASE = process.env.API_URL || `http://localhost:${process.env.PORT || 4000}`;
const ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL  ${name} ${detail}`);
  }
}

async function call(method, path, { token, body, referer = ORIGIN, raw = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (referer) headers.Referer = `${referer}/`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (raw) return res;
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

async function login(username, password = 'password123') {
  const res = await call('POST', '/auth/login', { body: { username, password } });
  return res.data?.token;
}

const suffix = String(Date.now()).slice(-6);

async function main() {
  console.log(`Smoke test against ${BASE}\n`);

  console.log('Health and login');
  check('health endpoint answers', (await call('GET', '/health')).status === 200);
  const admin = await login('admin.demo');
  const agent1 = await login('nimal.perera');
  const agent2 = await login('kamala.silva');
  const cust1 = await login('anura.fernando');
  const cust4 = await login('tharindu.j');
  check('admin, agent and customer can log in', Boolean(admin && agent1 && agent2 && cust1 && cust4));
  check('wrong password is rejected (401)', (await call('POST', '/auth/login', { body: { username: 'nimal.perera', password: 'nope' } })).status === 401);
  check('unknown user is rejected (401)', (await call('POST', '/auth/login', { body: { username: 'ghost', password: 'password123' } })).status === 401);
  check('request without Referer/Origin is rejected (403)', (await call('POST', '/auth/login', { body: { username: 'nimal.perera', password: 'password123' }, referer: null })).status === 403);
  check('request from another origin is rejected (403)', (await call('POST', '/auth/login', { body: { username: 'nimal.perera', password: 'password123' }, referer: 'http://evil.example' })).status === 403);
  check('protected route without a token is rejected (401)', (await call('GET', '/accounts')).status === 401);

  console.log('\nRole checks');
  check('customer cannot list branches (403)', (await call('GET', '/branches', { token: cust1 })).status === 403);
  check('agent cannot list branches (403)', (await call('GET', '/branches', { token: agent1 })).status === 403);
  check('agent cannot see the interest report (403)', (await call('GET', '/reports/interest-distribution', { token: agent1 })).status === 403);
  check('customer cannot view reports (403)', (await call('GET', '/reports/agent-wise', { token: cust1 })).status === 403);
  check('admin cannot deposit (403)', (await call('POST', '/transactions/deposit', { token: admin, body: { account_id: 1, amount: '10' } })).status === 403);

  console.log('\nAgent and customer data scope');
  const agent1Customers = (await call('GET', '/customers', { token: agent1 })).data;
  check('agent 1 sees only their own customers (all have agent_id 1, includes 1, 2, 9, 14, none of 3-8)', Array.isArray(agent1Customers) && agent1Customers.every((c) => c.agent_id === 1) && [1, 2, 9, 14].every((n) => agent1Customers.some((c) => c.customer_id === n)) && ![3, 4, 5, 6, 7, 8].some((n) => agent1Customers.some((c) => c.customer_id === n)), JSON.stringify(agent1Customers?.map?.((c) => c.customer_id)));
  check('customer list never exposes password hashes', !JSON.stringify(agent1Customers).includes('password_hash'));
  check('admin sees all 15+ customers', (await call('GET', '/customers', { token: admin })).data.length >= 15);
  check('agent 1 cannot open a joint account belonging to other agents (403)', (await call('GET', '/accounts/7', { token: agent1 })).status === 403);
  check('agent 1 cannot read another agent\'s customer (403)', (await call('GET', '/customers/3', { token: agent1 })).status === 403);
  const myAccounts = (await call('GET', '/accounts', { token: cust1 })).data;
  check('customer 1 sees only accounts they hold (includes account 1, every row lists them as a holder)', myAccounts.some((a) => a.account_id === 1) && myAccounts.every((a) => a.holder_names.includes('Anura Fernando')));
  check('customer cannot read someone else\'s account (403)', (await call('GET', '/accounts/2', { token: cust1 })).status === 403);

  console.log('\nDeposits and withdrawals (need 09:00-17:00 Sri Lanka time)');
  const before = Number((await call('GET', '/accounts/1', { token: cust1 })).data.balance);
  const dep = await call('POST', '/transactions/deposit', { token: cust1, body: { account_id: 1, amount: '1000.00' } });
  check('customer deposit works and returns a reference number', dep.status === 201 && /^TXN-\d{8}-\d{6}$/.test(dep.data?.reference_number), JSON.stringify(dep.data));
  const wd = await call('POST', '/transactions/withdraw', { token: agent1, body: { account_id: 1, amount: '400.00' } });
  check('agent withdrawal on behalf of the customer works', wd.status === 201, JSON.stringify(wd.data));
  const after = Number((await call('GET', '/accounts/1', { token: cust1 })).data.balance);
  check('balance went up by exactly 600.00', Math.abs(after - before - 600) < 0.001, `${before} -> ${after}`);
  check('overdraw is rejected (400)', (await call('POST', '/transactions/withdraw', { token: cust1, body: { account_id: 1, amount: '99999999.00' } })).status === 400);
  check('withdrawal above the daily limit is rejected (400)', (await call('POST', '/transactions/withdraw', { token: agent1, body: { account_id: 2, amount: '100001.00' } })).status === 400);
  check('amount with 3 decimals is rejected (400)', (await call('POST', '/transactions/deposit', { token: cust1, body: { account_id: 1, amount: '1.234' } })).status === 400);
  check('negative amount is rejected (400)', (await call('POST', '/transactions/deposit', { token: cust1, body: { account_id: 1, amount: '-5' } })).status === 400);
  check('customer cannot deposit into someone else\'s account (403)', (await call('POST', '/transactions/deposit', { token: cust1, body: { account_id: 2, amount: '10.00' } })).status === 403);
  const history = (await call('GET', '/transactions?account_id=1', { token: cust1 })).data;
  check('transaction history lists the new rows, newest first', history.length > 0 && history[0].transaction_type === 'WITHDRAWAL' && history[1].transaction_type === 'DEPOSIT');
  check('agent on the withdrawal row is recorded', history[0].agent_name === 'Nimal Perera' && history[1].agent_name === null);

  console.log('\nFixed deposits');
  const fdOpen = await call('POST', '/fixed-deposits', { token: agent2, body: { account_id: 4, fd_plan_id: 1, principal_amount: '2000.00' } });
  check('agent opens an FD for their customer', fdOpen.status === 201 && fdOpen.data?.fd_id, JSON.stringify(fdOpen.data));
  const fdId = fdOpen.data?.fd_id;
  check('a second active FD on the same account is rejected (400)', (await call('POST', '/fixed-deposits', { token: cust4, body: { account_id: 4, fd_plan_id: 2, principal_amount: '1000.00' } })).status === 400);
  const preview = (await call('GET', `/fixed-deposits/${fdId}/early-closure-preview`, { token: cust4 })).data;
  check('early-closure preview: penalty 2000 x 13% x 90/365 = 64.11', preview?.penalty === '64.11' && preview?.net_credited === '1935.89', JSON.stringify(preview));
  check('a dormant/closed status change is refused while an FD is active (400)', (await call('POST', '/accounts/4/status', { token: agent2, body: { status: 'DORMANT' } })).status === 400);
  const close = await call('POST', `/fixed-deposits/${fdId}/close-early`, { token: cust4 });
  check('customer closes the FD early', close.status === 200 && close.data?.penalty_charged === '64.11', JSON.stringify(close.data));
  const txs = (await call('GET', '/transactions?account_id=4', { token: cust4 })).data.filter((t) => String(t.fd_id) === String(fdId)).map((t) => t.transaction_type).sort().join();
  check('FD produced opening debit, payout and penalty rows', txs === 'FD_EARLY_CLOSURE_ADJUSTMENT,FD_EARLY_CLOSURE_PAYOUT,FD_OPENING_DEBIT', txs);
  check('closing it again is rejected (400)', (await call('POST', `/fixed-deposits/${fdId}/close-early`, { token: cust4 })).status === 400);
  check('another agent cannot open an FD on this account (403)', (await call('POST', '/fixed-deposits', { token: agent1, body: { account_id: 4, fd_plan_id: 1, principal_amount: '500.00' } })).status === 403);

  console.log('\nAgent registers customers and opens accounts');
  const newUser = `test.user.${suffix}`;
  const reg = await call('POST', '/customers', { token: agent1, body: { full_name: 'Test Customer', nic_number: `19950${suffix}01`.slice(0, 12), address: '1 Test Road, Colombo', phone: '0771234567', date_of_birth: '1995-05-05', username: newUser, password: 'password123' } });
  check('agent registers a new customer under themselves', reg.status === 201 && reg.data.agent_id === 1, JSON.stringify(reg.data));
  const newCustId = reg.data?.customer_id;
  check('duplicate username is rejected (409)', (await call('POST', '/customers', { token: agent1, body: { full_name: 'X Y', nic_number: `19960${suffix}01`.slice(0, 12), address: 'a', phone: '0771234567', date_of_birth: '1990-01-01', username: newUser, password: 'password123' } })).status === 409);
  check('username that belongs to an admin is rejected (409)', (await call('POST', '/customers', { token: agent1, body: { full_name: 'X Y', nic_number: `19970${suffix}01`.slice(0, 12), address: 'a', phone: '0771234567', date_of_birth: '1990-01-01', username: 'admin.demo', password: 'password123' } })).status === 409);
  check('duplicate NIC is rejected (409)', (await call('POST', '/customers', { token: agent1, body: { full_name: 'X Y', nic_number: '199045612345', address: 'a', phone: '0771234567', date_of_birth: '1990-01-01', username: `other.${suffix}`, password: 'password123' } })).status === 409);
  check('bad NIC format is rejected (400)', (await call('POST', '/customers', { token: agent1, body: { full_name: 'X Y', nic_number: '12345', address: 'a', phone: '0771234567', date_of_birth: '1990-01-01', username: `bad.${suffix}`, password: 'password123' } })).status === 400);
  check('admin cannot register customers (403)', (await call('POST', '/customers', { token: admin, body: {} })).status === 403);

  const plans = (await call('GET', '/reference/savings-plans', { token: agent1 })).data;
  const plan = (name) => plans.find((p) => p.plan_name === name).plan_id;
  const adultAcc = await call('POST', '/accounts', { token: agent1, body: { plan_id: plan('Adult'), holder_customer_ids: [newCustId] } });
  check('Adult account opens for an adult customer', adultAcc.status === 201 && /^SA\d{8}$/.test(adultAcc.data?.account_number), JSON.stringify(adultAcc.data));
  check('a child cannot get an Adult account (400, age band)', (await call('POST', '/accounts', { token: agent1, body: { plan_id: plan('Adult'), holder_customer_ids: [14] } })).status === 400);
  check('a Joint account with one holder is rejected (400)', (await call('POST', '/accounts', { token: agent1, body: { plan_id: plan('Joint'), holder_customer_ids: [1] } })).status === 400);
  check('an account for another agent\'s customer is rejected (400)', (await call('POST', '/accounts', { token: agent1, body: { plan_id: plan('Adult'), holder_customer_ids: [3] } })).status === 400);
  const jointAcc = await call('POST', '/accounts', { token: agent1, body: { plan_id: plan('Joint'), holder_customer_ids: [1, newCustId], initial_deposit: '6000.00' } });
  check('Joint account opens with two holders and an opening deposit', jointAcc.status === 201 && jointAcc.data?.is_joint === 1 && Number(jointAcc.data?.balance) === 6000 && !jointAcc.data?.note, JSON.stringify(jointAcc.data));
  check('Joint account is visible to the other holder', (await call('GET', `/accounts/${jointAcc.data?.account_id}`, { token: cust1 })).status === 200);

  console.log('\nAccount status (DORMANT / CLOSED)');
  const accId = adultAcc.data?.account_id;
  check('agent marks the account DORMANT', (await call('POST', `/accounts/${accId}/status`, { token: agent1, body: { status: 'DORMANT' } })).data?.status === 'DORMANT');
  const newCust = await login(newUser);
  check('deposit into a DORMANT account is rejected (400)', (await call('POST', '/transactions/deposit', { token: newCust, body: { account_id: accId, amount: '100.00' } })).status === 400);
  check('agent reactivates it', (await call('POST', `/accounts/${accId}/status`, { token: agent1, body: { status: 'ACTIVE' } })).data?.status === 'ACTIVE');
  check('agent closes it', (await call('POST', `/accounts/${accId}/close`, { token: agent1 })).data?.status === 'CLOSED');
  check('a CLOSED account cannot be reopened (400)', (await call('POST', `/accounts/${accId}/status`, { token: agent1, body: { status: 'ACTIVE' } })).status === 400);

  console.log('\nAdmin: branches, agents and the audit log');
  const branch = await call('POST', '/branches', { token: admin, body: { branch_name: `Test Branch ${suffix}`, branch_address: '9 Test Street', branch_phone: '0112223344' } });
  check('admin creates a branch', branch.status === 201, JSON.stringify(branch.data));
  const bId = branch.data?.branch_id;
  check('admin edits the branch', (await call('PUT', `/branches/${bId}`, { token: admin, body: { branch_name: `Test Branch ${suffix} B`, branch_address: '9 Test Street', branch_phone: '0112223355' } })).status === 200);
  const newAgent = await call('POST', '/agents', { token: admin, body: { branch_id: bId, agent_name: 'Test Agent', agent_nic: `19880${suffix}02`.slice(0, 12), username: `test.agent.${suffix}`, password: 'password123' } });
  check('admin creates an agent in that branch', newAgent.status === 201 && newAgent.data.branch_id === bId, JSON.stringify(newAgent.data));
  check('the new agent can log in', Boolean(await login(`test.agent.${suffix}`)));
  check('an agent cannot be moved to another branch (400)', (await call('PUT', `/agents/${newAgent.data.agent_id}`, { token: admin, body: { branch_id: 1, agent_name: 'Test Agent', agent_nic: newAgent.data.agent_nic, username: newAgent.data.username } })).status === 400);
  check('admin edits agent name (no password change)', (await call('PUT', `/agents/${newAgent.data.agent_id}`, { token: admin, body: { agent_name: 'Test Agent Renamed', agent_nic: newAgent.data.agent_nic, username: newAgent.data.username } })).data?.agent_name === 'Test Agent Renamed');
  check('deleting a branch that has an agent is refused (409)', (await call('DELETE', `/branches/${bId}`, { token: admin })).status === 409);
  check('deleting the main branch with dependants is refused (409)', (await call('DELETE', '/branches/1', { token: admin })).status === 409);
  const emptyBranch = await call('POST', '/branches', { token: admin, body: { branch_name: `Empty Branch ${suffix}`, branch_address: '1 Empty Lane', branch_phone: '0112223366' } });
  check('an empty branch can be deleted', (await call('DELETE', `/branches/${emptyBranch.data.branch_id}`, { token: admin })).status === 200);
  const audit = (await call('GET', '/audit-log', { token: admin })).data;
  check('audit log records the admin actions with the admin name', audit.length >= 5 && audit[0].admin_name === 'Demo Administrator', JSON.stringify(audit[0]));
  check('audit log never contains password hashes', !JSON.stringify(audit).includes('$2'));
  check('audit log is admin only (403 for agent)', (await call('GET', '/audit-log', { token: agent1 })).status === 403);

  console.log('\nReports');
  const r1admin = (await call('GET', '/reports/agent-wise', { token: admin })).data;
  const r1agent = (await call('GET', '/reports/agent-wise', { token: agent1 })).data;
  check('Report 1 (admin) lists all agents', r1admin.rows.length >= 5, String(r1admin.rows?.length));
  check('Report 1 (agent) only shows that agent', r1agent.rows.length === 1 && r1agent.rows[0].agent_name === 'Nimal Perera');
  const r2 = (await call('GET', '/reports/account-wise', { token: agent1 })).data;
  check('Report 2 (agent) only shows accounts of their customers', r2.rows.length > 0 && !r2.rows.some((r) => r.account_number === 'SA00000007'));
  check('Report 3 returns active FDs with a next payout date', (await call('GET', '/reports/active-fds', { token: admin })).data.rows.every((r) => r.next_payout_date));
  check('Report 4 (admin) returns monthly interest rows', (await call('GET', '/reports/interest-distribution', { token: admin })).data.rows.length > 0);
  const r5 = (await call('GET', '/reports/customer-activity', { token: agent1 })).data;
  check('Report 5 (agent) only shows their customers', r5.rows.length > 0 && !r5.rows.some((r) => [3, 4, 5].includes(r.customer_id)));
  const r1filtered = (await call('GET', '/reports/agent-wise?from=2999-01-01&to=2999-12-31', { token: admin })).data;
  check('date range filter works (future range has no rows)', r1filtered.rows.length === 0);
  check('bad date is rejected (400)', (await call('GET', '/reports/agent-wise?from=31-12-2026', { token: admin })).status === 400);
  const csv = await call('GET', '/reports/agent-wise/export?format=csv', { token: admin, raw: true });
  const csvText = await csv.text();
  check('CSV export downloads with a header row', csv.status === 200 && csv.headers.get('content-type').startsWith('text/csv') && csvText.includes('Agent,Branch'), csvText.slice(0, 80));
  const pdf = await call('GET', '/reports/account-wise/export?format=pdf', { token: agent1, raw: true });
  const pdfBytes = Buffer.from(await pdf.arrayBuffer());
  check('PDF export downloads and is a real PDF', pdf.status === 200 && pdf.headers.get('content-type') === 'application/pdf' && pdfBytes.slice(0, 4).toString() === '%PDF' && pdfBytes.length > 1500, `${pdfBytes.length} bytes`);
  check('unknown report is 404', (await call('GET', '/reports/nothing', { token: admin })).status === 404);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('Failed checks:');
    failures.forEach((f) => console.log(` - ${f}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
