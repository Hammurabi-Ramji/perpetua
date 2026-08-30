const axios = require('axios');
const { getDatabase } = require('../database');

class GretaService {
  constructor() {
    this.ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    this.model = process.env.OLLAMA_MODEL || 'llama2'; // Default model
  }

  async sendPrompt(userId, sessionId, prompt) {
    try {
      // Get conversation history for context
      const history = await this.getConversationHistory(userId, sessionId);

      // Build context with license data if relevant
      const context = await this.buildContext(userId, prompt);

      // Prepare messages for Ollama
      const messages = [
        {
          role: 'system',
          content: `You are Greta Questera AI, a prompt-driven vibe coding assistant for the Lifetime License Manager application. You help users with license management, code generation, and development tasks. You have access to the user's license data and can provide insights, generate code snippets, or answer questions about licenses.

Context: ${context}

Be helpful, creative, and focused on license management and development.`
        },
        ...history.map(h => ({ role: 'user', content: h.message })),
        ...history.map(h => ({ role: 'assistant', content: h.response })).filter(h => h.content),
        { role: 'user', content: prompt }
      ];

      // Send to Ollama
      const response = await axios.post(`${this.ollamaUrl}/api/chat`, {
        model: this.model,
        messages: messages,
        stream: false
      });

      const aiResponse = response.data.message.content;

      // Store conversation
      await this.storeConversation(userId, sessionId, prompt, aiResponse);

      return aiResponse;
    } catch (error) {
      console.error('Greta AI error:', error);
      throw new Error('Failed to process AI request');
    }
  }

  async getConversationHistory(userId, sessionId, limit = 10) {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      db.all(
        'SELECT message, response FROM greta_conversations WHERE user_id = ? AND session_id = ? ORDER BY timestamp DESC LIMIT ?',
        [userId, sessionId, limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows.reverse()); // Return in chronological order
        }
      );
    });
  }

  async buildContext(userId, prompt) {
    // Get user's license stats for context
    const db = getDatabase();
    const stats = await new Promise((resolve, reject) => {
      db.get(`
        SELECT
          COUNT(*) as total_licenses,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active_licenses,
          COUNT(CASE WHEN action_required = 1 THEN 1 END) as action_required
        FROM licenses WHERE user_id = ?
      `, [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    return `User has ${stats.total_licenses} total licenses (${stats.active_licenses} active, ${stats.action_required} requiring action).`;
  }

  async storeConversation(userId, sessionId, message, response) {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      db.run(
        'INSERT INTO greta_conversations (user_id, session_id, message, response) VALUES (?, ?, ?, ?)',
        [userId, sessionId, message, response],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  async getSessions(userId) {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      db.all(
        'SELECT session_id, MAX(timestamp) as last_message FROM greta_conversations WHERE user_id = ? GROUP BY session_id ORDER BY last_message DESC',
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }
}

module.exports = new GretaService();