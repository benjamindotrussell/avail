import { Router } from 'express';
import { requestOTP, verifyOTP } from '../handlers/otp';
import { socialAuth } from '../handlers/social';
import { refreshToken, logout } from '../handlers/token';
import { deleteAccount } from '../handlers/account';
import { authenticate } from '../middleware/authenticate';

const router = Router();

// OTP flow
router.post('/otp/request', requestOTP);
router.post('/otp/verify', verifyOTP);

// Social sign-in (Apple / Google via Firebase)
router.post('/social', socialAuth);

// Token management
router.post('/refresh', refreshToken);
router.post('/logout', authenticate, logout);

// Account deletion (App Store requirement)
router.delete('/account', authenticate, deleteAccount);

export default router;
