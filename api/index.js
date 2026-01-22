/**
 * Vercel Serverless Function for Keeta Chain
 * Compatible with Vercel's serverless environment
 */

import { Blockchain } from '../src/core/blockchain.js';
import { KeetaNode } from '../src/network/node.js';
import { WalletAPI } from '../src/api/wallet.js';
import { ExplorerAPI } from '../src/api/explorer.js';
import { MiningAPI } from '../src/api/mining.js';
import { config } from '../src/config/config.js';
import { monitor } from '../src/monitoring/metrics.js';
import { demoTransaction, KeetaNet, KeetaNetworkClient } from '../src/keeta-integration.js';

// Global instances for serverless environment
let blockchain = null;
let node = null;
let walletAPI = null;
let explorerAPI = null;
let miningAPI = null;
let isInitialized = false;

// Initialize blockchain (runs once per function instance)
async function initialize() {
  if (isInitialized) return;
  
  try {
    // Load configuration
    await config.load();
    config.validate();
    
    // Initialize blockchain components
    blockchain = new Blockchain();
    node = new KeetaNode(blockchain);
    walletAPI = new WalletAPI(blockchain);
    explorerAPI = new ExplorerAPI(blockchain);
    miningAPI = new MiningAPI(blockchain, node);
    
    // Initialize blockchain with database
    await blockchain.initialize();
    
    // Start monitoring
    await monitor.start(blockchain, node);
    
    isInitialized = true;
    console.log('✅ Vercel Keeta Chain initialized');
  } catch (error) {
    console.error('❌ Initialization failed:', error);
    throw error;
  }
}

