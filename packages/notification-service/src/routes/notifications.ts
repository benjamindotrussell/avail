import { Router } from 'express';
import { registerToken, removeToken } from '../handlers/tokens';
import { authenticate } from '../middleware/authenticate';

const router = Router();

router.use(authenticate);

router.post('/token', registerToken);
router.delete('/token', removeToken);

export default router;
