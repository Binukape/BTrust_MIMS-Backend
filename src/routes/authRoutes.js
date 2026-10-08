import {Router} from 'express';
import {login, me} from '../controllers/authController.js';
import {authenticateJWT} from '../middleware/authenticateJWT.js';
import {loginLimiter} from '../middleware/loginLimiter.js';

const router = Router();

router.post('/login', loginLimiter, login);
router.get('/me', authenticateJWT, me);

export default router;
