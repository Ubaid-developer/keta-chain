import { Router } from 'express';
import { CryptoUtils, SecureWallet } from '../core/crypto.js';
import { InputValidator, asyncHandler } from '../middleware/security.js';

export class WalletAPI {
  constructor(blockchain) {
    this.blockchain = blockchain;
    this.router = Router();
    this.wallets = new Map();
    this.setupRoutes();
  }

  setupRoutes() {
    // Create new wallet
    this.router.post('/create', asyncHandler(async (req, res) => {
      const wallet = new SecureWallet(req.body.password || 'default-password');
      const newWallet = wallet.generateWallet();
      
      res.json({
        success: true,
        wallet: {
          address: newWallet.address,
          publicKey: newWallet.publicKey
          // Note: Never return encrypted private key in production
        }
      });
    }));

    // Get wallet balance
    this.router.get('/balance/:address', asyncHandler(async (req, res) => {
      const { address } = req.params;
      
      // Validate address
      const addressValidation = InputValidator.validateAddress(address);
      if (!addressValidation.valid) {
        return res.status(400).json({ 
          success: false, 
          error: addressValidation.error 
        });
      }
      
      const balance = this.blockchain.getBalance(address);
      res.json({
        success: true,
        address,
        balance
      });
    }));

    // Get wallet transactions
    this.router.get('/transactions/:address', (req, res) => {
      try {
        const { address } = req.params;
        const transactions = this.blockchain.getAllTransactionsForWallet(address);
        res.json({
          success: true,
          address,
          transactions
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Send transaction
    this.router.post('/send', asyncHandler(async (req, res) => {
      const { fromAddress, toAddress, amount, privateKey, data } = req.body;
      
      // Validate inputs
      const fromValidation = InputValidator.validateAddress(fromAddress);
      if (!fromValidation.valid) {
        return res.status(400).json({ 
          success: false, 
          error: fromValidation.error 
        });
      }
      
      const toValidation = InputValidator.validateAddress(toAddress);
      if (!toValidation.valid) {
        return res.status(400).json({ 
          success: false, 
          error: toValidation.error 
        });
      }
      
      const amountValidation = InputValidator.validateAmount(amount);
      if (!amountValidation.valid) {
        return res.status(400).json({ 
          success: false, 
          error: amountValidation.error 
        });
      }
      
      const keyValidation = InputValidator.validatePrivateKey(privateKey);
      if (!keyValidation.valid) {
        return res.status(400).json({ 
          success: false, 
          error: keyValidation.error 
        });
      }
      
      const dataValidation = InputValidator.validateTransactionData(data || {});
      if (!dataValidation.valid) {
        return res.status(400).json({ 
          success: false, 
          error: dataValidation.error 
        });
      }

      const transaction = await this.createAndSignTransaction(
        fromAddress, 
        toAddress, 
        amount, 
        privateKey, 
        data
      );

      this.blockchain.addTransaction(transaction);

      res.json({
        success: true,
        transaction: {
          id: transaction.id,
          fromAddress: transaction.fromAddress,
          toAddress: transaction.toAddress,
          amount: transaction.amount,
          timestamp: transaction.timestamp
        }
      });
    }));

    // Get wallet info
    this.router.get('/info/:address', (req, res) => {
      try {
        const { address } = req.params;
        const balance = this.blockchain.getBalance(address);
        const transactions = this.blockchain.getAllTransactionsForWallet(address);
        
        res.json({
          success: true,
          address,
          balance,
          transactionCount: transactions.length,
          transactions: transactions.slice(-10) // Last 10 transactions
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Create cross-chain transaction
    this.router.post('/cross-chain', async (req, res) => {
      try {
        const { 
          fromChain, 
          toChain, 
          fromAddress, 
          toAddress, 
          amount, 
          privateKey,
          data 
        } = req.body;

        if (!fromChain || !toChain || !fromAddress || !toAddress || !amount || !privateKey) {
          return res.status(400).json({
            success: false,
            error: 'Missing required fields for cross-chain transaction'
          });
        }

        const transaction = await this.createCrossChainTransaction(
          fromChain,
          toChain,
          fromAddress,
          toAddress,
          amount,
          privateKey,
          data
        );

        this.blockchain.addTransaction(transaction);

        res.json({
          success: true,
          transaction: {
            id: transaction.id,
            fromChain,
            toChain,
            fromAddress: transaction.fromAddress,
            toAddress: transaction.toAddress,
            amount: transaction.amount,
            bridgeFee: transaction.data.bridgeFee,
            timestamp: transaction.timestamp
          }
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Validate wallet
    this.router.post('/validate', (req, res) => {
      try {
        const { address } = req.body;
        
        if (!address) {
          return res.status(400).json({
            success: false,
            error: 'Address is required'
          });
        }

        const isValid = this.validateAddress(address);
        const balance = this.blockchain.getBalance(address);

        res.json({
          success: true,
          address,
          isValid,
          balance
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Wallet dashboard HTML
    this.router.get('/', (req, res) => {
      res.send(this.getWalletDashboardHTML());
    });
  }

  createWallet() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });

    const address = crypto.createHash('sha256')
      .update(publicKey)
      .digest('hex')
      .substring(0, 40);

    const wallet = {
      address: 'K' + address, // Prefix with K for Keeta
      publicKey,
      privateKey,
      created: Date.now()
    };

    this.wallets.set(wallet.address, wallet);
    return wallet;
  }

  async createAndSignTransaction(fromAddress, toAddress, amount, privateKey, data = {}) {
    const { Transaction } = await import('../core/blockchain.js');
    const transaction = new Transaction(fromAddress, toAddress, amount, data);
    
    const signingKey = crypto.createPrivateKey(privateKey);
    transaction.signTransaction(signingKey);
    
    return transaction;
  }

  async createCrossChainTransaction(fromChain, toChain, fromAddress, toAddress, amount, privateKey, data = {}) {
    const crossChainData = {
      fromChain,
      toChain,
      bridgeFee: amount * 0.001, // 0.1% bridge fee
      ...data
    };

    return await this.createAndSignTransaction(
      fromAddress,
      toAddress,
      amount,
      privateKey,
      crossChainData
    );
  }

  validateAddress(address) {
    // Basic validation for Keeta addresses
    return typeof address === 'string' && 
           address.startsWith('K') && 
           address.length === 41;
  }

  getRouter() {
    return this.router;
  }

  getWalletDashboardHTML() {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Keeta Wallet</title>
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
          .wallet-section {
            margin-bottom: 30px;
            padding: 25px;
            background: #f7fafc;
            border-radius: 15px;
            border-left: 4px solid #667eea;
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
          input, select, textarea {
            width: 100%;
            padding: 12px;
            border: 2px solid #e2e8f0;
            border-radius: 8px;
            font-size: 16px;
            transition: border-color 0.3s;
          }
          input:focus, select:focus, textarea:focus {
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
          .btn-secondary {
            background: #48bb78;
          }
          .btn-secondary:hover {
            background: #38a169;
          }
          .balance-display {
            font-size: 2em;
            font-weight: bold;
            color: #667eea;
            text-align: center;
            margin: 20px 0;
          }
          .address {
            background: #edf2f7;
            padding: 10px;
            border-radius: 8px;
            font-family: monospace;
            word-break: break-all;
            margin: 10px 0;
          }
          .transaction-list {
            max-height: 400px;
            overflow-y: auto;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 15px;
          }
          .transaction-item {
            padding: 15px;
            border-bottom: 1px solid #e2e8f0;
            margin-bottom: 10px;
          }
          .transaction-item:last-child {
            border-bottom: none;
          }
          .grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
          }
          @media (max-width: 768px) {
            .grid {
              grid-template-columns: 1fr;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🔗 Keeta Wallet</h1>
          
          <div class="wallet-section">
            <h2>Create New Wallet</h2>
            <button class="btn" onclick="createWallet()">Generate New Wallet</button>
            <div id="newWalletInfo"></div>
          </div>

          <div class="grid">
            <div class="wallet-section">
              <h2>Wallet Balance</h2>
              <div class="form-group">
                <label>Wallet Address:</label>
                <input type="text" id="balanceAddress" placeholder="K...">
                <button class="btn btn-secondary" onclick="checkBalance()">Check Balance</button>
              </div>
              <div id="balanceDisplay"></div>
            </div>

            <div class="wallet-section">
              <h2>Send Transaction</h2>
              <div class="form-group">
                <label>From Address:</label>
                <input type="text" id="fromAddress" placeholder="K...">
              </div>
              <div class="form-group">
                <label>To Address:</label>
                <input type="text" id="toAddress" placeholder="K...">
              </div>
              <div class="form-group">
                <label>Amount:</label>
                <input type="number" id="amount" placeholder="0.00">
              </div>
              <div class="form-group">
                <label>Private Key:</label>
                <textarea id="privateKey" placeholder="-----BEGIN PRIVATE KEY-----..."></textarea>
              </div>
              <button class="btn" onclick="sendTransaction()">Send Transaction</button>
              <div id="transactionResult"></div>
            </div>
          </div>

          <div class="wallet-section">
            <h2>Transaction History</h2>
            <div class="form-group">
              <label>Wallet Address:</label>
              <input type="text" id="historyAddress" placeholder="K...">
              <button class="btn btn-secondary" onclick="getTransactionHistory()">Get History</button>
            </div>
            <div id="transactionHistory"></div>
          </div>
        </div>

        <script>
          async function createWallet() {
            try {
              const response = await fetch('/api/wallet/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
              });
              const data = await response.json();
              
              if (data.success) {
                document.getElementById('newWalletInfo').innerHTML = \`
                  <div style="margin-top: 20px;">
                    <h3>New Wallet Created!</h3>
                    <p><strong>Address:</strong></p>
                    <div class="address">\${data.wallet.address}</div>
                    <p><strong>Public Key:</strong></p>
                    <div class="address">\${data.wallet.publicKey}</div>
                    <p><strong>Private Key:</strong> (Save this securely!)</p>
                    <div class="address">\${data.wallet.privateKey}</div>
                  </div>
                \`;
              }
            } catch (error) {
              alert('Error creating wallet: ' + error.message);
            }
          }

          async function checkBalance() {
            const address = document.getElementById('balanceAddress').value;
            if (!address) {
              alert('Please enter a wallet address');
              return;
            }

            try {
              const response = await fetch(\`/api/wallet/balance/\${address}\`);
              const data = await response.json();
              
              if (data.success) {
                document.getElementById('balanceDisplay').innerHTML = \`
                  <div class="balance-display">\${data.balance} KEETA</div>
                  <p>Address: \${data.address}</p>
                \`;
              }
            } catch (error) {
              alert('Error checking balance: ' + error.message);
            }
          }

          async function sendTransaction() {
            const fromAddress = document.getElementById('fromAddress').value;
            const toAddress = document.getElementById('toAddress').value;
            const amount = parseFloat(document.getElementById('amount').value);
            const privateKey = document.getElementById('privateKey').value;

            if (!fromAddress || !toAddress || !amount || !privateKey) {
              alert('Please fill all fields');
              return;
            }

            try {
              const response = await fetch('/api/wallet/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  fromAddress,
                  toAddress,
                  amount,
                  privateKey
                })
              });
              const data = await response.json();
              
              if (data.success) {
                document.getElementById('transactionResult').innerHTML = \`
                  <div style="margin-top: 20px; color: #48bb78;">
                    <h3>✅ Transaction Sent!</h3>
                    <p><strong>Transaction ID:</strong> \${data.transaction.id}</p>
                    <p><strong>From:</strong> \${data.transaction.fromAddress}</p>
                    <p><strong>To:</strong> \${data.transaction.toAddress}</p>
                    <p><strong>Amount:</strong> \${data.transaction.amount} KEETA</p>
                  </div>
                \`;
              } else {
                document.getElementById('transactionResult').innerHTML = \`
                  <div style="margin-top: 20px; color: #e53e3e;">
                    <h3>❌ Transaction Failed</h3>
                    <p>\${data.error}</p>
                  </div>
                \`;
              }
            } catch (error) {
              alert('Error sending transaction: ' + error.message);
            }
          }

          async function getTransactionHistory() {
            const address = document.getElementById('historyAddress').value;
            if (!address) {
              alert('Please enter a wallet address');
              return;
            }

            try {
              const response = await fetch(\`/api/wallet/transactions/\${address}\`);
              const data = await response.json();
              
              if (data.success) {
                let html = '<div class="transaction-list">';
                if (data.transactions.length === 0) {
                  html += '<p>No transactions found</p>';
                } else {
                  data.transactions.forEach(tx => {
                    const type = tx.fromAddress === address ? 'SENT' : 'RECEIVED';
                    const color = type === 'SENT' ? '#e53e3e' : '#48bb78';
                    html += \`
                      <div class="transaction-item">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                          <span style="color: \${color}; font-weight: bold;">\${type}</span>
                          <span>\${new Date(tx.timestamp).toLocaleString()}</span>
                        </div>
                        <p><strong>Amount:</strong> \${tx.amount} KEETA</p>
                        <p><strong>From:</strong> \${tx.fromAddress || 'Mining Reward'}</p>
                        <p><strong>To:</strong> \${tx.toAddress}</p>
                        <p><strong>ID:</strong> \${tx.id}</p>
                      </div>
                    \`;
                  });
                }
                html += '</div>';
                document.getElementById('transactionHistory').innerHTML = html;
              }
            } catch (error) {
              alert('Error getting transaction history: ' + error.message);
            }
          }
        </script>
      </body>
      </html>
    `;
  }
}
