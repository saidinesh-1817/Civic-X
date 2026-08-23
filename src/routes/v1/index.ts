import { Router } from 'express';
import { authRouter } from '../../modules/auth/auth.route.js';
import { complaintsRouter } from '../../modules/complaints/complaints.route.js';
import { departmentsRouter, officesRouter } from '../../modules/departments/departments.route.js';
import { officersRouter } from '../../modules/officers/officers.route.js';
import { notificationsRouter } from '../../modules/notifications/notifications.route.js';
import { adminRouter } from '../../modules/administration/admin.route.js';
import { healthRouter } from './health.route.js';
import { testRouter } from './test.route.js';

export const v1Router = Router();

// Health Check Endpoint: /api/v1/health
v1Router.use('/', healthRouter);

// Authentication Module Endpoints: /api/v1/auth/*
v1Router.use('/auth', authRouter);

// Departments Module Endpoints: /api/v1/departments/*
v1Router.use('/departments', departmentsRouter);

// Department Offices Module Endpoints: /api/v1/offices/*
v1Router.use('/offices', officesRouter);

// Complaints Module Endpoints: /api/v1/complaints/*
v1Router.use('/complaints', complaintsRouter);

// Officer Complaint Management Endpoints: /api/v1/officer/* & /api/v1/officers/*
v1Router.use('/officer', officersRouter);
v1Router.use('/officers', officersRouter);

// In-App Notifications Endpoints: /api/v1/notifications/*
v1Router.use('/notifications', notificationsRouter);

// Administration & Officer Verification Endpoints: /api/v1/admin/*
v1Router.use('/admin', adminRouter);

// Diagnostic & Verification Test Endpoints: /api/v1/test/*
v1Router.use('/test', testRouter);

/**
 * Future Module Mount Points:
 *
 * import { usersRouter } from '../../modules/users/users.route.js';
 *
 * v1Router.use('/users', usersRouter);
 */
