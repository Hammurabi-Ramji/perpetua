const express = require('express');
const router = express.Router();
const gretaService = require('../services/greta.service');
const { authenticateToken } = require('../auth/middleware');

// POST /api/greta/chat
router.post('/chat', authenticateToken, async (req, res) => {
  try {
    const { prompt, sessionId } = req.body;
    const userId = req.user.id;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const session = sessionId || `session_${Date.now()}`;

    const response = await gretaService.sendPrompt(userId, session, prompt);

    res.json({
      response,
      sessionId: session
    });
  } catch (error) {
    console.error('Greta chat error:', error);
    res.status(500).json({ error: 'Failed to process AI request' });
  }
});

// GET /api/greta/sessions
router.get('/sessions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const sessions = await gretaService.getSessions(userId);
    res.json(sessions);
  } catch (error) {
    console.error('Greta sessions error:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// GET /api/greta/history/:sessionId
router.get('/history/:sessionId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { sessionId } = req.params;
    const history = await gretaService.getConversationHistory(userId, sessionId);
    res.json(history);
  } catch (error) {
    console.error('Greta history error:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

module.exports = router;