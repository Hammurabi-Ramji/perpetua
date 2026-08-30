const GenericScraper = require('./generic.scraper');
const { decrypt } = require('../utils/encryption');

class HumbleBundleBridge extends GenericScraper {
  constructor() {
    super('humblebundle');
  }

  async syncHumbleBundleLicenses(userId) {
    console.log(`Syncing Humble Bundle licenses for user ${userId}`);
    
    const credentials = this.getStoredCredentials(userId);
    if (credentials) {
      return await this.scrapeLicenses(userId, credentials);
    }
    
    return [];
  }

  getStoredCredentials(userId) {
    const connection = this.db.prepare(`
      SELECT credentials_encrypted FROM connected_sites 
      WHERE user_id = ? AND site_name = 'humblebundle'
    `).get(userId);
    
    if (connection?.credentials_encrypted) {
      return JSON.parse(decrypt(connection.credentials_encrypted));
    }
    return null;
  }
}

module.exports = new HumbleBundleBridge();