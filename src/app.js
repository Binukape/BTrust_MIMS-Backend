import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { checkReferer } from './middleware/checkReferer.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/authRoutes.js';
import branchRoutes from './routes/branchRoutes.js';
import agentRoutes from './routes/agentRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import accountRoutes from './routes/accountRoutes.js';
import transactionRoutes from './routes/transactionRoutes.js';
import fixedDepositRoutes from './routes/fixedDepositRoutes.js';
import referenceRoutes from './routes/referenceRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import auditRoutes from './routes/auditRoutes.js';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(cors({
  origin: env.allowedOrigin,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Disposition'],
}));
app.use(express.json({ limit: '100kb' }));
app.use(checkReferer);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/auth', authRoutes);
app.use('/branches', branchRoutes);
app.use('/agents', agentRoutes);
app.use('/customers', customerRoutes);
app.use('/accounts', accountRoutes);
app.use('/transactions', transactionRoutes);
app.use('/fixed-deposits', fixedDepositRoutes);
app.use('/reference', referenceRoutes);
app.use('/reports', reportRoutes);
app.use('/audit-log', auditRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
