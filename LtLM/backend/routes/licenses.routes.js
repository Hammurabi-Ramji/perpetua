const express = require('express');
const { authenticateToken } = require('../auth/middleware');
const licenseService = require('../services/license.service');

const router = express.Router();

// Get user licenses
router.get('/', authenticateToken, async (req, res) => {
  try {
    const filters = {
      status: req.query.status,
      action_required: req.query.action_required === 'true'
    };

    const licenses = await licenseService.getUserLicenses(req.user.id, filters);
    res.json(licenses);
  } catch (err) {
    console.error('Get licenses error:', err);
    res.status(500).json({ error: 'Failed to fetch licenses' });
  }
});

// Add new license
router.post('/', authenticateToken, async (req, res) => {
  try {
    const licenseData = req.body;
    const result = await licenseService.addLicense(req.user.id, licenseData);
    res.status(201).json({ id: result.id, message: 'License added successfully' });
  } catch (err) {
    console.error('Add license error:', err);
    res.status(500).json({ error: 'Failed to add license' });
  }
});

// Get license stats
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const licenses = await licenseService.getUserLicenses(req.user.id);

    const stats = {
      total: licenses.length,
      active: licenses.filter(l => l.status === 'active').length,
      actionRequired: licenses.filter(l => l.action_required).length,
      connectedSites: new Set(licenses.map(l => l.site_name).filter(Boolean)).size
    };

    res.json(stats);
  } catch (err) {
    console.error('Get stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Export licenses to CSV
router.get('/export/csv', authenticateToken, async (req, res) => {
  try {
    const licenses = await licenseService.getUserLicenses(req.user.id);

    const csvHeaders = [
      'Product Name',
      'License Key',
      'Purchase Date',
      'Expiry Date',
      'Status',
      'Source Site',
      'Product URL',
      'Redemption URL',
      'Download URL',
      'Notes'
    ];

    const csvRows = licenses.map(license => [
      `"${license.product_name || ''}"`,
      `"${license.license_key || ''}"`,
      license.purchase_date ? new Date(license.purchase_date).toLocaleDateString() : '',
      license.expiry_date ? new Date(license.expiry_date).toLocaleDateString() : '',
      license.status || '',
      `"${license.source_site || ''}"`,
      `"${license.product_url || ''}"`,
      `"${license.redemption_url || ''}"`,
      `"${license.download_url || ''}"`,
      `"${license.notes || ''}"`
    ]);

    const csvContent = [csvHeaders.join(','), ...csvRows.map(row => row.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="licenses_export_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvContent);
  } catch (err) {
    console.error('Export licenses error:', err);
    res.status(500).json({ error: 'Failed to export licenses' });
  }
});

// Get expiring soon
router.get('/expiring/soon', authenticateToken, async (req, res) => {
  try {
    const days = Number.parseInt(req.query.days) || 30;
    const licenses = await licenseService.getExpiringSoon(req.user.id, days);
    res.json(licenses);
  } catch (err) {
    console.error('Get expiring error:', err);
    res.status(500).json({ error: 'Failed to fetch expiring licenses' });
  }
});

// Get single license
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const license = await licenseService.getLicenseById(req.user.id, req.params.id);
    if (!license) {
      return res.status(404).json({ error: 'License not found' });
    }
    res.json(license);
  } catch (err) {
    console.error('Get license error:', err);
    res.status(500).json({ error: 'Failed to fetch license' });
  }
});

// Update license action
router.patch('/:id/action', authenticateToken, async (req, res) => {
  try {
    const { description, deadline } = req.body;
    await licenseService.updateLicenseAction(req.user.id, req.params.id, { description, deadline });
    res.json({ success: true });
  } catch (err) {
    console.error('Update action error:', err);
    res.status(500).json({ error: 'Failed to update action' });
  }
});

// Mark action complete
router.patch('/:id/action/complete', authenticateToken, async (req, res) => {
  try {
    await licenseService.markActionComplete(req.user.id, req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Complete action error:', err);
    res.status(500).json({ error: 'Failed to complete action' });
  }
});

// Update license
router.patch('/:id', authenticateToken, async (req, res) => {
  try {
    const licenseData = req.body;
    await licenseService.updateLicense(req.user.id, req.params.id, licenseData);
    res.json({ success: true });
  } catch (err) {
    console.error('Update license error:', err);
    res.status(500).json({ error: 'Failed to update license' });
  }
});

// Delete license
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    await licenseService.deleteLicense(req.user.id, req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete license error:', err);
    res.status(500).json({ error: 'Failed to delete license' });
  }
});

module.exports = router;
