import React, { useState, useEffect } from 'react';
import axios from 'axios';

const Pickaxe = () => {
  const [agents, setAgents] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingAgent, setEditingAgent] = useState(null);
  const [chatAgent, setChatAgent] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSessionId, setChatSessionId] = useState(`session_${Date.now()}`);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    system_prompt: '',
    model: 'llama2',
    knowledge_base: [],
    personality: ''
  });
  const [kbInput, setKbInput] = useState({ title: '', content: '' });

  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgents = async () => {
    try {
      const response = await axios.get('/api/pickaxe/agents', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setAgents(response.data);
    } catch (error) {
      console.error('Failed to load agents:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const agentData = { ...formData };

      if (editingAgent) {
        await axios.put(`/api/pickaxe/agents/${editingAgent.id}`, agentData, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
      } else {
        await axios.post('/api/pickaxe/agents', agentData, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
      }

      setShowCreateForm(false);
      setEditingAgent(null);
      resetForm();
      loadAgents();
    } catch (error) {
      console.error('Failed to save agent:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      system_prompt: '',
      model: 'llama2',
      knowledge_base: [],
      personality: ''
    });
  };

  const editAgent = (agent) => {
    setFormData({
      name: agent.name,
      description: agent.description || '',
      system_prompt: agent.system_prompt,
      model: agent.model,
      knowledge_base: agent.knowledge_base || [],
      personality: agent.personality || ''
    });
    setEditingAgent(agent);
    setShowCreateForm(true);
  };

  const deleteAgent = async (agentId) => {
    if (window.confirm('Are you sure you want to delete this agent?')) {
      try {
        await axios.delete(`/api/pickaxe/agents/${agentId}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        loadAgents();
      } catch (error) {
        console.error('Failed to delete agent:', error);
      }
    }
  };

  const startChat = (agent) => {
    setChatAgent(agent);
    setChatMessages([]);
    setChatSessionId(`session_${Date.now()}`);
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() || !chatAgent) return;

    const userMessage = { role: 'user', content: chatInput };
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setChatLoading(true);

    try {
      const response = await axios.post(`/api/pickaxe/chat/${chatAgent.id}`, {
        message: chatInput,
        sessionId: chatSessionId
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });

      const aiMessage = { role: 'assistant', content: response.data.response };
      setChatMessages(prev => [...prev, aiMessage]);
      setChatSessionId(response.data.sessionId);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage = { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setChatLoading(false);
    }
  };

  const addKnowledgeItem = () => {
    if (kbInput.title && kbInput.content) {
      setFormData(prev => ({
        ...prev,
        knowledge_base: [...prev.knowledge_base, { ...kbInput }]
      }));
      setKbInput({ title: '', content: '' });
    }
  };

  const removeKnowledgeItem = (index) => {
    setFormData(prev => ({
      ...prev,
      knowledge_base: prev.knowledge_base.filter((_, i) => i !== index)
    }));
  };

  if (chatAgent) {
    return (
      <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
        <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border-b">
          <div>
            <h2 className="text-xl font-semibold">{chatAgent.name}</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">{chatAgent.description}</p>
          </div>
          <button
            onClick={() => setChatAgent(null)}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            Back to Agents
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {chatMessages.map((msg, index) => (
            <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                msg.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border'
              }`}>
                <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
              </div>
            </div>
          ))}
          {chatLoading && (
            <div className="flex justify-start">
              <div className="bg-white dark:bg-gray-800 px-4 py-2 rounded-lg border">
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                  <span className="text-gray-500">{chatAgent.name} is thinking...</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t bg-white dark:bg-gray-800 p-4">
          <div className="flex space-x-2">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
              placeholder={`Ask ${chatAgent.name} anything...`}
              className="flex-1 px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
              disabled={chatLoading}
            />
            <button
              onClick={sendChatMessage}
              disabled={chatLoading || !chatInput.trim()}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Pickaxe AI</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Create and manage customized AI assistants for license management
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          Create New Agent
        </button>
      </div>

      {showCreateForm && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">
            {editingAgent ? 'Edit Agent' : 'Create New Agent'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Model</label>
                <select
                  value={formData.model}
                  onChange={(e) => setFormData({...formData, model: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                >
                  <option value="llama2">Llama 2</option>
                  <option value="codellama">Code Llama</option>
                  <option value="mistral">Mistral</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                rows="3"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Personality</label>
              <textarea
                value={formData.personality}
                onChange={(e) => setFormData({...formData, personality: e.target.value})}
                placeholder="Describe the agent's personality and behavior..."
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                rows="3"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">System Prompt</label>
              <textarea
                value={formData.system_prompt}
                onChange={(e) => setFormData({...formData, system_prompt: e.target.value})}
                placeholder="You are a helpful AI assistant specialized in license management..."
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                rows="5"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Knowledge Base</label>
              <div className="space-y-2">
                {formData.knowledge_base.map((item, index) => (
                  <div key={index} className="flex items-center space-x-2 p-2 bg-gray-50 dark:bg-gray-700 rounded">
                    <div className="flex-1">
                      <strong>{item.title}</strong>: {item.content.substring(0, 100)}...
                    </div>
                    <button
                      type="button"
                      onClick={() => removeKnowledgeItem(index)}
                      className="text-red-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <div className="flex space-x-2">
                  <input
                    type="text"
                    placeholder="Knowledge title"
                    value={kbInput.title}
                    onChange={(e) => setKbInput({...kbInput, title: e.target.value})}
                    className="flex-1 px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                  />
                  <input
                    type="text"
                    placeholder="Knowledge content"
                    value={kbInput.content}
                    onChange={(e) => setKbInput({...kbInput, content: e.target.value})}
                    className="flex-1 px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                  />
                  <button
                    type="button"
                    onClick={addKnowledgeItem}
                    className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>

            <div className="flex space-x-4">
              <button
                type="submit"
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
              >
                {editingAgent ? 'Update Agent' : 'Create Agent'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setEditingAgent(null);
                  resetForm();
                }}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {agents.map(agent => (
          <div key={agent.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <div className="mb-4">
              <h3 className="text-lg font-semibold">{agent.name}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">{agent.description}</p>
              <p className="text-xs text-gray-500 mt-1">Model: {agent.model}</p>
            </div>

            <div className="mb-4">
              <p className="text-sm">
                <strong>Knowledge Items:</strong> {agent.knowledge_base?.length || 0}
              </p>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() => startChat(agent)}
                className="flex-1 px-3 py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
              >
                Chat
              </button>
              <button
                onClick={() => editAgent(agent)}
                className="px-3 py-2 bg-yellow-500 text-white text-sm rounded hover:bg-yellow-600"
              >
                Edit
              </button>
              <button
                onClick={() => deleteAgent(agent.id)}
                className="px-3 py-2 bg-red-500 text-white text-sm rounded hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {agents.length === 0 && !showCreateForm && (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">⚒️</div>
          <h3 className="text-xl font-semibold mb-2">No Agents Created Yet</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Create your first AI agent to assist with license management
          </p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Create Your First Agent
          </button>
        </div>
      )}
    </div>
  );
};

export default Pickaxe;