import { Router } from 'express';
import authRoutes from './auth.js';
import adminRoutes from './admin.js';

const router = Router();

router.use('/api/auth', authRoutes);
router.use('/api/admin', adminRoutes);

export default router;
