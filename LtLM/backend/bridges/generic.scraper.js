const { chromium } = require('playwright');
const { getDatabase } = require('../database');
const { encrypt, decrypt } = require('../utils/encryption');

class GenericScraper {
  constructor(siteName) {
    this.siteName = siteName;
    this.db = getDatabase();
    console.log('Scraper constructor - siteName:', siteName);
    console.log('Scraper constructor - db:', !!this.db);
    this.config = this.db.prepare('SELECT * FROM scraper_configs WHERE site_name = ?').get(siteName);
    console.log('Scraper constructor - config:', this.config);
  }

  async scrapeLicenses(userId, credentials) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    const licenses = [];

    try {
      // Navigate to login
      await page.goto(`${this.config.base_url}/login`);
      
      // Handle login form
      await page.fill(this.config.login_selector, credentials.username);
      await page.fill('input[type="password"]', credentials.password);
      
      // Check for 2FA
      await page.click('button[type="submit"]');
      
      // Wait for navigation or URL change
      await page.waitForLoadState('domcontentloaded');
      
      // Handle 2FA if prompted
      if (await page.$('input[name="2fa_code"]')) {
        throw new Error('2FA_REQUIRED');
      }

      // Navigate to orders/purchases
      await page.goto(`${this.config.base_url}${this.config.orders_url}`);
      
      // Wait for content
      await page.waitForLoadState('networkidle');
      
      // Extract license data based on site-specific selectors
      const siteHandlers = {
        'appsumo': async () => {
          const orders = await page.$$('.purchase-item');
          for (const order of orders) {
            const isLifetime = await order.$eval('.badge', el => el.textContent.includes('Lifetime')).catch(() => false);
            if (!isLifetime) continue;
            
            licenses.push({
              product_name: await order.$eval('.product-title', el => el.textContent.trim()),
              purchase_date: await order.$eval('.purchase-date', el => el.textContent.trim()),
              redemption_url: await order.$eval('a[href*="redeem"]', el => el.href).catch(() => null),
              license_key: await order.$eval('.license-key', el => el.textContent.trim()).catch(() => null),
              status: 'active'
            });
          }
        },
        'humblebundle': async () => {
          const bundles = await page.$$('.bundle-item');
          for (const bundle of bundles) {
            const products = await bundle.$$('.product-row');
            for (const product of products) {
              licenses.push({
                product_name: await product.$eval('.product-name', el => el.textContent.trim()),
                purchase_date: await bundle.$eval('.bundle-date', el => el.textContent.trim()),
                download_url: await product.$eval('.download-btn', el => el.href).catch(() => null),
                is_lifetime: true,
                status: 'active'
              });
            }
          }
        },
        'stacksocial': async () => {
          const purchases = await page.$$('.order-item');
          for (const purchase of purchases) {
            const isLifetime = await purchase.$eval('.order-type', el => el.textContent.toLowerCase().includes('lifetime')).catch(() => false);
            if (!isLifetime) continue;
            
            licenses.push({
              product_name: await purchase.$eval('.product-name', el => el.textContent.trim()),
              purchase_date: await purchase.$eval('.order-date', el => el.textContent.trim()),
              redemption_url: await purchase.$eval('a[href*="redeem"]', el => el.href).catch(() => null),
              status: 'active'
            });
          }
        }
      };

      if (siteHandlers[this.siteName]) {
        await siteHandlers[this.siteName]();
      }

      // Save to database
      await this.saveLicenses(userId, licenses);
      
      // Update sync status
      this.db.prepare(`
        UPDATE connected_sites 
        SET last_synced = ?, sync_status = 'synced' 
        WHERE user_id = ? AND site_name = ?
      `).run(new Date().toISOString(), userId, this.siteName);

    } catch (err) {
      console.error(`Scrape error for ${this.siteName}:`, err);
      throw err;
    } finally {
      await browser.close();
    }

    return licenses;
  }

  async saveLicenses(userId, licenses) {
    const insert = this.db.prepare(`
      INSERT INTO licenses 
      (user_id, product_name, purchase_date, license_key, redemption_url, download_url, is_lifetime, status)
      VALUES (?, ?, ?, ?, ?, ?, 1, 'active')
      ON CONFLICT(user_id, product_name) DO UPDATE SET
        updated_at = CURRENT_TIMESTAMP
    `);

    for (const license of licenses) {
      insert.run(
        userId,
        license.product_name,
        license.purchase_date,
        license.license_key,
        license.redemption_url,
        license.download_url
      );
    }
  }
}

module.exports = GenericScraper;