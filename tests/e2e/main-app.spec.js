const { test, expect } = require('@playwright/test');

function createState() {
  return {
    user: { id: 1, email: 'suite@example.com' },
    licenses: [
      {
        id: 1,
        product_name: 'Suite Active',
        license_key: 'AAAA-BBBB-CCCC-DDDD',
        purchase_date: '2026-01-01',
        expiry_date: '2099-01-01',
        status: 'active',
        source_site: 'appsumo',
        product_url: 'https://example.com/suite-active',
        redemption_url: 'https://example.com/redeem',
        download_url: 'https://example.com/download',
        notes: 'Primary suite license',
        action_required: false
      },
      {
        id: 2,
        product_name: 'Suite Expiring',
        license_key: 'EEEE-FFFF-GGGG-HHHH',
        purchase_date: '2026-01-02',
        expiry_date: '2026-05-20',
        status: 'active',
        source_site: 'producthunt',
        notes: 'Needs review',
        action_required: true,
        action_description: 'Redeem before deadline'
      },
      {
        id: 3,
        product_name: 'Suite Expired',
        license_key: 'IIII-JJJJ-KKKK-LLLL',
        purchase_date: '2024-01-01',
        expiry_date: '2024-02-01',
        status: 'expired',
        source_site: 'stacksocial',
        notes: 'Expired sample',
        action_required: false
      }
    ],
    connectedSites: [{ id: 'appsumo' }],
    reminderSettings: {
      emailNotifications: true,
      browserNotifications: false,
      notificationEmail: 'suite@example.com'
    },
    twidgetApis: [],
    pickaxeAgents: [
      {
        id: 10,
        name: 'License Helper',
        description: 'Answers license questions',
        system_prompt: 'Assist with licenses',
        model: 'llama2',
        knowledge_base: [],
        personality: 'Helpful'
      }
    ],
    storageServices: [
      {
        id: 1,
        service_name: 'koofr',
        service_type: 'aggregator',
        account_email: 'suite@example.com',
        base_url: 'https://app.koofr.net',
        webdav_url: 'https://webdav.koofr.net',
        enabled: true
      }
    ],
    storageOverview: {
      total: {
        used: 5368709120,
        available: 10737418240,
        limit: 16106127360
      },
      services: [{ name: 'koofr', used: 5368709120 }]
    },
    storageLogs: [
      { id: 1, operation: 'backup', file_path: 'licenses.csv', status: 'success', created_at: '2026-05-14T00:00:00.000Z' }
    ],
    repositories: [
      {
        id: 21,
        name: 'vault-core',
        description: 'Primary sovereign repository',
        forge_manifest: 'forge-manifest-1234567890',
        is_sealed: false,
        commit_count: 1,
        artifact_count: 1
      }
    ],
    repositoryDetails: {
      id: 21,
      name: 'vault-core',
      description: 'Primary sovereign repository',
      forge_manifest: 'forge-manifest-1234567890',
      is_sealed: false
    },
    commits: [
      {
        id: 301,
        commit_hash: 'abc123def4567890',
        commit_message: 'Initial sovereign commit',
        file_count: 5,
        commit_size_bytes: 2048,
        commit_timestamp: '2026-05-14T00:00:00.000Z',
        author_name: 'Suite Bot'
      }
    ],
    artifacts: [
      {
        id: 401,
        artifact_name: 'vault-core.wasm',
        artifact_type: 'wasm',
        version: '1.0.0'
      }
    ],
    searchResults: [
      {
        id: 501,
        context_name: 'syncLicenses',
        context_type: 'function',
        context_description: 'Synchronizes licenses from connected providers.',
        code_snippet: 'function syncLicenses() { /* ... */ }'
      }
    ]
  };
}

async function fulfillJson(route, body, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  });
}

