import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { getMe, updateMe } from '../handlers/user';

const router = Router();

router.get('/me', authenticate, getMe);
router.patch('/me', authenticate, updateMe);

export default router;
