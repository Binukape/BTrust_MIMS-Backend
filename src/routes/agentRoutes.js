import { Router } from 'express';
import { authenticateJWT } from '../middleware/authenticateJWT.js';
import { requireRole } from '../middleware/requireRole.js';
import { listAgents, createAgent, updateAgent } from '../controllers/agentController.js';

const router = Router();
router.use(authenticateJWT, requireRole('admin'));

router.get('/', listAgents);
router.post('/', createAgent);
router.put('/:id', updateAgent);

export default router;
