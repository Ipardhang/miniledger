import cors from 'cors';
import crypto from 'crypto';
import express from 'express';
import { authRouter } from './auth';
import { config } from './config';
import { errorHandler } from './errors';
import { loansRouter } from './loans';

export function createApp() {
  const app = express();

  app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);

  app.use((req, res, next) => {
    const requestId = req.header('x-request-id')?.slice(0, 100) || crypto.randomUUID();
    res.setHeader('x-request-id', requestId);
    res.locals.requestId = requestId;
    next();
  });

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || config.appOrigins.length === 0 || config.appOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin not allowed'));
    },
    credentials: false,
  }));

  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/auth', authRouter);
  app.use('/loans', loansRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use(errorHandler);

  return app;
}

const vercelApp = createApp();
export default vercelApp;
