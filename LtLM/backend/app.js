const path = require('node:path');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const passport = require('passport');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

const { initializeDatabase } = require('./database');
const { startNotificationScheduler } = require('./utils/scheduler');

async function createApp() {
  await initializeDatabase();

  require('./auth/passport');

  const authRoutes = require('./routes/auth.routes');
  const licenseRoutes = require('./routes/licenses.routes');
  const siteRoutes = require('./routes/sites.routes');
  const reminderRoutes = require('./routes/reminders.routes');
  const gretaRoutes = require('./routes/greta.routes');
  const twidgetRoutes = require('./routes/twidget.routes');
  const pickaxeRoutes = require('./routes/pickaxe.routes');
  const storageRoutes = require('./routes/storage.routes');
  const edubaRoutes = require('./routes/eduba.routes');

  const app = express();

  app.use(helmet());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  const corsOptions = {
    origin: process.env.NODE_ENV === 'production'
      ? ['https://licensevault.app', 'https://app.licensevault.io']
      : ['http://localhost:4173', 'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176', 'http://localhost:5177', 'http://localhost:5178'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
  };
  app.use(cors(corsOptions));

  app.use(session({
    secret: process.env.SESSION_SECRET || 'license-vault-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    store: new SQLiteStore({ db: 'sessions.db', dir: __dirname }),
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000
    }
  }));

  app.use(passport.initialize());
  app.use(passport.session());

  app.use('/api/auth', authRoutes);
  app.use('/api/licenses', licenseRoutes);
  app.use('/api/sites', siteRoutes);
  app.use('/api/reminders', reminderRoutes);
  app.use('/api/greta', gretaRoutes);
  app.use('/api/twidget', twidgetRoutes);
  app.use('/api/pickaxe', pickaxeRoutes);
  app.use('/api/storage', storageRoutes);
  app.use('/api/eduba', edubaRoutes);

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  if (process.env.NODE_ENV !== 'test') {
    startNotificationScheduler();
  }

  return app;
}

async function startServer(port = process.env.PORT || 3001) {
  const app = await createApp();

  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      console.log(`LicenseVault API running on port ${port}`);
      resolve({ app, server });
    });
  });
}

module.exports = { createApp, startServer };
