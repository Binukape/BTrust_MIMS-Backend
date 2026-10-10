import {Router} from 'express';
import {authenticateJWT} from '../middleware/authenticateJWT.js';
import {requireRole} from '../middleware/requireRole.js';
import {listBranches, createBranch, updateBranch, deleteBranch} from '../controllers/branchController.js';

const router = Router();
router.use(authenticateJWT, requireRole('admin'));

router.get('/', listBranches);
router.post('/', createBranch);
router.put('/:id', updateBranch);
router.delete('/:id', deleteBranch);

export default router;
