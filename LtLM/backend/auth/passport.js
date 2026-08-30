const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const OAuth2Strategy = require('passport-oauth2').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bcrypt = require('bcrypt');
const { getDatabase } = require('../database');

// Google OAuth 2.0
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/api/auth/google/callback'
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const db = getDatabase();
      const email = profile.emails[0].value;
      
      // Check if user exists
      let user = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (!user) {
        // Create new user
        const result = await new Promise((resolve, reject) => {
          db.run(
            'INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
            [email, null], // No password for OAuth users
            function(err) {
              if (err) reject(err);
              else resolve({ id: this.lastID });
            }
          );
        });
        user = { id: result.id, email };
      }

      // Update last login
      await new Promise((resolve, reject) => {
        db.run('UPDATE users SET last_login = ? WHERE id = ?', [new Date().toISOString(), user.id], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }));
}
if (process.env.APPSUMO_CLIENT_ID && process.env.APPSUMO_CLIENT_SECRET) {
  passport.use('appsumo', new OAuth2Strategy({
    authorizationURL: 'https://appsumo.com/oauth/authorize',
    tokenURL: 'https://appsumo.com/oauth/token',
    clientID: process.env.APPSUMO_CLIENT_ID,
    clientSecret: process.env.APPSUMO_CLIENT_SECRET,
    callbackURL: '/api/auth/appsumo/callback'
  }, async (req, accessToken, refreshToken, profile, done) => {
    try {
      const db = getDatabase();
      const userId = req.user.id; // Get from authenticated session
      
      // Store tokens
      db.prepare(`
      INSERT OR REPLACE INTO connected_sites 
      (user_id, site_name, access_token, refresh_token, last_synced, sync_status)
      VALUES (?, 'appsumo', ?, ?, ?, 'connected')
    `).run(userId, accessToken, refreshToken, new Date().toISOString());
    
    // Trigger license sync
    const { syncAppSumoLicenses } = require('../bridges/appsumo.bridge');
    await syncAppSumoLicenses(userId, accessToken);
    
    done(null, profile);
  } catch (err) {
    done(err);
  }
}));
}

// Local strategy for master password
passport.use('local', new LocalStrategy({
  usernameField: 'email',
  passwordField: 'password'
}, async (email, password, done) => {
  try {
    const db = getDatabase();
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!user) {
      return done(null, false, { message: 'User not found' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return done(null, false, { message: 'Invalid password' });
    }

    // Update last login
    await new Promise((resolve, reject) => {
      db.run('UPDATE users SET last_login = ? WHERE id = ?', [new Date().toISOString(), user.id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    return done(null, user);
  } catch (err) {
    return done(err);
  }
}));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const db = getDatabase();
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT id, email FROM users WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
    done(null, user);
  } catch (err) {
    done(err);
  }
});