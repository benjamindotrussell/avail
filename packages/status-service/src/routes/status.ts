import { Router } from 'express';
import { setStatus, getMyStatus, getGroupStatuses, clearStatus } from '../handlers/status';
import { authenticate } from '../middleware/authenticate';

const router = Router();

router.use(authenticate);

router.put('/', setStatus);
router.get('/me', getMyStatus);
router.get('/group/:groupId', getGroupStatuses);
router.delete('/', clearStatus);

export default router;
