# BTrust_MIMS-Backend

Express.js REST API for the B-Trust Microbanking and Interest Management System (MIMS), Group 28.
It talks to MySQL with raw, parameterized SQL (`mysql2`) and calls the stored procedures of the BTrust-MIMS-DB repository. No ORM.

## Run it locally

1. Start the database from the BTrust-MIMS-DB repository: `docker compose up -d`, then create the sample transactions once: `docker compose exec db mysql -uroot -prootpassword mims_db -e "CALL sp_seed_sample_transactions(100);"` (database on host port 3307).
2. Copy `.env.example` to `.env` and fill it in (`DB_PORT=3307`; when the `MIMS_*_PASSWORD` variables are not set, the local database accounts use the dev passwords `dev_app_pw` and `dev_reports_pw`, see `init/10_users.sh` in the database repository).
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

Never commit `.env`. On the Azure server the values come from `/opt/mims/.env`, which is never committed.

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

## Docker image and deployment

The `Dockerfile` builds a production image (Node 22, runs `node src/server.js` as the `node` user on port 4000). Settings are passed as environment variables.

```bash
docker build -t btrust-mims-backend .
```

Pushing to `main` runs `.github/workflows/deploy.yml`: it checks the code (`npm ci`, `node --check src/server.js`), builds the image, pushes it to ghcr.io as `btrust-mims-backend:latest` and with the commit id, then updates the Azure server (`docker compose pull backend` and `up -d`) and checks `/api/health` on the public site. Pull requests only run the check. A change that also needs a database change must wait for the database repository's Reset database workflow.

## Demo logins

Live site: https://btrust-mims-xyz.centralindia.cloudapp.azure.com

Every seeded login uses the demo password `password123`.

| Role | Usernames |
|---|---|
| Administrator | `admin.demo` |
| Agents | `nimal.perera`, `kamala.silva`, `sunil.bandara`, `priya.rajapaksa`, `kumar.selvam` |
| Customers | `anura.fernando`, `dilani.wick`, `somasiri.g`, `tharindu.j`, `sithumini.p`, `ruwan.k`, `chamara.r`, `ishara.desilva`, `priyantha.w`, `nadeeka.a`, `kavindu.s`, `malithi.g`, `vishwa.b`, `sanduni.r`, `buddhika.e` |

Which agent, account and plan belongs to each customer is listed in the README of the BTrust-MIMS-DB repository.

## Testing

With the API and the seeded database running:

```bash
npm run test:smoke
```

## Contributions

| Member | Work in this repository |
|---|---|
| Pranav M.A. | setup, database service and access checks, deposit and withdraw endpoints, fixed deposit endpoints, plan lookup routes, the app wiring and server entry |
| Ranathunga N.R.A.K.H.K. | JWT authentication and role checks, login, branch endpoints, agent endpoints, audit log endpoint, referer check and login limiter |
| Jackson J.W. | shared utilities, customer registration and listing, account opening and status changes |
| Isiwara M.A.G.A. | error handler, environment example, CSV and PDF export, report endpoints, the 77-check API smoke test |
| Perera K.D.B.M. (Binuka) | Dockerfile, `.dockerignore`, README, deployment workflow |

### Files per person

**Pranav M.A.** (14 files): `package.json`, `package-lock.json`, `.gitignore`, `src/config/db.js`, `src/config/env.js`, `src/services/access.js`, `src/services/dbService.js`, `src/controllers/transactionController.js`, `src/routes/transactionRoutes.js`, `src/controllers/fixedDepositController.js`, `src/routes/fixedDepositRoutes.js`, `src/routes/referenceRoutes.js`, `src/app.js`, `src/server.js`

**Ranathunga N.R.A.K.H.K.** (12 files): `src/middleware/authenticateJWT.js`, `src/middleware/requireRole.js`, `src/controllers/authController.js`, `src/routes/authRoutes.js`, `src/controllers/branchController.js`, `src/routes/branchRoutes.js`, `src/controllers/agentController.js`, `src/routes/agentRoutes.js`, `src/controllers/auditController.js`, `src/routes/auditRoutes.js`, `src/middleware/checkReferer.js`, `src/middleware/loginLimiter.js`

**Jackson J.W.** (7 files): `src/utils/dates.js`, `src/utils/errors.js`, `src/utils/validate.js`, `src/controllers/customerController.js`, `src/routes/customerRoutes.js`, `src/controllers/accountController.js`, `src/routes/accountRoutes.js`

**Isiwara M.A.G.A.** (6 files): `src/middleware/errorHandler.js`, `.env.example`, `src/reports/exporters.js`, `src/controllers/reportController.js`, `src/routes/reportRoutes.js`, `scripts/smoke-test.js`

**Perera K.D.B.M. (Binuka)**: `Dockerfile`, `.dockerignore`, `README.md`, `.github/workflows/deploy.yml`
