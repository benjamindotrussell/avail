import { Router } from 'express';
import { createGroup, listGroups, getGroup, updateGroup, deleteGroup } from '../handlers/groups';
import { createInvite, joinGroup } from '../handlers/invite';
import { removeMember, leaveGroup } from '../handlers/members';
import { authenticate } from '../middleware/authenticate';

const router = Router();

router.use(authenticate);

// Static routes first to avoid conflicts with /:groupId
router.post('/join/:code', joinGroup);

// Group CRUD
router.post('/', createGroup);
router.get('/', listGroups);
router.get('/:groupId', getGroup);
router.patch('/:groupId', updateGroup);
router.delete('/:groupId', deleteGroup);

// Invite
router.post('/:groupId/invite', createInvite);

// Members
router.delete('/:groupId/members/me', leaveGroup);
router.delete('/:groupId/members/:userId', removeMember);

export default router;
