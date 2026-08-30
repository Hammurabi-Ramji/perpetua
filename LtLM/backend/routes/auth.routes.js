const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { getDatabase } = require('../database');
const { authenticateToken } = require('../auth/middleware');

const router = express.Router();
const db = getDatabase();

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    const db = getDatabase();
    const existing = await new Promise((resolve, reject) => {
      db.get('SELECT id FROM users WHERE email = ?', [email], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (existing) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const result = await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
        [email, passwordHash],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID });
        }
      );
    });

    // Generate JWT
    const token = jwt.sign(
      { id: result.id, email },
      process.env.JWT_SECRET || 'license-vault-secret-key-change-in-production',
      { expiresIn: '30d' }
    );

    res.json({ token, user: { id: result.id, email } });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', (req, res, next) => {
  passport.authenticate('local', { session: false }, (err, user, info) => {
    if (err) {
      return res.status(500).json({ error: 'Authentication error' });
    }
    if (!user) {
      return res.status(401).json({ error: info.message });
    }
    
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET || 'license-vault-secret-key-change-in-production',
      { expiresIn: process.env.JWT_EXPIRY || '30d' }
    );
    
    res.json({ token, user: { id: user.id, email: user.email } });
  })(req, res, next);
});

// Current user
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const db = getDatabase();
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT id, email, created_at, last_login FROM users WHERE id = ?', [req.user.id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (err) {
    console.error('Get current user error:', err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Google OAuth login
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

// Google OAuth callback
router.get('/google/callback', (req, res, next) => {
  passport.authenticate('google', { session: false }, (err, user) => {
    if (err) {
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_failed`);
    }
    if (!user) {
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_failed`);
    }
    
    // Generate JWT
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET || 'license-vault-secret-key-change-in-production',
      { expiresIn: process.env.JWT_EXPIRY || '30d' }
    );
    
    // Redirect with token
    res.redirect(`${process.env.FRONTEND_URL}/login?token=${token}`);
  })(req, res, next);
});

// OAuth initiate
router.get('/:site/connect', authenticateToken, (req, res) => {
  const { site } = req.params;
  // Store user ID in session for callback
  req.session.userId = req.user.id;
  passport.authenticate(site)(req, res);
});

// OAuth callback
router.get('/:site/callback', (req, res, next) => {
  const { site } = req.params;
  passport.authenticate(site, { session: false }, (err, profile) => {
    if (err) {
      return res.redirect(`${process.env.FRONTEND_URL}/sites?error=oauth_failed`);
    }
    res.redirect(`${process.env.FRONTEND_URL}/sites?success=${site}_connected`);
  })(req, res, next);
});

module.exports = router;
