const GenericScraper = require('./generic.scraper');
const { decrypt } = require('../utils/encryption');

class ProductHuntBridge extends GenericScraper {
  constructor() {
    super('producthunt');
  }

  async syncProductHuntLicenses(userId, accessToken) {
    console.log(`Syncing Product Hunt licenses for user ${userId}`);
    
    // Similar to AppSumo - OAuth preferred, scraping fallback
    const credentials = this.getStoredCredentials(userId);
    if (credentials) {
      return await this.scrapeLicenses(userId, credentials);
    }
    
    return [];
  }

  getStoredCredentials(userId) {
    const connection = this.db.prepare(`
      SELECT credentials_encrypted FROM connected_sites 
      WHERE user_id = ? AND site_name = 'producthunt'
    `).get(userId);
    
    if (connection?.credentials_encrypted) {
      return JSON.parse(decrypt(connection.credentials_encrypted));
    }
    return null;
  }
}

module.exports = new ProductHuntBridge();