// Main handler for all requests
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  try {
    // Initialize blockchain
    await initialize();
    
    const { url, method } = req;
    const path = url.split('?')[0];
    
    console.log(`🌐 Vercel request: ${method} ${path}`);
    
    // Route handling
    if (path === '/' || path === '/api') {
      return handleMainDashboard(req, res);
    }
    
    if (path.startsWith('/api/wallet')) {
      return handleWalletAPI(req, res, path.replace('/api/wallet', ''));
    }
    
    if (path.startsWith('/api/explorer')) {
      return handleExplorerAPI(req, res, path.replace('/api/explorer', ''));
    }
    
    if (path.startsWith('/api/mining')) {
      return handleMiningAPI(req, res, path.replace('/api/mining', ''));
    }
    
    if (path.startsWith('/keeta')) {
      return handleKeetaAPI(req, res, path.replace('/keeta', ''));
    }
    
    if (path === '/health') {
      return handleHealth(req, res);
    }
    
    if (path === '/metrics') {
      return handleMetrics(req, res);
    }
    
    // 404 for unknown routes
    res.status(404).json({
      success: false,
      error: 'Route not found',
      path,
      method
    });
    
  } catch (error) {
    console.error('❌ Request handler error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// Main dashboard handler
async function handleMainDashboard(req, res) {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>🔗 Keeta Chain - Vercel Deployment</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: #333;
          min-height: 100vh;
          padding: 20px;
        }
        .container {
          max-width: 1200px;
          margin: 0 auto;
          background: rgba(255, 255, 255, 0.95);
          border-radius: 20px;
          padding: 40px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.1);
        }
        header {
          text-align: center;
          color: white;
          margin-bottom: 40px;
        }
        header h1 {
          font-size: 3em;
          margin-bottom: 10px;
          text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        .vercel-badge {
          background: #000;
          color: white;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 0.9em;
          font-weight: bold;
          display: inline-block;
          margin-bottom: 20px;
        }
        .status-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 20px;
          margin-bottom: 40px;
        }
        .status-card {
          background: #f7fafc;
          padding: 25px;
          border-radius: 15px;
          text-align: center;
          border-left: 4px solid #667eea;
        }
        .status-value {
          font-size: 2em;
          font-weight: bold;
          color: #667eea;
          margin-bottom: 10px;
        }
        .status-label {
          color: #718096;
          font-weight: 500;
        }
        .api-section {
          background: #edf2f7;
          padding: 30px;
          border-radius: 15px;
          margin-bottom: 20px;
        }
        .api-section h3 {
          color: #4a5568;
          margin-bottom: 20px;
        }
        .api-endpoint {
          background: white;
          padding: 15px;
          border-radius: 8px;
          margin: 10px 0;
          font-family: monospace;
          border-left: 3px solid #48bb78;
        }
        .method {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 0.8em;
          font-weight: bold;
          margin-right: 10px;
        }
        .get { background: #e6fffa; color: #00695c; }
        .post { background: #fef5e7; color: #d97706; }
        .btn {
          background: #667eea;
          color: white;
          border: none;
          padding: 12px 25px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 16px;
          font-weight: 500;
          transition: all 0.3s;
          text-decoration: none;
          display: inline-block;
          margin: 10px 5px;
        }
        .btn:hover {
          background: #5a67d8;
          transform: translateY(-2px);
        }
        .btn.keeta {
          background: #38a169;
        }
        .btn.keeta:hover {
          background: #2f855a;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <header>
          <div class="vercel-badge">🚀 DEPLOYED ON VERCEL</div>
          <h1>🔗 Keeta Chain</h1>
          <p>Serverless Blockchain Network - Live on Vercel</p>
        </header>

        <div class="status-grid">
          <div class="status-card">
            <div class="status-value">✅ Active</div>
            <div class="status-label">Server Status</div>
          </div>
          <div class="status-card">
            <div class="status-value">Vercel</div>
            <div class="status-label">Platform</div>
          </div>
          <div class="status-card">
            <div class="status-value">Serverless</div>
            <div class="status-label">Architecture</div>
          </div>
          <div class="status-card">
            <div class="status-value">KETA</div>
            <div class="status-label">Native Token</div>
          </div>
        </div>

        <div class="api-section">
          <h3>🔗 Available API Endpoints</h3>
          
          <div class="api-endpoint">
            <span class="method get">GET</span>
            <strong>/health</strong> - System health check
          </div>
          
          <div class="api-endpoint">
            <span class="method get">GET</span>
            <strong>/metrics</strong> - System metrics
          </div>
          
          <div class="api-endpoint">
            <span class="method post">POST</span>
            <strong>/api/wallet/create</strong> - Create wallet
          </div>
          
          <div class="api-endpoint">
            <span class="method get">GET</span>
            <strong>/api/explorer/info</strong> - Blockchain info
          </div>
          
          <div class="api-endpoint">
            <span class="method post">POST</span>
            <strong>/keeta/demo-transaction</strong> - Keeta demo
          </div>
          
          <div class="api-endpoint">
            <span class="method post">POST</span>
            <strong>/keeta/create-account</strong> - Create Keeta account
          </div>
        </div>

        <div style="text-align: center;">
          <button class="btn" onclick="testHealth()">🏥 Test Health</button>
          <button class="btn" onclick="testKeeta()">🌐 Test Keeta Integration</button>
          <button class="btn keeta" onclick="createWallet()">💼 Create Wallet</button>
          <button class="btn" onclick="viewExplorer()">🔍 View Explorer</button>
        </div>

        <div id="results" style="margin-top: 30px;"></div>
      </div>

      <script>
        async function testHealth() {
          try {
            const response = await fetch('/health');
            const data = await response.json();
            document.getElementById('results').innerHTML = \`
              <div class="api-section">
                <h3>✅ Health Check Results</h3>
                <pre>\${JSON.stringify(data, null, 2)}</pre>
              </div>
            \`;
          } catch (error) {
            document.getElementById('results').innerHTML = \`
              <div class="api-section">
                <h3>❌ Health Check Failed</h3>
                <p>\${error.message}</p>
              </div>
            \`;
          }
        }

        async function testKeeta() {
          try {
            const response = await fetch('/keeta/demo-transaction', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            document.getElementById('results').innerHTML = \`
              <div class="api-section">
                <h3>🌐 Keeta Integration Results</h3>
                <pre>\${JSON.stringify(data, null, 2)}</pre>
              </div>
            \`;
          } catch (error) {
            document.getElementById('results').innerHTML = \`
              <div class="api-section">
                <h3>❌ Keeta Test Failed</h3>
                <p>\${error.message}</p>
              </div>
            \`;
          }
        }

        async function createWallet() {
          try {
            const response = await fetch('/api/wallet/create', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({})
            });
            const data = await response.json();
            document.getElementById('results').innerHTML = \`
              <div class="api-section">
                <h3>💼 New Wallet Created</h3>
                <pre>\${JSON.stringify(data, null, 2)}</pre>
              </div>
            \`;
          } catch (error) {
            document.getElementById('results').innerHTML = \`
              <div class="api-section">
                <h3>❌ Wallet Creation Failed</h3>
                <p>\${error.message}</p>
              </div>
            \`;
          }
        }

        function viewExplorer() {
          window.open('/api/explorer/info', '_blank');
        }

        // Auto-test on load
        window.addEventListener('load', () => {
          setTimeout(testHealth, 1000);
        });
      </script>
    </body>
    </html>
  `;
  
  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(html);
}

// Health check handler
async function handleHealth(req, res) {
  try {
    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      platform: 'vercel-serverless',
      environment: process.env.NODE_ENV || 'production',
      version: '1.0.0',
      blockchain: {
        height: blockchain.getLatestBlock().height,
        isValid: blockchain.isChainValid(),
        pendingTransactions: blockchain.pendingTransactions.length
      },
      network: {
        connectedPeers: node.getConnectedPeers().length,
        hashRate: node.getHashRate()
      },
      system: {
        platform: 'vercel',
        runtime: 'nodejs',
        memory: process.memoryUsage(),
        region: process.env.VERCEL_REGION || 'unknown'
      },
      keeta: {
        connected: true,
        network: 'test',
        integration: 'active'
      }
    };
    
    res.status(200).json(healthData);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
}

// Metrics handler
async function handleMetrics(req, res) {
  try {
    const metrics = monitor.getMetrics();
    res.status(200).json(metrics);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// Wallet API handler
async function handleWalletAPI(req, res, path) {
  try {
    const router = walletAPI.getRouter();
    
    // Simulate Express router behavior
    if (req.method === 'POST' && path === '/create') {
      const wallet = new (await import('../src/core/crypto.js')).SecureWallet('default-password');
      const newWallet = wallet.generateWallet();
      
      res.json({
        success: true,
        wallet: {
          address: newWallet.address,
          publicKey: newWallet.publicKey
        }
      });
      return;
    }
    
    if (req.method === 'GET' && path.startsWith('/balance/')) {
      const address = path.replace('/balance/', '');
      const balance = blockchain.getBalance(address);
      
      res.json({
        success: true,
        address,
        balance
      });
      return;
    }
    
    res.status(404).json({
      success: false,
      error: 'Wallet endpoint not found'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// Explorer API handler
async function handleExplorerAPI(req, res, path) {
  try {
    if (req.method === 'GET' && path === '/info') {
      const stats = blockchain.getChainStats();
      const latestBlock = blockchain.getLatestBlock();
      
      res.json({
        success: true,
        blockchain: {
          ...stats,
          latestBlock: {
            index: latestBlock.index,
            hash: latestBlock.hash,
            timestamp: latestBlock.timestamp,
            transactionCount: latestBlock.transactions.length
          }
        }
      });
      return;
    }
    
    res.status(404).json({
      success: false,
      error: 'Explorer endpoint not found'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// Mining API handler
async function handleMiningAPI(req, res, path) {
  try {
    if (req.method === 'GET' && path === '/info') {
      const latestBlock = blockchain.getLatestBlock();
      const pendingCount = blockchain.pendingTransactions.length;
      
      res.json({
        success: true,
        mining: {
          difficulty: blockchain.difficulty,
          blockReward: blockchain.miningReward,
          pendingTransactions: pendingCount,
          latestBlock: {
            index: latestBlock.index,
            hash: latestBlock.hash,
            timestamp: latestBlock.timestamp
          },
          maxTransactionsPerBlock: blockchain.maxTransactionsPerBlock,
          networkHashRate: node.getHashRate()
        }
      });
      return;
    }
    
    res.status(404).json({
      success: false,
      error: 'Mining endpoint not found'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// Keeta API handler
async function handleKeetaAPI(req, res, path) {
  try {
    if (req.method === 'POST' && path === '/demo-transaction') {
      const transaction = await demoTransaction();
      res.json({
        success: true,
        transaction,
        message: 'Demo transaction completed successfully'
      });
      return;
    }
    
    if (req.method === 'POST' && path === '/create-account') {
      const client = new KeetaNetworkClient('test');
      const account = client.createAccount();
      
      res.json({
        success: true,
        account: {
          publicKeyString: account.publicKeyString,
          address: account.address,
          network: 'test'
        },
        seed: client.seed,
        warning: 'Save your seed securely! Anyone with access can control your account.'
      });
      return;
    }
    
    if (req.method === 'GET' && path === '/status') {
      const client = new KeetaNetworkClient('test');
      await client.connect();
      
      res.json({
        success: true,
        network: client.network,
        chainInfo: client.chainInfo,
        baseToken: client.baseToken,
        integration: 'active'
      });
      return;
    }
    
    res.status(404).json({
      success: false,
      error: 'Keeta endpoint not found'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
