import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import passport from 'passport';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { configurePassport } from './auth.js';
import { csrfToken } from './middleware/security.js';
import { authRoutes } from './routes/authRoutes.js';
import { dashboardRoutes } from './routes/dashboardRoutes.js';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp(client) {
  const app = express();
  if (env.NODE_ENV === 'production') app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.disable('x-powered-by');

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: 'draft-8', legacyHeaders: false }));
  app.use(express.urlencoded({ extended: false, limit: '32kb' }));
  app.use(express.json({ limit: '32kb' }));
  app.use(express.static(path.join(__dirname, 'public'), { maxAge: env.NODE_ENV === 'production' ? '1h' : 0 }));
  app.use(session({
    name: 'lcso.sid',
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: env.MONGO_URI, collectionName: 'web_sessions', ttl: 60 * 60 * 12 }),
    cookie: { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 1000 * 60 * 60 * 12 },
  }));
  configurePassport();
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(csrfToken);
  app.use((req, res, next) => { res.locals.user = req.user || null; res.locals.path = req.path; res.locals.query = req.query; next(); });

  app.get('/', (req, res) => res.render('landing', { title: 'LCSO Bot' }));
  app.get('/health', (_req, res) => {
    const ready = client.isReady() && mongoose.connection.readyState === 1;
    return res.status(ready ? 200 : 503).json({ ok: ready, discord: client.isReady(), database: mongoose.connection.readyState === 1 });
  });
  app.use('/auth', authRoutes());
  app.use('/dashboard', dashboardRoutes(client));

  app.use((req, res) => res.status(404).render('forbidden', { title: 'Not Found', message: 'The page you requested does not exist.' }));
  app.use((error, req, res, _next) => {
    logger.error('Dashboard request failed', { path: req.path, error: error.stack || error.message });
    if (res.headersSent) return;
    res.status(500).render('forbidden', { title: 'Error', message: 'The dashboard could not complete that request. The error has been logged.' });
  });
  return app;
}
