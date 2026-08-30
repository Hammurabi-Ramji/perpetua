const GenericScraper = require('../bridges/generic.scraper');

class ScraperService {
  async scrapeSite(userId, siteName, credentials) {
    const scraper = new GenericScraper(siteName);
    return await scraper.scrapeLicenses(userId, credentials);
  }

  async syncAllSites(userId) {
    const { getDatabase } = require('../database');
    const { decrypt } = require('../utils/encryption');
    const db = getDatabase();
    
    const connections = db.prepare(`
      SELECT site_name, credentials_encrypted 
      FROM connected_sites 
      WHERE user_id = ? AND credentials_encrypted IS NOT NULL
    `).all(userId);
    
    const results = [];
    
    for (const connection of connections) {
      try {
        const credentials = JSON.parse(decrypt(connection.credentials_encrypted));
        const scraper = new GenericScraper(connection.site_name);
        const licenses = await scraper.scrapeLicenses(userId, credentials);
        results.push({ site: connection.site_name, success: true, count: licenses.length });
      } catch (err) {
        console.error(`Failed to sync ${connection.site_name}:`, err);
        results.push({ site: connection.site_name, success: false, error: err.message });
      }
    }
    
    return results;
  }
}

module.exports = new ScraperService();