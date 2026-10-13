# BTrust_MIMS-Backend

Express.js REST API for the B-Trust Microbanking and Interest Management System (MIMS), Group 28.
It talks to MySQL with raw, parameterized SQL (`mysql2`) and calls the stored procedures of the BTrust-MIMS-DB repository. No ORM.

## Run it locally

1. Start the database from the BTrust-MIMS-DB repository: `docker compose up -d`, then create the sample transactions once: `docker compose exec db mysql -uroot -prootpassword mims_db -e "CALL sp_seed_sample_transactions(100);"` (database on host port 3307).
2. Copy `.env.example` to `.env` and fill it in (`DB_PORT=3307`; the local dev passwords are in `init/10_users_dev.sql` of the database repository).
3. Install and start:

```bash
npm install
npm run dev
```

The API listens on port 4000. `GET /health` answers `{"status":"ok"}`.

## Environment variables

| Variable | Purpose |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME` | MySQL location |
| `DB_USER`, `DB_PASSWORD` | the **mims_app** account (normal requests) |
| `REPORTS_DB_USER`, `REPORTS_DB_PASSWORD` | the **mims_reports** account (read-only, report views) |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | signing key and lifetime of login tokens |
| `ALLOWED_ORIGIN` | the frontend's address: used for CORS and the Referer/Origin check |

Never commit `.env`. On Aiven and Render the passwords are set in their consoles / environment settings.

## How it is organised

```
src/
  config/        env.js (validated settings), db.js (main pool of 20 + small reports pool)
  middleware/    authenticateJWT, requireRole, checkReferer, loginLimiter, errorHandler
  controllers/   one file per area (auth, branch, agent, customer, account, transaction, fixedDeposit, report, audit)
  routes/        one router per area
  services/      dbService.js (queries, procedure calls, transactions, admin audit connection), access.js (who may see what)
  reports/       exporters.js (CSV and PDF)
  app.js, server.js
scripts/smoke-test.js   end-to-end test of the API (77 checks)
```

## Rules the API enforces (on top of the database)

- **Roles:** Customer, Agent, Admin (JWT, bcrypt). Wrong role gives 403.
- **Scope:** an Agent only sees their own customers and those customers' accounts; a Customer only their own accounts. Admin sees everything.
- **Admin changes** (branches, agents, savings plans) run on one connection with `SET @acting_admin_id = <admin>` so the database audit log records who did it.
- **CSRF/XSS:** CORS is limited to `ALLOWED_ORIGIN`; no change is made by a GET; every POST/PUT/DELETE must carry a `Referer` or `Origin` from `ALLOWED_ORIGIN`.
- **Money** only moves through `sp_deposit`, `sp_withdraw`, `sp_open_fd`, `sp_close_fd_early`. The `mims_app` account cannot write balances or transactions.
- **Age bands, joint-account holder counts, account status changes** are checked here.

## Endpoints

| Area | Endpoint | Who |
|---|---|---|
| Auth | `POST /auth/login`, `GET /auth/me` | anyone / logged in |
| Branches | `GET/POST /branches`, `PUT/DELETE /branches/:id` | admin |
| Agents | `GET/POST /agents`, `PUT /agents/:id` (never the branch) | admin |
| Customers | `POST /customers`, `GET /customers`, `GET /customers/:id` | agent / agent+admin / all (own) |
| Accounts | `GET /accounts`, `GET /accounts/:id`, `POST /accounts`, `POST /accounts/:id/status`, `POST /accounts/:id/close` | scoped by role; open/status/close: agent (+admin for status) |
| Transactions | `POST /transactions/deposit`, `POST /transactions/withdraw`, `GET /transactions?account_id=` | customer, agent (history: admin too) |
| Fixed deposits | `GET /fixed-deposits?account_id=`, `GET /fixed-deposits/:id`, `POST /fixed-deposits`, `GET /fixed-deposits/:id/early-closure-preview`, `POST /fixed-deposits/:id/close-early` | customer, agent |
| Reference | `GET /reference/savings-plans`, `GET /reference/fd-plans` | logged in |
| Reports | `GET /reports/:type?from=&to=`, `GET /reports/:type/export?format=csv\|pdf` (types: `agent-wise`, `account-wise`, `active-fds`, `interest-distribution` (admin only), `customer-activity`) | agent, admin |
| Audit | `GET /audit-log?table=` | admin |

## Docker image

The `Dockerfile` builds a production image (Node 22, runs `node src/server.js` as the `node` user on port 4000). Settings are passed as environment variables.

```bash
docker build -t btrust-mims-backend .
```

## Testing

With the API and the seeded database running:

```bash
npm run test:smoke
```
