import { Router } from 'express';

export class ExplorerAPI {
  constructor(blockchain) {
    this.blockchain = blockchain;
    this.router = Router();
    this.setupRoutes();
  }

  setupRoutes() {
    // Get blockchain info
    this.router.get('/info', (req, res) => {
      try {
        const stats = this.blockchain.getChainStats();
        const latestBlock = this.blockchain.getLatestBlock();
        
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
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get block by index or hash
    this.router.get('/block/:identifier', (req, res) => {
      try {
        const { identifier } = req.params;
        let block;

        // Try to find by index first
        if (!isNaN(identifier)) {
          const index = parseInt(identifier);
          block = this.blockchain.chain[index];
        } else {
          // Find by hash
          block = this.blockchain.chain.find(b => b.hash === identifier);
        }

        if (!block) {
          return res.status(404).json({ 
            success: false, 
            error: 'Block not found' 
          });
        }

        res.json({
          success: true,
          block: {
            index: block.index,
            hash: block.hash,
            previousHash: block.previousHash,
            timestamp: block.timestamp,
            nonce: block.nonce,
            transactions: block.transactions.map(tx => ({
              id: tx.id,
              fromAddress: tx.fromAddress,
              toAddress: tx.toAddress,
              amount: tx.amount,
              timestamp: tx.timestamp,
              data: tx.data
            })),
            transactionCount: block.transactions.length
          }
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get transaction by ID
    this.router.get('/transaction/:txId', (req, res) => {
      try {
        const { txId } = req.params;
        let transaction = null;
        let blockIndex = null;

        // Search through all blocks
        for (let i = 0; i < this.blockchain.chain.length; i++) {
          const block = this.blockchain.chain[i];
          const foundTx = block.transactions.find(tx => tx.id === txId);
          if (foundTx) {
            transaction = foundTx;
            blockIndex = i;
            break;
          }
        }

        if (!transaction) {
          return res.status(404).json({ 
            success: false, 
            error: 'Transaction not found' 
          });
        }

        res.json({
          success: true,
          transaction: {
            id: transaction.id,
            fromAddress: transaction.fromAddress,
            toAddress: transaction.toAddress,
            amount: transaction.amount,
            timestamp: transaction.timestamp,
            data: transaction.data,
            blockIndex,
            blockHash: this.blockchain.chain[blockIndex].hash
          }
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get latest blocks
    this.router.get('/blocks/latest', (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 10;
        const start = Math.max(0, this.blockchain.chain.length - limit);
        const latestBlocks = this.blockchain.chain.slice(start).reverse();

        res.json({
          success: true,
          blocks: latestBlocks.map(block => ({
            index: block.index,
            hash: block.hash,
            previousHash: block.previousHash,
            timestamp: block.timestamp,
            transactionCount: block.transactions.length,
            size: JSON.stringify(block).length
          }))
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get pending transactions
    this.router.get('/transactions/pending', (req, res) => {
      try {
        res.json({
          success: true,
          pendingTransactions: this.blockchain.pendingTransactions.map(tx => ({
            id: tx.id,
            fromAddress: tx.fromAddress,
            toAddress: tx.toAddress,
            amount: tx.amount,
            timestamp: tx.timestamp,
            data: tx.data
          }))
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Search transactions
    this.router.get('/search', (req, res) => {
      try {
        const { query, type } = req.query;
        
        if (!query) {
          return res.status(400).json({
            success: false,
            error: 'Search query is required'
          });
        }

        let results = [];

        if (type === 'address' || !type) {
          // Search by address
          const addressTransactions = this.blockchain.getAllTransactionsForWallet(query);
          results = results.concat(addressTransactions.map(tx => ({
            type: 'transaction',
            id: tx.id,
            fromAddress: tx.fromAddress,
            toAddress: tx.toAddress,
            amount: tx.amount,
            timestamp: tx.timestamp
          })));
        }

        if (type === 'transaction' || !type) {
          // Search by transaction ID
          for (const block of this.blockchain.chain) {
            const foundTx = block.transactions.find(tx => 
              tx.id.toLowerCase().includes(query.toLowerCase())
            );
            if (foundTx) {
              results.push({
                type: 'transaction',
                id: foundTx.id,
                fromAddress: foundTx.fromAddress,
                toAddress: foundTx.toAddress,
                amount: foundTx.amount,
                timestamp: foundTx.timestamp,
                blockIndex: block.index
              });
            }
          }
        }

        if (type === 'block' || !type) {
          // Search by block hash or index
          const block = this.blockchain.chain.find(b => 
            b.hash.toLowerCase().includes(query.toLowerCase()) ||
            b.index.toString() === query
          );
          if (block) {
            results.push({
              type: 'block',
              index: block.index,
              hash: block.hash,
              timestamp: block.timestamp,
              transactionCount: block.transactions.length
            });
          }
        }

        res.json({
          success: true,
          query,
          results: results.slice(0, 50) // Limit results
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get network statistics
    this.router.get('/stats', (req, res) => {
      try {
        const chain = this.blockchain.chain;
        const totalTransactions = chain.reduce((sum, block) => sum + block.transactions.length, 0);
        const totalFees = chain.reduce((sum, block) => {
          return sum + block.transactions.reduce((blockSum, tx) => blockSum + (tx.data?.bridgeFee || 0), 0);
        }, 0);

        // Calculate average block time
        let avgBlockTime = 0;
        if (chain.length > 1) {
          const timeDiffs = [];
          for (let i = 1; i < chain.length; i++) {
            timeDiffs.push(chain[i].timestamp - chain[i-1].timestamp);
          }
          avgBlockTime = timeDiffs.reduce((sum, diff) => sum + diff, 0) / timeDiffs.length;
        }

        // Get transaction volume over time (last 10 blocks)
        const recentBlocks = chain.slice(-10);
        const volumeData = recentBlocks.map(block => ({
          blockIndex: block.index,
          timestamp: block.timestamp,
          transactionCount: block.transactions.length,
          totalAmount: block.transactions.reduce((sum, tx) => sum + tx.amount, 0)
        }));

        res.json({
          success: true,
          stats: {
            totalBlocks: chain.length,
            totalTransactions,
            pendingTransactions: this.blockchain.pendingTransactions.length,
            avgBlockTime: Math.round(avgBlockTime),
            totalFees,
            difficulty: this.blockchain.difficulty,
            isValid: this.blockchain.isChainValid(),
            volumeData
          }
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get rich list (top addresses by balance)
    this.router.get('/rich-list', (req, res) => {
      try {
        const balances = new Map();

        // Calculate balances for all addresses
        for (const block of this.blockchain.chain) {
          for (const tx of block.transactions) {
            if (tx.fromAddress) {
              balances.set(tx.fromAddress, (balances.get(tx.fromAddress) || 0) - tx.amount);
            }
            if (tx.toAddress) {
              balances.set(tx.toAddress, (balances.get(tx.toAddress) || 0) + tx.amount);
            }
          }
        }

        // Sort by balance (descending) and take top 100
        const richList = Array.from(balances.entries())
          .filter(([address, balance]) => balance > 0)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 100)
          .map(([address, balance], index) => ({
            rank: index + 1,
            address,
            balance
          }));

        res.json({
          success: true,
          richList
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Explorer dashboard HTML
    this.router.get('/', (req, res) => {
      res.send(this.getExplorerDashboardHTML());
    });
  }

  getRouter() {
    return this.router;
  }

  getExplorerDashboardHTML() {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Keeta Chain Explorer</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
          }
          .container {
            max-width: 1400px;
            margin: 0 auto;
            background: rgba(255, 255, 255, 0.95);
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
          }
          h1 {
            color: #4a5568;
            margin-bottom: 30px;
            text-align: center;
            font-size: 2.5em;
          }
          .search-section {
            margin-bottom: 40px;
            text-align: center;
          }
          .search-box {
            display: flex;
            max-width: 600px;
            margin: 0 auto;
            gap: 10px;
          }
          .search-box input {
            flex: 1;
            padding: 15px;
            border: 2px solid #e2e8f0;
            border-radius: 10px;
            font-size: 16px;
          }
          .search-box button {
            padding: 15px 30px;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            font-size: 16px;
            transition: background 0.3s;
          }
          .search-box button:hover {
            background: #5a67d8;
          }
          .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
          }
          .stat-card {
            background: #f7fafc;
            padding: 25px;
            border-radius: 15px;
            text-align: center;
            border-left: 4px solid #667eea;
          }
          .stat-value {
            font-size: 2em;
            font-weight: bold;
            color: #667eea;
            margin-bottom: 10px;
          }
          .stat-label {
            color: #718096;
            font-weight: 500;
          }
          .section {
            margin-bottom: 40px;
          }
          .section h2 {
            color: #4a5568;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid #e2e8f0;
          }
          .block-list, .transaction-list {
            display: grid;
            gap: 15px;
          }
          .block-item, .transaction-item {
            background: #f7fafc;
            padding: 20px;
            border-radius: 10px;
            border-left: 4px solid #48bb78;
            transition: transform 0.2s;
          }
          .block-item:hover, .transaction-item:hover {
            transform: translateY(-2px);
          }
          .item-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
          }
          .item-title {
            font-weight: bold;
            color: #2d3748;
          }
          .item-time {
            color: #718096;
            font-size: 0.9em;
          }
          .item-details {
            color: #4a5568;
            line-height: 1.6;
          }
          .address {
            font-family: monospace;
            background: #edf2f7;
            padding: 2px 6px;
            border-radius: 4px;
            word-break: break-all;
          }
          .tabs {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            border-bottom: 2px solid #e2e8f0;
          }
          .tab {
            padding: 10px 20px;
            background: none;
            border: none;
            cursor: pointer;
            font-size: 16px;
            color: #718096;
            border-bottom: 2px solid transparent;
            transition: all 0.3s;
          }
          .tab.active {
            color: #667eea;
            border-bottom-color: #667eea;
          }
          .tab-content {
            display: none;
          }
          .tab-content.active {
            display: block;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🔍 Keeta Chain Explorer</h1>
          
          <div class="search-section">
            <div class="search-box">
              <input type="text" id="searchInput" placeholder="Search by address, transaction ID, or block hash">
              <button onclick="performSearch()">Search</button>
            </div>
          </div>

          <div class="stats-grid" id="statsGrid">
            <!-- Stats will be loaded here -->
          </div>

          <div class="tabs">
            <button class="tab active" onclick="showTab('latestBlocks')">Latest Blocks</button>
            <button class="tab" onclick="showTab('pendingTxs')">Pending Transactions</button>
            <button class="tab" onclick="showTab('richList')">Rich List</button>
          </div>

          <div id="latestBlocks" class="tab-content active">
            <div class="section">
              <h2>Latest Blocks</h2>
              <div class="block-list" id="blocksList">
                <!-- Blocks will be loaded here -->
              </div>
            </div>
          </div>

          <div id="pendingTxs" class="tab-content">
            <div class="section">
              <h2>Pending Transactions</h2>
              <div class="transaction-list" id="pendingList">
                <!-- Pending transactions will be loaded here -->
              </div>
            </div>
          </div>

          <div id="richList" class="tab-content">
            <div class="section">
              <h2>Top Addresses by Balance</h2>
              <div class="transaction-list" id="richListContent">
                <!-- Rich list will be loaded here -->
              </div>
            </div>
          </div>
        </div>

        <script>
          async function loadStats() {
            try {
              const response = await fetch('/api/explorer/stats');
              const data = await response.json();
              
              if (data.success) {
                const stats = data.stats;
                document.getElementById('statsGrid').innerHTML = \`
                  <div class="stat-card">
                    <div class="stat-value">\${stats.totalBlocks}</div>
                    <div class="stat-label">Total Blocks</div>
                  </div>
                  <div class="stat-card">
                    <div class="stat-value">\${stats.totalTransactions}</div>
                    <div class="stat-label">Total Transactions</div>
                  </div>
                  <div class="stat-card">
                    <div class="stat-value">\${stats.pendingTransactions}</div>
                    <div class="stat-label">Pending Transactions</div>
                  </div>
                  <div class="stat-card">
                    <div class="stat-value">\${stats.avgBlockTime}ms</div>
                    <div class="stat-label">Avg Block Time</div>
                  </div>
                  <div class="stat-card">
                    <div class="stat-value">\${stats.totalFees.toFixed(2)}</div>
                    <div class="stat-label">Total Fees</div>
                  </div>
                  <div class="stat-card">
                    <div class="stat-value">\${stats.difficulty}</div>
                    <div class="stat-label">Difficulty</div>
                  </div>
                \`;
              }
            } catch (error) {
              console.error('Error loading stats:', error);
            }
          }

          async function loadLatestBlocks() {
            try {
              const response = await fetch('/api/explorer/blocks/latest?limit=10');
              const data = await response.json();
              
              if (data.success) {
                const blocksHTML = data.blocks.map(block => \`
                  <div class="block-item">
                    <div class="item-header">
                      <span class="item-title">Block #\${block.index}</span>
                      <span class="item-time">\${new Date(block.timestamp).toLocaleString()}</span>
                    </div>
                    <div class="item-details">
                      <p><strong>Hash:</strong> <span class="address">\${block.hash}</span></p>
                      <p><strong>Transactions:</strong> \${block.transactionCount}</p>
                      <p><strong>Size:</strong> \${block.size} bytes</p>
                    </div>
                  </div>
                \`).join('');
                
                document.getElementById('blocksList').innerHTML = blocksHTML;
              }
            } catch (error) {
              console.error('Error loading blocks:', error);
            }
          }

          async function loadPendingTransactions() {
            try {
              const response = await fetch('/api/explorer/transactions/pending');
              const data = await response.json();
              
              if (data.success) {
                if (data.pendingTransactions.length === 0) {
                  document.getElementById('pendingList').innerHTML = '<p>No pending transactions</p>';
                } else {
                  const txsHTML = data.pendingTransactions.map(tx => \`
                    <div class="transaction-item">
                      <div class="item-header">
                        <span class="item-title">Transaction</span>
                        <span class="item-time">\${new Date(tx.timestamp).toLocaleString()}</span>
                      </div>
                      <div class="item-details">
                        <p><strong>ID:</strong> <span class="address">\${tx.id}</span></p>
                        <p><strong>From:</strong> <span class="address">\${tx.fromAddress || 'Mining Reward'}</span></p>
                        <p><strong>To:</strong> <span class="address">\${tx.toAddress}</span></p>
                        <p><strong>Amount:</strong> \${tx.amount} KEETA</p>
                      </div>
                    </div>
                  \`).join('');
                  
                  document.getElementById('pendingList').innerHTML = txsHTML;
                }
              }
            } catch (error) {
              console.error('Error loading pending transactions:', error);
            }
          }

          async function loadRichList() {
            try {
              const response = await fetch('/api/explorer/rich-list');
              const data = await response.json();
              
              if (data.success) {
                const richListHTML = data.richList.map(item => \`
                  <div class="transaction-item">
                    <div class="item-header">
                      <span class="item-title">#\${item.rank}</span>
                      <span class="item-time">\${item.balance} KEETA</span>
                    </div>
                    <div class="item-details">
                      <p><strong>Address:</strong> <span class="address">\${item.address}</span></p>
                    </div>
                  </div>
                \`).join('');
                
                document.getElementById('richListContent').innerHTML = richListHTML;
              }
            } catch (error) {
              console.error('Error loading rich list:', error);
            }
          }

          async function performSearch() {
            const query = document.getElementById('searchInput').value;
            if (!query) return;

            try {
              const response = await fetch(\`/api/explorer/search?query=\${encodeURIComponent(query)}\`);
              const data = await response.json();
              
              if (data.success && data.results.length > 0) {
                // For now, just alert the first result
                const result = data.results[0];
                if (result.type === 'block') {
                  alert(\`Found Block #\${result.index}\\nHash: \${result.hash}\\nTransactions: \${result.transactionCount}\`);
                } else if (result.type === 'transaction') {
                  alert(\`Found Transaction\\nID: \${result.id}\\nFrom: \${result.fromAddress}\\nTo: \${result.toAddress}\\nAmount: \${result.amount} KEETA\`);
                }
              } else {
                alert('No results found');
              }
            } catch (error) {
              alert('Search error: ' + error.message);
            }
          }

          function showTab(tabName) {
            // Hide all tabs
            document.querySelectorAll('.tab-content').forEach(content => {
              content.classList.remove('active');
            });
            document.querySelectorAll('.tab').forEach(tab => {
              tab.classList.remove('active');
            });

            // Show selected tab
            document.getElementById(tabName).classList.add('active');
            event.target.classList.add('active');

            // Load data for the selected tab
            if (tabName === 'latestBlocks') {
              loadLatestBlocks();
            } else if (tabName === 'pendingTxs') {
              loadPendingTransactions();
            } else if (tabName === 'richList') {
              loadRichList();
            }
          }

          // Initialize the dashboard
          loadStats();
          loadLatestBlocks();

          // Auto-refresh every 30 seconds
          setInterval(() => {
            loadStats();
            const activeTab = document.querySelector('.tab-content.active').id;
            if (activeTab === 'latestBlocks') loadLatestBlocks();
            else if (activeTab === 'pendingTxs') loadPendingTransactions();
            else if (activeTab === 'richList') loadRichList();
          }, 30000);

          // Handle Enter key in search
          document.getElementById('searchInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
              performSearch();
            }
          });
        </script>
      </body>
      </html>
    `;
  }
}
