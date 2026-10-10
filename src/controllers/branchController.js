import { query, one, withAdmin } from '../services/dbService.js';
import { notFound } from '../utils/errors.js';
import { id as toId, str, phone } from '../utils/validate.js';

function readBranch(body) {
  return {
    name: str(body, 'branch_name', { max: 100, label: 'Branch name' }),
    address: str(body, 'branch_address', { max: 255, label: 'Branch address' }),
    phone: phone(body?.branch_phone),
  };
}

export async function listBranches(_req, res, next) {
  try {
    const rows = await query(
      `SELECT b.branch_id, b.branch_name, b.branch_address, b.branch_phone,
              (SELECT COUNT(*) FROM agent a WHERE a.branch_id = b.branch_id) AS agent_count,
              (SELECT COUNT(*) FROM savings_account sa WHERE sa.branch_id = b.branch_id) AS account_count
       FROM branch b
       ORDER BY b.branch_name`,
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

export async function createBranch(req, res, next) {
  try {
    const b = readBranch(req.body);
    const created = await withAdmin(req.user.adminId, async (conn) => {
      const [result] = await conn.execute(
        'INSERT INTO branch (branch_name, branch_address, branch_phone) VALUES (?, ?, ?)',
        [b.name, b.address, b.phone],
      );
      return one('SELECT * FROM branch WHERE branch_id = ?', [result.insertId], conn);
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}

export async function updateBranch(req, res, next) {
  try {
    const branchId = toId(req.params.id, 'branch id');
    const b = readBranch(req.body);
    const updated = await withAdmin(req.user.adminId, async (conn) => {
      const [result] = await conn.execute(
        'UPDATE branch SET branch_name = ?, branch_address = ?, branch_phone = ? WHERE branch_id = ?',
        [b.name, b.address, b.phone, branchId],
      );
      if (result.affectedRows === 0) throw notFound('Branch not found');
      return one('SELECT * FROM branch WHERE branch_id = ?', [branchId], conn);
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function deleteBranch(req, res, next) {
  try {
    const branchId = toId(req.params.id, 'branch id');
    await withAdmin(req.user.adminId, async (conn) => {
      const [result] = await conn.execute('DELETE FROM branch WHERE branch_id = ?', [branchId]);
      if (result.affectedRows === 0) throw notFound('Branch not found');
    });
    res.json({ message: 'Branch deleted' });
  } catch (err) {
    next(err);
  }
}
