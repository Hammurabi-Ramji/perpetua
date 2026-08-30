const GenericScraper = require('./generic.scraper');
const { decrypt } = require('../utils/encryption');

class StackSocialBridge extends GenericScraper {
  constructor() {
    super('stacksocial');
  }

  async syncStackSocialLicenses(userId) {
    console.log(`Syncing StackSocial licenses for user ${userId}`);
    
    const credentials = this.getStoredCredentials(userId);
    if (credentials) {
      return await this.scrapeLicenses(userId, credentials);
    }
    
    return [];
  }

  getStoredCredentials(userId) {
    const connection = this.db.prepare(`
      SELECT credentials_encrypted FROM connected_sites 
      WHERE user_id = ? AND site_name = 'stacksocial'
    `).get(userId);
    
    if (connection?.credentials_encrypted) {
      return JSON.parse(decrypt(connection.credentials_encrypted));
    }
    return null;
  }
}

module.exports = new StackSocialBridge();