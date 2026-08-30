const express = require('express');
const { authenticateToken } = require('../auth/middleware');
const { getDatabase } = require('../database');

const router = express.Router();
const db = getDatabase();

// Get user reminders
router.get('/', authenticateToken, (req, res) => {
  try {
    const reminders = db.prepare(`
      SELECT r.*, l.product_name 
      FROM reminders r
      LEFT JOIN licenses l ON r.license_id = l.id
      WHERE r.user_id = ? AND r.sent = 0
      ORDER BY r.remind_at ASC
    `).all(req.user.id);
    
    res.json(reminders);
  } catch (err) {
    console.error('Get reminders error:', err);
    res.status(500).json({ error: 'Failed to fetch reminders' });
  }
});

// Create reminder
router.post('/', authenticateToken, (req, res) => {
  try {
    const { licenseId, reminderType, remindAt, message } = req.body;
    
    const result = db.prepare(`
      INSERT INTO reminders (user_id, license_id, reminder_type, remind_at, message)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.user.id, licenseId, reminderType, remindAt, message);
    
    res.json({ id: result.lastInsertRowid, success: true });
  } catch (err) {
    console.error('Create reminder error:', err);
    res.status(500).json({ error: 'Failed to create reminder' });
  }
});

// Update reminder settings
router.patch('/settings', authenticateToken, (req, res) => {
  try {
    const { emailNotifications, browserNotifications, notificationEmail } = req.body;
    
    db.prepare(`
      UPDATE users 
      SET email_notifications = ?, browser_notifications = ?, notification_email = ?
      WHERE id = ?
    `).run(emailNotifications, browserNotifications, notificationEmail, req.user.id);
    
    res.json({ success: true });
  } catch (err) {
    console.error('Update settings error:', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Get reminder settings
router.get('/settings', authenticateToken, (req, res) => {
  try {
    const settings = db.prepare(`
      SELECT email_notifications, browser_notifications, notification_email
      FROM users WHERE id = ?
    `).get(req.user.id);
    
    res.json(settings);
  } catch (err) {
    console.error('Get settings error:', err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Mark reminder as sent
router.patch('/:id/sent', authenticateToken, (req, res) => {
  try {
    db.prepare(`
      UPDATE reminders SET sent = 1 WHERE id = ? AND user_id = ?
    `).run(req.params.id, req.user.id);
    
    res.json({ success: true });
  } catch (err) {
    console.error('Mark sent error:', err);
    res.status(500).json({ error: 'Failed to mark reminder as sent' });
  }
});

module.exports = router;