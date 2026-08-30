const GenericScraper = require('./generic.scraper');
const { decrypt } = require('../utils/encryption');

class AppSumoBridge extends GenericScraper {
  constructor() {
    super('appsumo');
  }

  async syncAppSumoLicenses(userId, accessToken) {
    // For OAuth sites, we might use API calls instead of scraping
    // This is a placeholder - real implementation would use AppSumo's API
    console.log(`Syncing AppSumo licenses for user ${userId}`);
    
    // For now, fall back to scraping if no API available
    const credentials = this.getStoredCredentials(userId);
    if (credentials) {
      return await this.scrapeLicenses(userId, credentials);
    }
    
    return [];
  }

  getStoredCredentials(userId) {
    const connection = this.db.prepare(`
      SELECT credentials_encrypted FROM connected_sites 
      WHERE user_id = ? AND site_name = 'appsumo'
    `).get(userId);
    
    if (connection?.credentials_encrypted) {
      return JSON.parse(decrypt(connection.credentials_encrypted));
    }
    return null;
  }
}

module.exports = new AppSumoBridge();