async function mockApi(page, state) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();

    if (pathname === '/api/auth/me' && method === 'GET') {
      await fulfillJson(route, { user: state.user });
      return;
    }

    if (pathname === '/api/licenses' && method === 'GET') {
      const licenses = url.searchParams.get('action_required') === 'true'
        ? state.licenses.filter((license) => license.action_required)
        : state.licenses;
      await fulfillJson(route, licenses);
      return;
    }

    if (pathname === '/api/licenses/stats' && method === 'GET') {
      await fulfillJson(route, {
        total: state.licenses.length,
        active: state.licenses.filter((license) => license.status === 'active').length,
        actionRequired: state.licenses.filter((license) => license.action_required).length,
        connectedSites: state.connectedSites.length
      });
      return;
    }

    if (pathname === '/api/licenses' && method === 'POST') {
      const payload = request.postDataJSON();
      const nextLicense = {
        id: state.licenses.length + 1,
        status: 'active',
        source_site: 'manual',
        notes: '',
        ...payload
      };
      state.licenses.unshift(nextLicense);
      await fulfillJson(route, { id: nextLicense.id, message: 'License added successfully' }, 201);
      return;
    }

    if (/^\/api\/licenses\/\d+$/.test(pathname) && method === 'GET') {
      const id = Number(pathname.split('/').pop());
      await fulfillJson(route, state.licenses.find((license) => license.id === id) || null);
      return;
    }

    if (/^\/api\/licenses\/\d+$/.test(pathname) && method === 'PATCH') {
      const id = Number(pathname.split('/').pop());
      const updates = request.postDataJSON();
      state.licenses = state.licenses.map((license) => license.id === id ? { ...license, ...updates } : license);
      await fulfillJson(route, { success: true });
      return;
    }

    if (/^\/api\/licenses\/\d+$/.test(pathname) && method === 'DELETE') {
      const id = Number(pathname.split('/').pop());
      state.licenses = state.licenses.filter((license) => license.id !== id);
      await fulfillJson(route, { success: true });
      return;
    }

    if (pathname === '/api/sites/connections' && method === 'GET') {
      await fulfillJson(route, state.connectedSites);
      return;
    }

    if (/^\/api\/sites\/[^/]+\/connect$/.test(pathname) && method === 'POST') {
      const siteId = pathname.split('/')[3];
      if (!state.connectedSites.some((site) => site.id === siteId)) {
        state.connectedSites.push({ id: siteId });
      }
      await fulfillJson(route, { success: true });
      return;
    }

    if (/^\/api\/sites\/[^/]+\/sync$/.test(pathname) && method === 'POST') {
      await fulfillJson(route, { success: true });
      return;
    }

    if (/^\/api\/sites\/[^/]+$/.test(pathname) && method === 'DELETE') {
      const siteId = pathname.split('/').pop();
      state.connectedSites = state.connectedSites.filter((site) => site.id !== siteId);
      await fulfillJson(route, { success: true });
      return;
    }

    if (pathname === '/api/reminders/settings' && method === 'GET') {
      await fulfillJson(route, state.reminderSettings);
      return;
    }

    if (pathname === '/api/reminders/settings' && method === 'PATCH') {
      state.reminderSettings = request.postDataJSON();
      await fulfillJson(route, { success: true });
      return;
    }

    if (pathname === '/api/greta/chat' && method === 'POST') {
      const payload = request.postDataJSON();
      await fulfillJson(route, {
        response: `Greta handled: ${payload.prompt}`,
        sessionId: payload.sessionId
      });
      return;
    }

    if (pathname === '/api/twidget/apis' && method === 'GET') {
      await fulfillJson(route, state.twidgetApis);
      return;
    }

    if (pathname === '/api/twidget/apis' && method === 'POST') {
      const payload = request.postDataJSON();
      state.twidgetApis.push({ id: Date.now(), ...payload });
      await fulfillJson(route, { success: true }, 201);
      return;
    }

    if (/^\/api\/twidget\/apis\/\d+$/.test(pathname) && method === 'PUT') {
      await fulfillJson(route, { success: true });
      return;
    }

    if (/^\/api\/twidget\/apis\/\d+$/.test(pathname) && method === 'DELETE') {
      await fulfillJson(route, { success: true });
      return;
    }

    if (/^\/api\/twidget\/execute\/\d+$/.test(pathname) && method === 'POST') {
      await fulfillJson(route, { result: 'ok' });
      return;
    }

    if (pathname === '/api/pickaxe/agents' && method === 'GET') {
      await fulfillJson(route, state.pickaxeAgents);
      return;
    }

    if (pathname === '/api/pickaxe/agents' && method === 'POST') {
      const payload = request.postDataJSON();
      state.pickaxeAgents.push({ id: Date.now(), ...payload });
      await fulfillJson(route, { success: true }, 201);
      return;
    }

    if (/^\/api\/pickaxe\/agents\/\d+$/.test(pathname) && method === 'PUT') {
      await fulfillJson(route, { success: true });
      return;
    }

    if (/^\/api\/pickaxe\/agents\/\d+$/.test(pathname) && method === 'DELETE') {
      await fulfillJson(route, { success: true });
      return;
    }

    if (/^\/api\/pickaxe\/chat\/\d+$/.test(pathname) && method === 'POST') {
      const payload = request.postDataJSON();
      await fulfillJson(route, {
        response: `Pickaxe handled: ${payload.message}`,
        sessionId: payload.sessionId
      });
      return;
    }

    if (pathname === '/api/storage/services' && method === 'GET') {
      await fulfillJson(route, state.storageServices);
      return;
    }

    if (pathname === '/api/storage/overview' && method === 'GET') {
      await fulfillJson(route, state.storageOverview);
      return;
    }

    if (pathname === '/api/storage/logs' && method === 'GET') {
      await fulfillJson(route, state.storageLogs);
      return;
    }

    if (pathname === '/api/storage/services' && method === 'POST') {
      await fulfillJson(route, { success: true }, 201);
      return;
    }

    if (/^\/api\/storage\/services\/.+\/test$/.test(pathname) && method === 'POST') {
      await fulfillJson(route, { success: true, message: 'Connection successful!' });
      return;
    }

    if (pathname === '/api/storage/backup/licenses' && method === 'POST') {
      await fulfillJson(route, { success: true, service: request.postDataJSON().serviceName });
      return;
    }

    if (pathname === '/api/eduba/repositories' && method === 'GET') {
      await fulfillJson(route, state.repositories);
      return;
    }

    if (pathname === '/api/eduba/repositories' && method === 'POST') {
      await fulfillJson(route, { success: true }, 201);
      return;
    }

    if (/^\/api\/eduba\/repositories\/\d+$/.test(pathname) && method === 'GET') {
      await fulfillJson(route, state.repositoryDetails);
      return;
    }

    if (/^\/api\/eduba\/repositories\/\d+\/commits$/.test(pathname) && method === 'GET') {
      await fulfillJson(route, state.commits);
      return;
    }

    if (/^\/api\/eduba\/repositories\/\d+\/artifacts$/.test(pathname) && method === 'GET') {
      await fulfillJson(route, state.artifacts);
      return;
    }

    if (/^\/api\/eduba\/repositories\/\d+\/artifacts$/.test(pathname) && method === 'POST') {
      await fulfillJson(route, { success: true }, 201);
      return;
    }

    if (pathname === '/api/eduba/search' && method === 'GET') {
      await fulfillJson(route, state.searchResults);
      return;
    }

    await route.fulfill({ status: 404, body: 'Unhandled API route in Playwright fixture' });
  });
}

