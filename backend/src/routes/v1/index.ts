import { Router } from 'express';
import { healthRouter } from './health.route.js';

export const v1Router = Router();

// Health Check Endpoint: /api/v1/health
v1Router.use('/', healthRouter);

/**
 * Future Module Mount Points (Task B2+):
 *
 * import { authRouter } from '../../modules/auth/auth.route.js';
 * import { usersRouter } from '../../modules/users/users.route.js';
 * import { departmentsRouter } from '../../modules/departments/departments.route.js';
 * import { complaintsRouter } from '../../modules/complaints/complaints.route.js';
 * import { notificationsRouter } from '../../modules/notifications/notifications.route.js';
 * import { officersRouter } from '../../modules/officers/officers.route.js';
 * import { adminRouter } from '../../modules/administration/admin.route.js';
 *
 * v1Router.use('/auth', authRouter);
 * v1Router.use('/users', usersRouter);
 * v1Router.use('/departments', departmentsRouter);
 * v1Router.use('/complaints', complaintsRouter);
 * v1Router.use('/notifications', notificationsRouter);
 * v1Router.use('/officers', officersRouter);
 * v1Router.use('/admin', adminRouter);
 */
