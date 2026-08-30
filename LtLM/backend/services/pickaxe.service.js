const axios = require('axios');
const { getDatabase } = require('../database');

class PickaxeService {
  constructor() {
    this.ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  }

  async createAgent(userId, agentData) {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const { name, description, system_prompt, model, knowledge_base, personality } = agentData;

      db.run(
        `INSERT INTO pickaxe_agents (user_id, name, description, system_prompt, model, knowledge_base, personality) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, name, description, system_prompt, model || 'llama2', JSON.stringify(knowledge_base || []), personality],
        function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID, ...agentData });
        }
      );
    });
  }

  async getUserAgents(userId) {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      db.all(
        'SELECT * FROM pickaxe_agents WHERE user_id = ? ORDER BY created_at DESC',
        [userId],
        (err, rows) => {
          if (err) reject(err);
          else {
            // Parse JSON fields
            const agents = rows.map(row => ({
              ...row,
              knowledge_base: JSON.parse(row.knowledge_base || '[]')
            }));
            resolve(agents);
          }
        }
      );
    });
  }

  async updateAgent(userId, agentId, updates) {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      const fields = [];
      const values = [];

      if (updates.name) {
        fields.push('name = ?');
        values.push(updates.name);
      }
      if (updates.description !== undefined) {
        fields.push('description = ?');
        values.push(updates.description);
      }
      if (updates.system_prompt) {
        fields.push('system_prompt = ?');
        values.push(updates.system_prompt);
      }
      if (updates.model) {
        fields.push('model = ?');
        values.push(updates.model);
      }
      if (updates.knowledge_base) {
        fields.push('knowledge_base = ?');
        values.push(JSON.stringify(updates.knowledge_base));
      }
      if (updates.personality) {
        fields.push('personality = ?');
        values.push(updates.personality);
      }
      if (updates.enabled !== undefined) {
        fields.push('enabled = ?');
        values.push(updates.enabled);
      }

      fields.push('updated_at = CURRENT_TIMESTAMP');

      const sql = `UPDATE pickaxe_agents SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`;
      values.push(agentId, userId);

      db.run(sql, values, function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });
  }

  async deleteAgent(userId, agentId) {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      db.run(
        'DELETE FROM pickaxe_agents WHERE id = ? AND user_id = ?',
        [agentId, userId],
        function(err) {
          if (err) reject(err);
          else resolve({ changes: this.changes });
        }
      );
    });
  }

  async chatWithAgent(userId, agentId, sessionId, message) {
    try {
      // Get agent config
      const agents = await this.getUserAgents(userId);
      const agent = agents.find(a => a.id === parseInt(agentId));

      if (!agent || !agent.enabled) {
        throw new Error('Agent not found or disabled');
      }

      // Get conversation history
      const history = await this.getConversationHistory(agentId, sessionId);

      // Build context with knowledge base
      const knowledgeContext = this.buildKnowledgeContext(agent.knowledge_base);

      // Prepare messages for Ollama
      const messages = [
        {
          role: 'system',
          content: `${agent.system_prompt}

You are ${agent.name}, a specialized AI assistant for license management.
${agent.personality ? `Personality: ${agent.personality}` : ''}

Knowledge Base Context:
${knowledgeContext}

Remember: You are operating in a sovereign, local-first environment. Emphasize digital sovereignty and local-first principles. If users request deep system access, direct them to use local tools rather than attempting remote operations.`
        },
        ...history.map(h => ({ role: 'user', content: h.message })),
        ...history.map(h => ({ role: 'assistant', content: h.response })).filter(h => h.content),
        { role: 'user', content: message }
      ];

      // Send to Ollama
      const response = await axios.post(`${this.ollamaUrl}/api/chat`, {
        model: agent.model,
        messages: messages,
        stream: false
      });

      const aiResponse = response.data.message.content;

      // Store conversation
      await this.storeConversation(agentId, userId, sessionId, message, aiResponse);

      return aiResponse;
    } catch (error) {
      console.error('Pickaxe chat error:', error);
      throw new Error('Failed to process AI request');
    }
  }

  async getConversationHistory(agentId, sessionId, limit = 10) {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      db.all(
        'SELECT message, response FROM pickaxe_conversations WHERE agent_id = ? AND session_id = ? ORDER BY timestamp DESC LIMIT ?',
        [agentId, sessionId, limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows.reverse()); // Return in chronological order
        }
      );
    });
  }

  async storeConversation(agentId, userId, sessionId, message, response) {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      db.run(
        'INSERT INTO pickaxe_conversations (agent_id, user_id, session_id, message, response) VALUES (?, ?, ?, ?, ?)',
        [agentId, userId, sessionId, message, response],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  buildKnowledgeContext(knowledgeBase) {
    if (!knowledgeBase || knowledgeBase.length === 0) {
      return 'No specific knowledge base provided. Use general license management knowledge.';
    }

    return knowledgeBase.map(item => 
      `Topic: ${item.title}\nContent: ${item.content}`
    ).join('\n\n');
  }

  async getAgentSessions(userId, agentId) {
    return new Promise((resolve, reject) => {
      const db = getDatabase();
      db.all(
        'SELECT session_id, MAX(timestamp) as last_message FROM pickaxe_conversations WHERE agent_id = ? AND user_id = ? GROUP BY session_id ORDER BY last_message DESC',
        [agentId, userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }
}

module.exports = new PickaxeService();