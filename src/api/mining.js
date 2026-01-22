import { Router } from 'express';
import crypto from 'crypto';

export class MiningAPI {
  constructor(blockchain, node) {
    this.blockchain = blockchain;
    this.node = node;
    this.router = Router();
    this.miningJobs = new Map();
    this.miners = new Map();
    this.setupRoutes();
  }

  setupRoutes() {
    // Get mining info
    this.router.get('/info', (req, res) => {
      try {
        const latestBlock = this.blockchain.getLatestBlock();
        const pendingCount = this.blockchain.pendingTransactions.length;
        
        res.json({
          success: true,
          mining: {
            difficulty: this.blockchain.difficulty,
            blockReward: this.blockchain.miningReward,
            pendingTransactions: pendingCount,
            latestBlock: {
              index: latestBlock.index,
              hash: latestBlock.hash,
              timestamp: latestBlock.timestamp
            },
            maxTransactionsPerBlock: this.blockchain.maxTransactionsPerBlock,
            networkHashRate: this.node.getHashRate()
          }
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Start mining
    this.router.post('/start', (req, res) => {
      try {
        const { minerAddress, threads = 1 } = req.body;
        
        if (!minerAddress) {
          return res.status(400).json({
            success: false,
            error: 'Miner address is required'
          });
        }

        const jobId = crypto.randomUUID();
        const job = {
          id: jobId,
          minerAddress,
          threads,
          startTime: Date.now(),
          status: 'running',
          blocksMined: 0,
          hashRate: 0
        };

        this.miningJobs.set(jobId, job);
        
        // Start mining in background
        this.startMining(job);

        res.json({
          success: true,
          job: {
            id: jobId,
            minerAddress,
            status: 'started',
            threads
          }
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Stop mining
    this.router.post('/stop/:jobId', (req, res) => {
      try {
        const { jobId } = req.params;
        const job = this.miningJobs.get(jobId);

        if (!job) {
          return res.status(404).json({
            success: false,
            error: 'Mining job not found'
          });
        }

        job.status = 'stopped';
        job.endTime = Date.now();
        job.duration = job.endTime - job.startTime;

        res.json({
          success: true,
          job: {
            id: jobId,
            status: 'stopped',
            blocksMined: job.blocksMined,
            duration: job.duration,
            avgHashRate: job.hashRate
          }
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get mining job status
    this.router.get('/status/:jobId', (req, res) => {
      try {
        const { jobId } = req.params;
        const job = this.miningJobs.get(jobId);

        if (!job) {
          return res.status(404).json({
            success: false,
            error: 'Mining job not found'
          });
        }

        res.json({
          success: true,
          job: {
            id: job.id,
            minerAddress: job.minerAddress,
            status: job.status,
            startTime: job.startTime,
            endTime: job.endTime,
            duration: job.endTime ? job.endTime - job.startTime : Date.now() - job.startTime,
            blocksMined: job.blocksMined,
            hashRate: job.hashRate,
            threads: job.threads
          }
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get all mining jobs
    this.router.get('/jobs', (req, res) => {
      try {
        const jobs = Array.from(this.miningJobs.values()).map(job => ({
          id: job.id,
          minerAddress: job.minerAddress,
          status: job.status,
          startTime: job.startTime,
          endTime: job.endTime,
          duration: job.endTime ? job.endTime - job.startTime : Date.now() - job.startTime,
          blocksMined: job.blocksMined,
          hashRate: job.hashRate,
          threads: job.threads
        }));

        res.json({
          success: true,
          jobs
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get mining pool info
    this.router.get('/pool', (req, res) => {
      try {
        const totalMiners = this.miningJobs.size;
        const activeMiners = Array.from(this.miningJobs.values())
          .filter(job => job.status === 'running').length;
        
        const totalHashRate = Array.from(this.miningJobs.values())
          .reduce((sum, job) => sum + job.hashRate, 0);

        const totalBlocksMined = Array.from(this.miningJobs.values())
          .reduce((sum, job) => sum + job.blocksMined, 0);

        res.json({
          success: true,
          pool: {
            totalMiners,
            activeMiners,
            totalHashRate,
            totalBlocksMined,
            difficulty: this.blockchain.difficulty,
            blockReward: this.blockchain.miningReward
          }
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Submit mined block (for external miners)
    this.router.post('/submit', (req, res) => {
      try {
        const { minerAddress, nonce, blockData } = req.body;
        
        if (!minerAddress || !nonce || !blockData) {
          return res.status(400).json({
            success: false,
            error: 'Missing required fields: minerAddress, nonce, blockData'
          });
        }

        // Create block with submitted nonce
        const { Block } = require('../core/blockchain.js');
        const block = new Block(
          blockData.index,
          blockData.transactions,
          blockData.previousHash,
          blockData.timestamp
        );
        block.nonce = nonce;
        block.hash = block.calculateHash();

        // Validate the block
        const target = Array(this.blockchain.difficulty + 1).join('0');
        if (block.hash.substring(0, this.blockchain.difficulty) !== target) {
          return res.status(400).json({
            success: false,
            error: 'Invalid block hash - does not meet difficulty requirement'
          });
        }

        // Add block to blockchain
        this.blockchain.chain.push(block);
        
        // Remove mined transactions from pending
        const minedTxIds = block.transactions.map(tx => tx.id);
        this.blockchain.pendingTransactions = this.blockchain.pendingTransactions.filter(
          tx => !minedTxIds.includes(tx.id)
        );

        // Broadcast to network
        this.node.broadcastBlock(block);

        res.json({
          success: true,
          block: {
            index: block.index,
            hash: block.hash,
            nonce: block.nonce,
            transactions: block.transactions.length,
            reward: this.blockchain.miningReward
          }
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get mining dashboard HTML
    this.router.get('/', (req, res) => {
      res.send(this.getMiningDashboardHTML());
    });
  }

  async startMining(job) {
    const { Block, Transaction } = await import('../core/blockchain.js');
    
    const mineBlock = () => {
      if (job.status !== 'running') return;

      try {
        // Get transactions to mine
        const transactionsToMine = this.blockchain.pendingTransactions.slice(
          0, 
          this.blockchain.maxTransactionsPerBlock
        );

        // Add reward transaction
        const rewardTx = new Transaction(null, job.minerAddress, this.blockchain.miningReward);
        transactionsToMine.push(rewardTx);

        // Create new block
        const block = new Block(
          this.blockchain.chain.length,
          transactionsToMine,
          this.blockchain.getLatestBlock().hash
        );

        // Mine the block
        const startTime = Date.now();
        block.mineBlock(this.blockchain.difficulty);
        const endTime = Date.now();

        // Update job stats
        job.blocksMined++;
        job.hashRate = 1000 / ((endTime - startTime) / block.nonce); // Simplified hash rate

        // Add block to blockchain
        this.blockchain.chain.push(block);

        // Remove mined transactions from pending
        this.blockchain.pendingTransactions = this.blockchain.pendingTransactions.slice(
          this.blockchain.maxTransactionsPerBlock
        );

        // Broadcast to network
        this.node.broadcastBlock(block);

        console.log(`✅ Job ${job.id} mined block #${block.index} with ${block.nonce} attempts`);

        // Continue mining if job is still running
        if (job.status === 'running') {
          setTimeout(mineBlock, 100); // Small delay to prevent blocking
        }
      } catch (error) {
        console.error(`❌ Mining error in job ${job.id}:`, error);
        job.status = 'error';
      }
    };

    // Start mining process
    mineBlock();
  }

  getRouter() {
    return this.router;
  }

  getMiningDashboardHTML() {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Keeta Chain Mining</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
          h1 {
            color: #4a5568;
            margin-bottom: 30px;
            text-align: center;
            font-size: 2.5em;
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
          .form-group {
            margin-bottom: 20px;
          }
          label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: #4a5568;
          }
          input, select {
            width: 100%;
            padding: 12px;
            border: 2px solid #e2e8f0;
            border-radius: 8px;
            font-size: 16px;
            transition: border-color 0.3s;
          }
          input:focus, select:focus {
            outline: none;
            border-color: #667eea;
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
            margin-right: 10px;
          }
          .btn:hover {
            background: #5a67d8;
            transform: translateY(-2px);
          }
          .btn-danger {
            background: #e53e3e;
          }
          .btn-danger:hover {
            background: #c53030;
          }
          .btn-success {
            background: #48bb78;
          }
          .btn-success:hover {
            background: #38a169;
          }
          .job-list {
            display: grid;
            gap: 15px;
          }
          .job-item {
            background: #f7fafc;
            padding: 20px;
            border-radius: 10px;
            border-left: 4px solid #48bb78;
          }
          .job-item.stopped {
            border-left-color: #e53e3e;
          }
          .job-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
          }
          .job-title {
            font-weight: bold;
            color: #2d3748;
          }
          .job-status {
            padding: 5px 15px;
            border-radius: 20px;
            font-size: 0.85em;
            font-weight: 600;
          }
          .job-status.running {
            background: #48bb78;
            color: white;
          }
          .job-status.stopped {
            background: #e53e3e;
            color: white;
          }
          .job-details {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            color: #4a5568;
          }
          .detail-item {
            text-align: center;
          }
          .detail-value {
            font-weight: bold;
            color: #2d3748;
            font-size: 1.1em;
          }
          .detail-label {
            font-size: 0.9em;
            color: #718096;
          }
          .mining-animation {
            display: none;
            text-align: center;
            margin: 20px 0;
          }
          .mining-animation.active {
            display: block;
          }
          .spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #667eea;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 10px;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>⛏️ Keeta Chain Mining</h1>
          
          <div class="stats-grid" id="statsGrid">
            <!-- Mining stats will be loaded here -->
          </div>

          <div class="section">
            <h2>Start Mining</h2>
            <div class="form-group">
              <label>Miner Address:</label>
              <input type="text" id="minerAddress" placeholder="K...">
            </div>
            <div class="form-group">
              <label>Mining Threads:</label>
              <select id="threads">
                <option value="1">1 Thread</option>
                <option value="2">2 Threads</option>
                <option value="4">4 Threads</option>
                <option value="8">8 Threads</option>
              </select>
            </div>
            <button class="btn btn-success" onclick="startMining()">Start Mining</button>
            <button class="btn btn-danger" onclick="stopAllMining()">Stop All Mining</button>
            
            <div class="mining-animation" id="miningAnimation">
              <div class="spinner"></div>
              <p>Mining in progress...</p>
            </div>
          </div>

          <div class="section">
            <h2>Mining Jobs</h2>
            <div class="job-list" id="jobList">
              <!-- Mining jobs will be loaded here -->
            </div>
          </div>
        </div>

        <script>
          let currentJobs = [];

          async function loadMiningInfo() {
            try {
              const response = await fetch('/api/mining/info');
              const data = await response.json();
              
              if (data.success) {
                const mining = data.mining;
                document.getElementById('statsGrid').innerHTML = \`
                  <div class="stat-card">
                    <div class="stat-value">\${mining.difficulty}</div>
                    <div class="stat-label">Difficulty</div>
                  </div>
                  <div class="stat-card">
                    <div class="stat-value">\${mining.blockReward}</div>
                    <div class="stat-label">Block Reward</div>
                  </div>
                  <div class="stat-card">
                    <div class="stat-value">\${mining.pendingTransactions}</div>
                    <div class="stat-label">Pending Transactions</div>
                  </div>
                  <div class="stat-card">
                    <div class="stat-value">#\${mining.latestBlock.index}</div>
                    <div class="stat-label">Latest Block</div>
                  </div>
                  <div class="stat-card">
                    <div class="stat-value">\${mining.networkHashRate || 0}</div>
                    <div class="stat-label">Network Hash Rate</div>
                  </div>
                  <div class="stat-card">
                    <div class="stat-value">\${mining.maxTransactionsPerBlock}</div>
                    <div class="stat-label">Max TX per Block</div>
                  </div>
                \`;
              }
            } catch (error) {
              console.error('Error loading mining info:', error);
            }
          }

          async function loadMiningJobs() {
            try {
              const response = await fetch('/api/mining/jobs');
              const data = await response.json();
              
              if (data.success) {
                currentJobs = data.jobs;
                updateJobList();
              }
            } catch (error) {
              console.error('Error loading mining jobs:', error);
            }
          }

          function updateJobList() {
            if (currentJobs.length === 0) {
              document.getElementById('jobList').innerHTML = '<p>No mining jobs active</p>';
              return;
            }

            const jobsHTML = currentJobs.map(job => {
              const duration = job.duration ? Math.round(job.duration / 1000) : 0;
              const statusClass = job.status === 'running' ? 'running' : 'stopped';
              
              return \`
                <div class="job-item \${statusClass}">
                  <div class="job-header">
                    <span class="job-title">Job \${job.id.substring(0, 8)}</span>
                    <span class="job-status \${statusClass}">\${job.status.toUpperCase()}</span>
                  </div>
                  <div class="job-details">
                    <div class="detail-item">
                      <div class="detail-value">\${job.blocksMined}</div>
                      <div class="detail-label">Blocks Mined</div>
                    </div>
                    <div class="detail-item">
                      <div class="detail-value">\${duration}s</div>
                      <div class="detail-label">Duration</div>
                    </div>
                    <div class="detail-item">
                      <div class="detail-value">\${job.hashRate || 0}</div>
                      <div class="detail-label">Hash Rate</div>
                    </div>
                    <div class="detail-item">
                      <div class="detail-value">\${job.threads}</div>
                      <div class="detail-label">Threads</div>
                    </div>
                  </div>
                  \${job.status === 'running' ? \`
                    <button class="btn btn-danger" onclick="stopMining('\${job.id}')" style="margin-top: 15px;">Stop Job</button>
                  \` : ''}
                </div>
              \`;
            }).join('');

            document.getElementById('jobList').innerHTML = jobsHTML;

            // Update mining animation
            const hasRunningJobs = currentJobs.some(job => job.status === 'running');
            document.getElementById('miningAnimation').classList.toggle('active', hasRunningJobs);
          }

          async function startMining() {
            const minerAddress = document.getElementById('minerAddress').value;
            const threads = parseInt(document.getElementById('threads').value);

            if (!minerAddress) {
              alert('Please enter a miner address');
              return;
            }

            try {
              const response = await fetch('/api/mining/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ minerAddress, threads })
              });
              const data = await response.json();

              if (data.success) {
                alert('Mining started successfully!');
                loadMiningJobs();
              } else {
                alert('Failed to start mining: ' + data.error);
              }
            } catch (error) {
              alert('Error starting mining: ' + error.message);
            }
          }

          async function stopMining(jobId) {
            try {
              const response = await fetch(\`/api/mining/stop/\${jobId}\`, {
                method: 'POST'
              });
              const data = await response.json();

              if (data.success) {
                alert('Mining job stopped');
                loadMiningJobs();
              } else {
                alert('Failed to stop mining: ' + data.error);
              }
            } catch (error) {
              alert('Error stopping mining: ' + error.message);
            }
          }

          async function stopAllMining() {
            const runningJobs = currentJobs.filter(job => job.status === 'running');
            
            for (const job of runningJobs) {
              await stopMining(job.id);
            }
          }

          // Initialize the dashboard
          loadMiningInfo();
          loadMiningJobs();

          // Auto-refresh every 5 seconds
          setInterval(() => {
            loadMiningInfo();
            loadMiningJobs();
          }, 5000);
        </script>
      </body>
      </html>
    `;
  }
}
