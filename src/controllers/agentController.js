import bcrypt from 'bcryptjs';
import { query, one, withAdmin } from '../services/dbService.js';
import { usernameTaken } from '../services/access.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { id as toId, str, nic, username as validUsername, password as validPassword } from '../utils/validate.js';

const AGENT_COLUMNS = `a.agent_id, a.branch_id, b.branch_name, a.agent_name, a.agent_nic, a.username, a.created_at,
  (SELECT COUNT(*) FROM customer c WHERE c.agent_id = a.agent_id) AS customer_count`;

export async function listAgents(_req, res, next) {
  try {
    const rows = await query(
      `SELECT ${AGENT_COLUMNS}
       FROM agent a JOIN branch b ON b.branch_id = a.branch_id
       ORDER BY a.agent_name`,
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

export async function createAgent(req, res, next) {
  try {
    const body = req.body ?? {};
    const branchId = toId(body.branch_id, 'branch');
    const name = str(body, 'agent_name', { max: 100, label: 'Agent name' });
    const agentNic = nic(body.agent_nic);
    const user = validUsername(body.username);
    const hash = await bcrypt.hash(validPassword(body.password), 10);

    if (await usernameTaken(user)) throw conflict('That username is already taken');
    if (!(await one('SELECT 1 AS ok FROM branch WHERE branch_id = ?', [branchId]))) {
      throw badRequest('The selected branch does not exist');
    }

    const created = await withAdmin(req.user.adminId, async (conn) => {
      const [result] = await conn.execute(
        'INSERT INTO agent (branch_id, agent_name, agent_nic, username, password_hash) VALUES (?, ?, ?, ?, ?)',
        [branchId, name, agentNic, user, hash],
      );
      return one(
        `SELECT ${AGENT_COLUMNS} FROM agent a JOIN branch b ON b.branch_id = a.branch_id WHERE a.agent_id = ?`,
        [result.insertId],
        conn,
      );
    });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}

export async function updateAgent(req, res, next) {
  try {
    const agentId = toId(req.params.id, 'agent id');
    const body = req.body ?? {};
    if (body.branch_id !== undefined) {
      throw badRequest('An agent cannot be moved to a different branch');
    }

    const name = str(body, 'agent_name', { max: 100, label: 'Agent name' });
    const agentNic = nic(body.agent_nic);
    const user = validUsername(body.username);
    const newPassword = body.password ? validPassword(body.password) : null;

    const current = await one('SELECT username FROM agent WHERE agent_id = ?', [agentId]);
    if (!current) throw notFound('Agent not found');
    if (user !== current.username && (await usernameTaken(user))) throw conflict('That username is already taken');

    const updated = await withAdmin(req.user.adminId, async (conn) => {
      if (newPassword) {
        const hash = await bcrypt.hash(newPassword, 10);
        await conn.execute(
          'UPDATE agent SET agent_name = ?, agent_nic = ?, username = ?, password_hash = ? WHERE agent_id = ?',
          [name, agentNic, user, hash, agentId],
        );
      } else {
        await conn.execute(
          'UPDATE agent SET agent_name = ?, agent_nic = ?, username = ? WHERE agent_id = ?',
          [name, agentNic, user, agentId],
        );
      }
      return one(
        `SELECT ${AGENT_COLUMNS} FROM agent a JOIN branch b ON b.branch_id = a.branch_id WHERE a.agent_id = ?`,
        [agentId],
        conn,
      );
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
}
