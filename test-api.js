// Simple test script to verify API functionality
const axios = require('axios');

const API_BASE = 'http://localhost:3001/api';

async function testAPI() {
  console.log('🧪 Testing Lifetime License Manager API...\n');

  try {
    // Test 1: Check if server is responding
    console.log('1. Testing server availability...');
    const healthCheck = await axios.get(`${API_BASE}/licenses`);
    console.log('❌ Expected auth error, got:', healthCheck.status);
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('✅ Server responding correctly (auth required)');
    } else {
      console.log('❌ Unexpected error:', error.message);
    }
  }

  try {
    // Test 2: Test user registration
    console.log('\n2. Testing user registration...');
    const registerData = {
      email: 'test@example.com',
      password: 'testpass123'
    };

    const registerResponse = await axios.post(`${API_BASE}/auth/register`, registerData);
    console.log('✅ User registration successful');
    console.log('   Token received:', !!registerResponse.data.token);
    console.log('   User data:', !!registerResponse.data.user);

    const token = registerResponse.data.token;

    // Test 3: Test authentication
    console.log('\n3. Testing authentication...');
    const authResponse = await axios.get(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ Authentication successful');
    console.log('   User email:', authResponse.data.user.email);

    // Test 4: Test license operations
    console.log('\n4. Testing license operations...');

    // Add a license
    const licenseData = {
      product_name: 'Test Product',
      license_key: 'TEST-KEY-123',
      purchase_date: '2024-01-01',
      product_url: 'https://example.com',
      status: 'active'
    };

    const addResponse = await axios.post(`${API_BASE}/licenses`, licenseData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ License addition successful');
    const licenseId = addResponse.data.id;

    // Get licenses
    const licensesResponse = await axios.get(`${API_BASE}/licenses`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ License retrieval successful');
    console.log('   Licenses count:', licensesResponse.data.length);

    // Get specific license
    await axios.get(`${API_BASE}/licenses/${licenseId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ Individual license retrieval successful');

    // Update license
    const updateData = {
      product_name: 'Updated Test Product',
      notes: 'Updated via API test'
    };

    await axios.patch(`${API_BASE}/licenses/${licenseId}`, updateData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ License update successful');

    // Delete license
    await axios.delete(`${API_BASE}/licenses/${licenseId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ License deletion successful');

    // Test 5: Test stats endpoint
    console.log('\n5. Testing stats endpoint...');
    const statsResponse = await axios.get(`${API_BASE}/licenses/stats`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ Stats retrieval successful');
    console.log('   Stats:', statsResponse.data);

    // Test 6: Test Eduba Code Vault operations
    console.log('\n6. Testing Eduba Code Vault operations...');

    // Create a repository
    const repoData = {
      name: 'test-repo',
      description: 'Test repository for API testing',
      is_private: true
    };

    const repoResponse = await axios.post(`${API_BASE}/eduba/repositories`, repoData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ Repository creation successful');
    const repoId = repoResponse.data.id;

    // Get repositories
    const reposResponse = await axios.get(`${API_BASE}/eduba/repositories`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ Repository retrieval successful');
    console.log('   Repositories count:', reposResponse.data.length);

    // Create a commit
    const commitData = {
      repository_id: repoId,
      commit_message: 'Initial commit',
      changes: {
        added: ['README.md', 'src/main.js'],
        modified: [],
        deleted: []
      },
      forge_manifest: 'sha3-256-hash-placeholder'
    };

    await axios.post(`${API_BASE}/eduba/repositories/${repoId}/commits`, commitData, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ Commit creation successful');

    // Get commits
    const commitsResponse = await axios.get(`${API_BASE}/eduba/repositories/${repoId}/commits`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ Commit retrieval successful');
    console.log('   Commits count:', commitsResponse.data.length);

    // Test search
    const searchResponse = await axios.get(`${API_BASE}/eduba/search?q=Initial`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('✅ Search successful');
    console.log('   Search results:', searchResponse.data.length);

    console.log('\n🎉 All API tests passed!');

  } catch (error) {
    console.log('❌ API test failed:', error.response?.data || error.message);
  }
}

testAPI();