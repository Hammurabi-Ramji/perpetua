const nodemailer = require('nodemailer');
const { getDatabase } = require('../database');

class NotificationService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  async sendEmail(to, subject, html) {
    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_USER,
        to,
        subject,
        html
      });
      console.log(`Email sent to ${to}`);
    } catch (err) {
      console.error('Email send error:', err);
      throw err;
    }
  }

  async sendLicenseReminder(userId, license, reminder) {
    const db = getDatabase();
    const user = db.prepare('SELECT notification_email FROM users WHERE id = ?').get(userId);
    
    if (!user?.notification_email) return;
    
    const subject = `LicenseVault: Action Required for ${license.product_name}`;
    const html = `
      <h2>License Action Required</h2>
      <p><strong>${license.product_name}</strong></p>
      <p>${reminder.message}</p>
      <p><strong>Deadline:</strong> ${license.action_deadline}</p>
      ${license.redemption_url ? `<p><a href="${license.redemption_url}">Redeem License</a></p>` : ''}
      <br>
      <p>LicenseVault - Keep your lifetime deals active</p>
    `;
    
    await this.sendEmail(user.notification_email, subject, html);
  }

  async sendWeeklySummary(userId, licenses) {
    const db = getDatabase();
    const user = db.prepare('SELECT notification_email FROM users WHERE id = ?').get(userId);
    
    if (!user?.notification_email) return;
    
    const subject = 'LicenseVault: Weekly License Summary';
    const html = `
      <h2>Weekly License Summary</h2>
      <p>You have ${licenses.length} license(s) requiring attention:</p>
      <ul>
        ${licenses.map(l => `
          <li>
            <strong>${l.product_name}</strong><br>
            ${l.action_description}<br>
            Deadline: ${l.action_deadline}
          </li>
        `).join('')}
      </ul>
      <br>
      <p>LicenseVault - Keep your lifetime deals active</p>
    `;
    
    await this.sendEmail(user.notification_email, subject, html);
  }

  // Browser notification via WebSocket (placeholder)
  async sendBrowserNotification(userId, title, body) {
    // Implementation would use WebSocket connections
    console.log(`Browser notification for user ${userId}: ${title} - ${body}`);
  }
}

module.exports = new NotificationService();