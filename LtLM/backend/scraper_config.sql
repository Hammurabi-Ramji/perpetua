
CREATE TABLE scraper_configs (
  site_name TEXT PRIMARY KEY,
  base_url TEXT NOT NULL,
  login_selector TEXT,
  orders_url TEXT,
  license_selectors TEXT
);

INSERT INTO scraper_configs VALUES 
('appsumo', 'https://appsumo.com', 'input[name=email]', '/account/orders', '{}'),
('producthunt', 'https://www.producthunt.com', 'input[name=email]', '/account/licenses', '{}'),
('stacksocial', 'https://stacksocial.com', 'input[name=email]', '/account/purchases', '{}'),
('humblebundle', 'https://www.humblebundle.com', 'input[name=username]', '/home/library', '{}');

