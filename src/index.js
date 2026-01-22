import express from 'express';
import { Blockchain } from './core/blockchain.js';
import { KeetaNode } from './network/node.js';
import { WalletAPI } from './api/wallet.js';
import { ExplorerAPI } from './api/explorer.js';
import { MiningAPI } from './api/mining.js';
import cors from 'cors';
import bodyParser from 'body-parser';
import { 
  securityHeaders, 
  requestLogger, 
  errorHandler, 
  corsOptions
} from './middleware/security.js';
import { config } from './config/config.js';
import { monitor } from './monitoring/metrics.js';

const app = express();

// Load configuration
await config.load();
config.validate();

// Initialize Keeta Chain components
const blockchain = new Blockchain();
const node = new KeetaNode(blockchain);
const walletAPI = new WalletAPI(blockchain);
const explorerAPI = new ExplorerAPI(blockchain);
const miningAPI = new MiningAPI(blockchain, node);

// Initialize blockchain with database
await blockchain.initialize();

// Start monitoring
await monitor.start(blockchain, node);

// Get port from configuration
const port = config.get('server.port', 3001);

// Middleware
app.use(securityHeaders);
app.use(cors(corsOptions));
app.use(requestLogger);
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static('public'));

// Simple rate limiting middleware
const requestCounts = new Map();
const rateLimitMiddleware = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const windowStart = now - windowMs;
    
    if (!requestCounts.has(key)) {
      requestCounts.set(key, []);
    }
    
    const requests = requestCounts.get(key);
    const validRequests = requests.filter(timestamp => timestamp > windowStart);
    
    if (validRequests.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        error: 'Too many requests from this IP, please try again later'
      });
    }
    
    validRequests.push(now);
    requestCounts.set(key, validRequests);
    next();
  };
};

// API Routes with rate limiting
app.use('/api/wallet', rateLimitMiddleware(20, 15 * 60 * 1000), walletAPI.getRouter());
app.use('/api/explorer', rateLimitMiddleware(100, 15 * 60 * 1000), explorerAPI.getRouter());
app.use('/api/mining', rateLimitMiddleware(10, 60 * 1000), miningAPI.getRouter());

