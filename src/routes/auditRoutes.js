import { Router } from 'express';
import { authenticateJWT } from '../middleware/authenticateJWT.js';
import { requireRole } from '../middleware/requireRole.js';
import { listAuditLog } from '../controllers/auditController.js';

const router = Router();
router.use(authenticateJWT, requireRole('admin'));

router.get('/', listAuditLog);

export default router;