test.beforeEach(async ({ page }) => {
  const state = createState();
  await page.addInitScript(() => {
    localStorage.setItem('token', 'playwright-token');
    localStorage.setItem('station_unlocked', 'true');
  });
  await mockApi(page, state);
});

test('covers the dashboard, license list, and license detail actions', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText('Welcome to LicenseVault - Your lifetime license manager')).toBeVisible();

  await page.getByRole('button', { name: 'Add License' }).first().click();
  await page.getByLabel('Product Name *').fill('Playwright Added License');
  await page.getByLabel('License Key').fill('MMMM-NNNN-OOOO-PPPP');
  await page.getByLabel('Product URL').fill('https://example.com/playwright');
  await page.getByRole('button', { name: 'Add License' }).nth(1).click();

  await expect(page.getByText('Playwright Added License')).toBeVisible();

  await page.getByRole('link', { name: 'Licenses' }).click();
  await expect(page.getByRole('heading', { name: 'License Manager' })).toBeVisible();
  await page.getByRole('textbox', { name: '' }).fill('Suite Active');
  await expect(page.getByText('Suite Active')).toBeVisible();

  await page.getByRole('link', { name: 'View Details' }).first().click();
  await expect(page.getByText('License Details')).toBeVisible();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByPlaceholder('Additional notes about this license...').fill('Updated by Playwright');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText('Updated by Playwright')).toBeVisible();
});

test('covers the remaining feature pages and their primary actions', async ({ page }) => {
  await page.goto('/sites');
  await expect(page.getByRole('heading', { name: 'Site Connections' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect' }).first()).toBeVisible();

  await page.goto('/reminders');
  await expect(page.getByRole('heading', { name: 'Reminder Settings' })).toBeVisible();
  await page.getByRole('button', { name: 'Save Settings' }).click();

  await page.goto('/greta');
  await expect(page.getByText('Welcome to Greta Questera AI')).toBeVisible();
  await page.getByPlaceholder('Ask Greta anything...').fill('Summarize my licenses');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Greta handled: Summarize my licenses')).toBeVisible();

  await page.goto('/twidget');
  await expect(page.getByRole('heading', { name: 'Twidget.io API Builder' })).toBeVisible();
  await page.getByRole('button', { name: 'Create New API' }).click();
  await expect(page.getByRole('heading', { name: 'Create New API' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.goto('/pickaxe');
  await expect(page.getByRole('heading', { name: 'Pickaxe AI' })).toBeVisible();
  await page.getByRole('button', { name: 'Chat' }).first().click();
  await page.getByPlaceholder(/Ask License Helper anything/).fill('What should I renew?');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Pickaxe handled: What should I renew?')).toBeVisible();

  await page.goto('/storage');
  await expect(page.getByRole('heading', { name: 'Cloud Storage' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Storage Service' })).toBeVisible();

  await page.goto('/eduba');
  await expect(page.getByRole('heading', { name: /Eduba Code Vault & Library/i })).toBeVisible();
  await page.getByPlaceholder('Search across all sovereign code...').fill('sync');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByText('syncLicenses', { exact: true }).first()).toBeVisible();
});
