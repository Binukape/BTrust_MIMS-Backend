import { pool } from '../config/db.js';

export async function query(sql, params = [], conn = pool) {
  const [rows] = await conn.execute(sql, params);
  return rows;
}

export async function one(sql, params = [], conn = pool) {
  const rows = await query(sql, params, conn);
  return rows[0] ?? null;
}

export async function callProcedure(name, params, conn = pool) {
  const placeholders = params.map(() => '?').join(', ');
  const [results] = await conn.execute(`CALL ${name}(${placeholders})`, params);
  const firstResultSet = Array.isArray(results) ? results[0] : null;
  return Array.isArray(firstResultSet) ? (firstResultSet[0] ?? null) : null;
}

export async function withConnection(fn) {
  const conn = await pool.getConnection();
  try {
    return await fn(conn);
  } finally {
    conn.release();
  }
}

export async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      conn.destroy();
      throw err;
    }
    throw err;
  } finally {
    conn.release();
  }
}

export async function withAdmin(adminId, fn) {
  const conn = await pool.getConnection();
  try {
    await conn.query('SET @acting_admin_id = ?', [adminId]);
    return await fn(conn);
  } finally {
    try {
      await conn.query('SET @acting_admin_id = NULL');
      conn.release();
    } catch {
      conn.destroy();
    }
  }
}

export async function withNamedLock(name, fn, seconds = 5) {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query('SELECT GET_LOCK(?, ?) AS got', [name, seconds]);
    if (rows[0].got !== 1) {
      const err = new Error('The system is busy, please try again');
      err.status = 503;
      throw err;
    }
    try {
      return await fn(conn);
    } finally {
      await conn.query('SELECT RELEASE_LOCK(?)', [name]);
    }
  } finally {
    conn.release();
  }
}
