const cron = require('node-cron');
const { getDatabase } = require('../database');
const notificationService = require('../services/notification.service');

function startNotificationScheduler() {
  // Run daily at 9 AM
  cron.schedule('0 9 * * *', async () => {
    console.log('Running daily license reminder check...');
    await processReminders();
  });

  // Also run weekly summary on Sundays
  cron.schedule('0 10 * * 0', async () => {
    console.log('Sending weekly license summary...');
    await sendWeeklySummary();
  });
}

async function processReminders() {
  const db = getDatabase();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const upcoming = db.prepare(`
    SELECT l.*, u.notification_email, u.email_notifications
    FROM licenses l
    JOIN users u ON l.user_id = u.id
    WHERE l.action_required = 1
      AND l.action_deadline <= ?
      AND u.email_notifications = 1
  `).all(tomorrow.toISOString().split('T')[0]);

  for (const license of upcoming) {
    // Create reminder record
    db.prepare(`
      INSERT INTO reminders (user_id, license_id, reminder_type, remind_at, message)
      VALUES (?, ?, 'action_deadline', datetime('now'), ?)
    `).run(
      license.user_id,
      license.id,
      `Action required for ${license.product_name}: ${license.action_description}. Deadline: ${license.action_deadline}`
    );

    // Send notification
    await notificationService.sendLicenseReminder(license.user_id, license, {
      message: license.action_description
    });
  }
}

async function sendWeeklySummary() {
  const db = getDatabase();
  const users = db.prepare('SELECT * FROM users WHERE email_notifications = 1').all();
  
  for (const user of users) {
    const licenses = db.prepare(`
      SELECT * FROM licenses 
      WHERE user_id = ? AND action_required = 1
      ORDER BY action_deadline ASC
    `).all(user.id);

    if (licenses.length > 0) {
      console.log(`Weekly summary for ${user.email}: ${licenses.length} licenses need attention`);
      await notificationService.sendWeeklySummary(user.id, licenses);
    }
  }
}

module.exports = { startNotificationScheduler, processReminders };