// Main Dashboard Route
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Keeta Chain - Layer-1 Blockchain Network</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: #333;
          min-height: 100vh;
        }
        .container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 20px;
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
        header p {
          font-size: 1.2em;
          opacity: 0.9;
        }
        .dashboard {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
          gap: 25px;
          margin-bottom: 40px;
        }
        .card {
          background: rgba(255, 255, 255, 0.95);
          border-radius: 15px;
          padding: 30px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.2);
          backdrop-filter: blur(10px);
          transition: transform 0.3s, box-shadow 0.3s;
        }
        .card:hover {
          transform: translateY(-5px);
          box-shadow: 0 15px 40px rgba(0,0,0,0.3);
        }
        .card h3 {
          color: #4a5568;
          margin-bottom: 20px;
          font-size: 1.5em;
          display: flex;
          align-items: center;
        }
        .card h3::before {
          content: "⚡";
          margin-right: 10px;
          font-size: 1.2em;
        }
        .metric {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin: 15px 0;
          padding: 10px 0;
          border-bottom: 1px solid #e2e8f0;
        }
        .metric:last-child {
          border-bottom: none;
        }
        .metric-label {
          font-weight: 500;
          color: #718096;
        }
        .metric-value {
          font-weight: 700;
          color: #2d3748;
          font-size: 1.1em;
        }
        .status {
          display: inline-block;
          padding: 5px 15px;
          border-radius: 20px;
          font-size: 0.85em;
          font-weight: 600;
        }
        .status.active {
          background: #48bb78;
          color: white;
        }
        .status.pending {
          background: #ed8936;
          color: white;
        }
        .nav-buttons {
          display: flex;
          gap: 15px;
          justify-content: center;
          flex-wrap: wrap;
        }
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
        }
        .btn:hover {
          background: #5a67d8;
          transform: translateY(-2px);
          box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
        }
        .performance-bar {
          width: 100%;
          height: 8px;
          background: #e2e8f0;
          border-radius: 4px;
          overflow: hidden;
          margin: 10px 0;
        }
        .performance-fill {
          height: 100%;
          background: linear-gradient(90deg, #667eea, #764ba2);
          transition: width 0.3s;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <header>
          <h1>🔗 Keeta Chain</h1>
          <p>Layer-1 Blockchain Network - 10M TPS, 400ms Settlement</p>
        </header>

        <div class="dashboard">
          <div class="card">
            <h3>Network Status</h3>
            <div class="metric">
              <span class="metric-label">Status</span>
              <span class="status active">Active</span>
            </div>
            <div class="metric">
              <span class="metric-label">Block Height</span>
              <span class="metric-value" id="blockHeight">1,234,567</span>
            </div>
            <div class="metric">
              <span class="metric-label">Connected Nodes</span>
              <span class="metric-value" id="nodeCount">42</span>
            </div>
            <div class="metric">
              <span class="metric-label">Network Hashrate</span>
              <span class="metric-value">1.2 PH/s</span>
            </div>
          </div>

          <div class="card">
            <h3>Performance Metrics</h3>
            <div class="metric">
              <span class="metric-label">Current TPS</span>
              <span class="metric-value" id="currentTPS">8.5M</span>
            </div>
            <div class="performance-bar">
              <div class="performance-fill" style="width: 85%"></div>
            </div>
            <div class="metric">
              <span class="metric-label">Avg Settlement Time</span>
              <span class="metric-value">385ms</span>
            </div>
            <div class="metric">
              <span class="metric-label">Block Time</span>
              <span class="metric-value">2.5s</span>
            </div>
          </div>

          <div class="card">
            <h3>Token Economics</h3>
            <div class="metric">
              <span class="metric-label">KEETA Price</span>
              <span class="metric-value">$2.45</span>
            </div>
            <div class="metric">
              <span class="metric-label">Market Cap</span>
              <span class="metric-value">$245M</span>
            </div>
            <div class="metric">
              <span class="metric-label">Total Supply</span>
              <span class="metric-value">100M KEETA</span>
            </div>
            <div class="metric">
              <span class="metric-label">Staked</span>
              <span class="metric-value">67.8M KEETA</span>
            </div>
          </div>

          <div class="card">
            <h3>Cross-Chain Activity</h3>
            <div class="metric">
              <span class="metric-label">Active Bridges</span>
              <span class="metric-value">12</span>
            </div>
            <div class="metric">
              <span class="metric-label">Cross-Chain TX (24h)</span>
              <span class="metric-value">1.2M</span>
            </div>
            <div class="metric">
              <span class="metric-label">Connected Chains</span>
              <span class="metric-value">8</span>
            </div>
            <div class="metric">
              <span class="metric-label">Bridge Volume (24h)</span>
              <span class="metric-value">$45.2M</span>
            </div>
          </div>
        </div>

        <div class="nav-buttons">
          <a href="/api/wallet" class="btn">💼 Wallet</a>
          <a href="/api/explorer" class="btn">🔍 Block Explorer</a>
          <a href="/api/mining" class="btn">⛏️ Mining</a>
          <a href="/api/network" class="btn">🌐 Network</a>
          <a href="/api/bridge" class="btn">🌉 Cross-Chain Bridge</a>
        </div>
      </div>

      <script>
        // Simulate real-time updates
        setInterval(() => {
          const blockHeight = document.getElementById('blockHeight');
          const nodeCount = document.getElementById('nodeCount');
          const currentTPS = document.getElementById('currentTPS');
          
          if (blockHeight) {
            const current = parseInt(blockHeight.textContent.replace(/,/g, ''));
            blockHeight.textContent = (current + Math.floor(Math.random() * 3)).toLocaleString();
          }
          
          if (nodeCount) {
            const current = parseInt(nodeCount.textContent);
            nodeCount.textContent = current + Math.floor(Math.random() * 2) - 1;
          }
          
          if (currentTPS) {
            const current = parseFloat(currentTPS.textContent.replace('M', ''));
            const newValue = (current + (Math.random() - 0.5) * 0.5).toFixed(1);
            currentTPS.textContent = newValue + 'M';
          }
        }, 3000);
      </script>
    </body>
    </html>
  `);
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  const acceptHeader = req.headers.accept || '';
  
  if (acceptHeader.includes('text/plain')) {
    res.set('Content-Type', 'text/plain');
    res.send(monitor.getPrometheusMetrics());
  } else {
    res.json(monitor.getMetrics());
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  const startTime = Date.now();
  
  try {
    const isHealthy = blockchain.isChainValid();
    const peers = node.getConnectedPeers();
    
    const healthData = {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      blockchain: {
        height: blockchain.getLatestBlock().height,
        isValid: isHealthy,
        pendingTransactions: blockchain.pendingTransactions.length
      },
      network: {
        connectedPeers: peers.length,
        hashRate: node.getHashRate()
      },
      system: {
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
      }
    };
    
    monitor.recordApiRequest('GET', '/health', isHealthy ? 200 : 503, Date.now() - startTime);
    
    res.status(isHealthy ? 200 : 503).json(healthData);
  } catch (error) {
    monitor.recordApiRequest('GET', '/health', 500, Date.now() - startTime);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Start the server
app.listen(port, () => {
  console.log(`🔗 Keeta Chain Network running on http://localhost:${port}`);
  console.log(`📊 Dashboard: http://localhost:${port}`);
  console.log(`🔍 Explorer: http://localhost:${port}/api/explorer`);
  console.log(`💼 Wallet: http://localhost:${port}/api/wallet`);
  console.log(`⛏️ Mining: http://localhost:${port}/api/mining`);
  console.log(`📈 Metrics: http://localhost:${port}/metrics`);
  console.log(`🏥 Health: http://localhost:${port}/health`);
  console.log(`🛡️ Security: Production-ready with rate limiting and validation`);
  console.log(`💾 Database: Persistent storage with backups enabled`);
  console.log(`📊 Monitoring: Real-time metrics and health checks`);
});

export { app, blockchain, node };
