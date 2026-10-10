import { query } from '../services/dbService.js';
import { badRequest } from '../utils/errors.js';

const TABLES = ['branch', 'agent', 'savings_plan'];

export async function listAuditLog(req, res, next) {
  try {
    const params = [];
    let where = '1 = 1';
    if (req.query.table) {
      if (!TABLES.includes(req.query.table)) throw badRequest('table must be branch, agent or savings_plan');
      where += ' AND l.table_name = ?';
      params.push(req.query.table);
    }
    const rows = await query(
      `SELECT l.log_id, l.changed_at, ad.full_name AS admin_name, l.action, l.table_name, l.record_id,
              l.old_values, l.new_values
       FROM admin_audit_log l JOIN admin ad ON ad.admin_id = l.admin_id
       WHERE ${where}
       ORDER BY l.log_id DESC
       LIMIT 300`,
      params,
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}
