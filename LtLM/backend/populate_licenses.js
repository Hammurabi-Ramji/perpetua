const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'licensevault.db');
const db = new sqlite3.Database(dbPath);

// License data from AppSumo and StackSocial
const licenseData = [
  // AppSumo licenses
  {
    product_name: "Build Faster Bundle",
    purchase_date: "2025-12-03",
    status: "Redeemed",
    is_lifetime: true,
    site: "AppSumo"
  },
  {
    product_name: "Greta",
    purchase_date: "2025-06-26",
    status: "Activated",
    license_tier: "License Tier 2",
    is_lifetime: true,
    site: "AppSumo"
  },
  {
    product_name: "AppMySite",
    purchase_date: "2025-04-17",
    status: "Activated",
    license_tier: "License Tier 1",
    is_lifetime: true,
    site: "AppSumo"
  },
  {
    product_name: "UI Replicator",
    purchase_date: "2025-04-17",
    status: "Redeemed",
    is_lifetime: true,
    site: "AppSumo"
  },
  {
    product_name: "NoCodeBackend",
    purchase_date: "2025-04-03",
    status: "Activated",
    license_tier: "Plan 2",
    is_lifetime: true,
    site: "AppSumo"
  },
  {
    product_name: "First Book ai",
    purchase_date: "2025-04-01",
    status: "Activated",
    license_tier: "License Tier 1",
    is_lifetime: true,
    site: "AppSumo"
  },
  {
    product_name: "Pickaxe",
    purchase_date: "2024-08-20",
    status: "Activated",
    license_tier: "License Tier 2",
    is_lifetime: true,
    site: "AppSumo"
  },
  {
    product_name: "Million Dollar Email Templates 2.0",
    purchase_date: "2024-08-14",
    status: "Activated",
    is_lifetime: true,
    site: "AppSumo"
  },
  {
    product_name: "Moovly",
    purchase_date: "2021-05-21",
    status: "Activated",
    license_tier: "License Tier 1",
    is_lifetime: true,
    site: "AppSumo"
  },
  // Expired AppSumo licenses
  {
    product_name: "UI Replicator (Expired)",
    purchase_date: "2025-04-17",
    status: "Not redeemed",
    expiration_date: "2025-06-16",
    is_lifetime: false,
    site: "AppSumo"
  },
  {
    product_name: "Writecream - Your SEO Agent",
    purchase_date: "2025-04-03",
    status: "Not redeemed",
    expiration_date: "2025-06-02",
    is_lifetime: false,
    site: "AppSumo"
  },
  {
    product_name: "DocPro",
    purchase_date: "2025-04-03",
    status: "Not redeemed",
    expiration_date: "2025-06-02",
    is_lifetime: false,
    site: "AppSumo"
  },
  {
    product_name: "RTILA - RPA & Web Automation",
    purchase_date: "2025-01-23",
    status: "Not redeemed",
    expiration_date: "2025-03-24",
    is_lifetime: false,
    site: "AppSumo"
  },
  {
    product_name: "MarkupGo",
    purchase_date: "2025-01-12",
    status: "Not redeemed",
    expiration_date: "2025-03-13",
    is_lifetime: false,
    site: "AppSumo"
  },
  {
    product_name: "OnlineCourseHost.com",
    purchase_date: "2025-01-08",
    status: "Not redeemed",
    expiration_date: "2025-03-09",
    is_lifetime: false,
    site: "AppSumo"
  },
  {
    product_name: "ApproveMe's Ultimate Contract Template Library",
    purchase_date: "2025-01-08",
    status: "Not redeemed",
    expiration_date: "2025-03-09",
    is_lifetime: false,
    site: "AppSumo"
  },
  {
    product_name: "Fox Signals",
    purchase_date: "2024-10-03",
    status: "Not redeemed",
    expiration_date: "2024-12-02",
    is_lifetime: false,
    site: "AppSumo"
  },
  {
    product_name: "Cornerrr",
    purchase_date: "2024-08-21",
    status: "Not redeemed",
    expiration_date: "2024-10-20",
    is_lifetime: false,
    site: "AppSumo"
  },
  {
    product_name: "Million Dollar Weekend: The Journal",
    purchase_date: "2024-08-14",
    status: "Not redeemed",
    expiration_date: "2024-10-13",
    is_lifetime: false,
    site: "AppSumo"
  },
  {
    product_name: "NOYSI",
    purchase_date: "2021-10-12",
    status: "Not redeemed",
    expiration_date: "2021-12-11",
    is_lifetime: false,
    site: "AppSumo"
  },
  // StackSocial licenses
  {
    product_name: "AI Magicx: Lifetime Subscription (Rune Plan)",
    purchase_date: "2025-10-24",
    status: "Redeemed",
    license_code: "RU-1Bdnu8c94",
    is_lifetime: true,
    site: "StackSocial"
  },
  {
    product_name: "Microsoft Windows 11 Pro + The Essential Windows 11 Pro Course",
    purchase_date: "2025-07-02",
    status: "Purchased",
    is_lifetime: true,
    site: "StackSocial"
  },
  {
    product_name: "Sellful - White Label Website Builder & Software: ERP Agency Plan (Lifetime)",
    purchase_date: "2025-06-14",
    status: "Purchased",
    is_lifetime: true,
    site: "StackSocial"
  },
  {
    product_name: "Twidget.io No-Code API Builder: Lifetime Subscription (Business Plan)",
    purchase_date: "2025-04-07",
    status: "Purchased",
    is_lifetime: true,
    site: "StackSocial"
  },
  {
    product_name: "TexTalky AI Text-to-Speech: Lifetime Subscription",
    purchase_date: "2025-01-10",
    status: "Purchased",
    is_lifetime: true,
    site: "StackSocial"
  },
  {
    product_name: "DeskSense AI Assistant - Pro Plan: Lifetime Subscription",
    purchase_date: "2024-12-27",
    status: "Purchased",
    is_lifetime: true,
    site: "StackSocial"
  },
  {
    product_name: "ESET NOD32 Antivirus 2024 Edition (1-Year)",
    purchase_date: "2024-10-25",
    status: "Purchased",
    expiration_date: "2025-10-25",
    is_lifetime: false,
    site: "StackSocial"
  },
  {
    product_name: "Supermusic AI: Lifetime Subscription",
    purchase_date: "2024-09-24",
    status: "Purchased",
    is_lifetime: true,
    site: "StackSocial"
  },
  {
    product_name: "1min.AI: Lifetime Subscription",
    purchase_date: "2024-08-13",
    status: "Purchased",
    is_lifetime: true,
    site: "StackSocial"
  },
  {
    product_name: "iToolab Software Bundle for Mac: Lifetime Subscriptions",
    purchase_date: "2023-12-27",
    status: "Purchased",
    is_lifetime: true,
    site: "StackSocial"
  },
  {
    product_name: "MiniTool Power Data Recovery Personal: Lifetime Subscription",
    purchase_date: "2023-12-05",
    status: "Redeemed",
    license_code: "907675-5B404B-4DE1CE-1678BE",
    is_lifetime: true,
    site: "StackSocial"
  },
  {
    product_name: "My AI eBook Creation Pro: 1 Year Subscription",
    purchase_date: "2023-11-27",
    status: "Purchased",
    expiration_date: "2024-11-27",
    is_lifetime: false,
    site: "StackSocial"
  },
  {
    product_name: "Microsoft Windows 11 Pro",
    purchase_date: "2023-11-27",
    status: "Purchased",
    is_lifetime: true,
    site: "StackSocial"
  },
  {
    product_name: "Zerrio: The Ultimate All-In-One Business Management Toolkit (Lifetime Subscription)",
    purchase_date: "2023-09-07",
    status: "Purchased",
    is_lifetime: true,
    site: "StackSocial"
  },
  {
    product_name: "WriteBot™ Harness the Power of AI Content Creation: Lifetime Pro Subscription",
    purchase_date: "2023-09-07",
    status: "Purchased",
    is_lifetime: true,
    site: "StackSocial"
  },
  {
    product_name: "Pixilio The Ultimate AI Image Generator: Lifetime Subscription",
    purchase_date: "2023-09-07",
    status: "Purchased",
    is_lifetime: true,
    site: "StackSocial"
  },
  {
    product_name: "Tykr Stock Screener: Premium Plan Lifetime Subscription",
    purchase_date: "2023-03-06",
    status: "Purchased",
    is_lifetime: true,
    site: "StackSocial"
  },
  {
    product_name: "Seed4.Me VPN: Lifetime Subscription (Unlimited Devices)",
    purchase_date: "2023-01-08",
    status: "Purchased",
    is_lifetime: true,
    site: "StackSocial"
  },
  {
    product_name: "1stFlip Flip Book Creator Pro for Windows: Lifetime License",
    purchase_date: "2023-01-08",
    status: "Purchased",
    is_lifetime: true,
    site: "StackSocial"
  },
  {
    product_name: "Curiosity Stream HD Plan: Lifetime Subscription",
    purchase_date: "2023-01-02",
    status: "Purchased",
    is_lifetime: true,
    site: "StackSocial"
  },
  {
    product_name: "Koofr Cloud Storage: Lifetime Subscription (1TB)",
    purchase_date: "2022-12-24",
    status: "Purchased",
    is_lifetime: true,
    site: "StackSocial"
  },
  {
    product_name: "Microsoft Office Professional 2021 for Windows: Lifetime License",
    purchase_date: "2022-01-28",
    status: "Purchased",
    is_lifetime: true,
    site: "StackSocial"
  },
  {
    product_name: "MockGo Jailbreak-Free iPhone GPS Location Spoofer: Lifetime Subscription",
    purchase_date: "2022-01-01",
    status: "Purchased",
    is_lifetime: true,
    site: "StackSocial"
  },
  {
    product_name: "MacX Media Management Bundle: Lifetime License",
    purchase_date: "2021-10-22",
    status: "Purchased",
    is_lifetime: true,
    site: "StackSocial"
  },
  {
    product_name: "MacClean 3: Family License",
    purchase_date: "2021-10-22",
    status: "Purchased",
    is_lifetime: true,
    site: "StackSocial"
  },
  {
    product_name: "ScanTitan Professional Web Security: Lifetime Subscription",
    purchase_date: "2021-09-13",
    status: "Redeemed",
    license_code: "SC-BFLT-2XEN-SC",
    is_lifetime: true,
    site: "StackSocial"
  },
  {
    product_name: "The Lifetime Mobile Privacy & Security Subscription Bundle",
    purchase_date: "2021-09-13",
    status: "Redeemed",
    license_codes: ["U68LDMMPA2", "ZVPE65F73M6V"],
    is_lifetime: true,
    site: "StackSocial"
  },
  {
    product_name: "FREE: The Mobile & Web Developer Training Course Bundle",
    purchase_date: "2021-05-21",
    status: "Purchased",
    is_lifetime: true,
    site: "StackSocial"
  },
  {
    product_name: "UX-App: Interaction & UI Design Software",
    purchase_date: "2021-05-21",
    status: "Purchased",
    is_lifetime: true,
    site: "StackSocial"
  },
  {
    product_name: "Dictanote Pro: Lifetime Subscription",
    purchase_date: "2021-05-14",
    status: "Purchased",
    is_lifetime: true,
    site: "StackSocial"
  },
  {
    product_name: "Degoo Premium: Lifetime 10TB Backup Plan",
    purchase_date: "2021-05-14",
    status: "Purchased",
    is_lifetime: true,
    site: "StackSocial"
  },
  {
    product_name: "The Personal Goals Freebie Bundle",
    purchase_date: "2021-02-08",
    status: "Purchased",
    is_lifetime: true,
    site: "StackSocial"
  },
  {
    product_name: "fesh. eCommerce Shop Builder Standard Plan: Lifetime Subscription",
    purchase_date: "2021-01-20",
    status: "Purchased",
    is_lifetime: true,
    site: "StackSocial"
  },
  {
    product_name: "BonoHost Unlimited Plan: Lifetime Web Hosting Subscription",
    purchase_date: "2021-01-20",
    status: "Purchased",
    is_lifetime: true,
    site: "StackSocial"
  }
];

async function insertLicenses() {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT INTO licenses (
        user_id, product_name, purchase_date, status, license_tier,
        expiry_date, is_lifetime, source, license_key, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    let inserted = 0;
    licenseData.forEach(license => {
      stmt.run([
        11, // user_id for ramesh.girdhari@gmail.com
        license.product_name,
        license.purchase_date,
        license.status,
        license.license_tier || null,
        license.expiration_date || license.expiry_date || null,
        license.is_lifetime ? 1 : 0,
        license.site, // source column
        license.license_code || license.license_key || null
      ], function(err) {
        if (err) {
          console.error('Error inserting license:', license.product_name, err);
        } else {
          inserted++;
        }
      });
    });

    stmt.finalize((err) => {
      if (err) {
        reject(err);
      } else {
        resolve(inserted);
      }
    });
  });
}

insertLicenses()
  .then(count => {
    console.log(`Successfully inserted ${count} licenses`);
    db.close();
  })
  .catch(err => {
    console.error('Error:', err);
    db.close();
  });