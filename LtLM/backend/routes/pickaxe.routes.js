const express = require('express');
const router = express.Router();
const pickaxeService = require('../services/pickaxe.service');
const { authenticateToken } = require('../auth/middleware');

// GET /api/pickaxe/agents - Get user's agents
router.get('/agents', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const agents = await pickaxeService.getUserAgents(userId);
    res.json(agents);
  } catch (error) {
    console.error('Pickaxe get agents error:', error);
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
});

// POST /api/pickaxe/agents - Create new agent
router.post('/agents', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const agent = await pickaxeService.createAgent(userId, req.body);
    res.status(201).json(agent);
  } catch (error) {
    console.error('Pickaxe create agent error:', error);
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

// PUT /api/pickaxe/agents/:id - Update agent
router.put('/agents/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const agentId = req.params.id;
    const result = await pickaxeService.updateAgent(userId, agentId, req.body);
    res.json(result);
  } catch (error) {
    console.error('Pickaxe update agent error:', error);
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

// DELETE /api/pickaxe/agents/:id - Delete agent
router.delete('/agents/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const agentId = req.params.id;
    const result = await pickaxeService.deleteAgent(userId, agentId);
    res.json(result);
  } catch (error) {
    console.error('Pickaxe delete agent error:', error);
    res.status(500).json({ error: 'Failed to delete agent' });
  }
});

// POST /api/pickaxe/chat/:id - Chat with agent
router.post('/chat/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const agentId = req.params.id;
    const { message, sessionId } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const session = sessionId || `session_${Date.now()}`;

    const response = await pickaxeService.chatWithAgent(userId, agentId, session, message);

    res.json({
      response,
      sessionId: session
    });
  } catch (error) {
    console.error('Pickaxe chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/pickaxe/agents/:id/sessions - Get agent sessions
router.get('/agents/:id/sessions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const agentId = req.params.id;
    const sessions = await pickaxeService.getAgentSessions(userId, agentId);
    res.json(sessions);
  } catch (error) {
    console.error('Pickaxe sessions error:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// GET /api/pickaxe/agents/:id/history/:sessionId - Get conversation history
router.get('/agents/:id/history/:sessionId', authenticateToken, async (req, res) => {
  try {
    const agentId = req.params.id;
    const { sessionId } = req.params;
    const history = await pickaxeService.getConversationHistory(agentId, sessionId);
    res.json(history);
  } catch (error) {
    console.error('Pickaxe history error:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

module.exports = router;