import app from './app.js';
import { env } from './config/env.js';
import { pool, reportsPool } from './config/db.js';

async function start() {
  await pool.query('SELECT 1');
  await reportsPool.query('SELECT 1');

  const server = app.listen(env.port, () => {
    console.log(`MIMS API listening on port ${env.port}`);
  });

  const shutdown = async () => {
    server.close();
    await pool.end();
    await reportsPool.end();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((err) => {
  console.error('Could not start the server:', err.message);
  process.exit(1);
});
