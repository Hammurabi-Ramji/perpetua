const express = require('express');
const router = express.Router();
const twidgetService = require('../services/twidget.service');
const { authenticateToken } = require('../auth/middleware');

// GET /api/twidget/apis - Get user's APIs
router.get('/apis', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const apis = await twidgetService.getUserApis(userId);
    res.json(apis);
  } catch (error) {
    console.error('Twidget get APIs error:', error);
    res.status(500).json({ error: 'Failed to fetch APIs' });
  }
});

// POST /api/twidget/apis - Create new API
router.post('/apis', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const api = await twidgetService.createApi(userId, req.body);
    res.status(201).json(api);
  } catch (error) {
    console.error('Twidget create API error:', error);
    res.status(500).json({ error: 'Failed to create API' });
  }
});

// PUT /api/twidget/apis/:id - Update API
router.put('/apis/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const apiId = req.params.id;
    const result = await twidgetService.updateApi(userId, apiId, req.body);
    res.json(result);
  } catch (error) {
    console.error('Twidget update API error:', error);
    res.status(500).json({ error: 'Failed to update API' });
  }
});

// DELETE /api/twidget/apis/:id - Delete API
router.delete('/apis/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const apiId = req.params.id;
    const result = await twidgetService.deleteApi(userId, apiId);
    res.json(result);
  } catch (error) {
    console.error('Twidget delete API error:', error);
    res.status(500).json({ error: 'Failed to delete API' });
  }
});

// POST /api/twidget/execute/:id - Execute API
router.post('/execute/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const apiId = req.params.id;
    const params = { ...req.body, userId };
    const result = await twidgetService.executeApi(userId, apiId, params);
    res.json(result);
  } catch (error) {
    console.error('Twidget execute API error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Dynamic route handler for user-defined APIs
// This would be registered dynamically based on user APIs
// For now, we'll handle it in a separate middleware

module.exports = router;