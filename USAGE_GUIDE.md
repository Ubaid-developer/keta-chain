# Keeta Chain - Step-by-Step Usage Guide

## 🚀 Quick Start Guide

### Step 1: Installation & Setup

```bash
# Navigate to project directory
cd keeta-chain

# Install dependencies
npm install

# Create data directory for storage
mkdir -p data

# Verify installation
npm list
```

### Step 2: Start the Blockchain

```bash
# Start the development server
npm run dev

# Or start directly with Node.js
node src/index.js
```

**Expected Output:**
```
✅ Configuration loaded for development environment
🔗 Blockchain initialized with 1 blocks
📊 Monitoring started
🔗 Keeta Chain Network running on http://localhost:3001
📊 Dashboard: http://localhost:3001
🔍 Explorer: http://localhost:3001/api/explorer
💼 Wallet: http://localhost:3001/api/wallet
⛏️ Mining: http://localhost:3001/api/mining
📈 Metrics: http://localhost:3001/metrics
🏥 Health: http://localhost:3001/health
🛡️ Security: Production-ready with rate limiting and validation
💾 Database: Persistent storage with backups enabled
📊 Monitoring: Real-time metrics and health checks
```

### Step 3: Access the Web Interface

Open your browser and navigate to: **http://localhost:3001**

You'll see the main dashboard with:
- Network statistics
- Performance metrics
- Token economics
- Cross-chain activity
- Navigation buttons to different features

---

## 💼 Wallet Operations

### Step 4: Create Your First Wallet

1. **Via Web Interface:**
   - Click "💼 Wallet" button
   - Click "Generate New Wallet"
   - Save your private key securely!

2. **Via API:**
```bash
curl -X POST http://localhost:3001/api/wallet/create \
  -H "Content-Type: application/json" \
  -d '{"password": "your-secure-password"}'
```

**Response:**
```json
{
  "success": true,
  "wallet": {
    "address": "K1234567890abcdef...",
    "publicKey": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
  }
}
```

### Step 5: Check Wallet Balance

1. **Via Web Interface:**
   - Enter your wallet address
   - Click "Check Balance"

2. **Via API:**
```bash
curl http://localhost:3001/api/wallet/balance/K1234567890abcdef...
```

### Step 6: Send Transactions

1. **Via Web Interface:**
   - Fill in sender address, recipient address, amount
   - Enter your private key
   - Click "Send Transaction"

2. **Via API:**
```bash
curl -X POST http://localhost:3001/api/wallet/send \
  -H "Content-Type: application/json" \
  -d '{
    "fromAddress": "K1234567890abcdef...",
    "toAddress": "K9876543210fedcba...",
    "amount": 10.5,
    "privateKey": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
  }'
```

### Step 7: View Transaction History

```bash
curl http://localhost:3001/api/wallet/transactions/K1234567890abcdef...
```

---

## 🔍 Block Explorer

### Step 8: Explore the Blockchain

1. **Access Explorer:**
   - Click "🔍 Block Explorer" or visit http://localhost:3001/api/explorer

2. **View Latest Blocks:**
   - See the most recent blocks
   - Check transaction counts
   - View block details

3. **Search:**
   - Search by address
   - Search by transaction ID
   - Search by block hash

### Step 9: Get Blockchain Statistics

```bash
# General blockchain info
curl http://localhost:3001/api/explorer/info

# Latest blocks
curl http://localhost:3001/api/explorer/blocks/latest?limit=5

# Network statistics
curl http://localhost:3001/api/explorer/stats

# Rich list (top addresses)
curl http://localhost:3001/api/explorer/rich-list
```

---

## ⛏️ Mining Operations

### Step 10: Start Mining

1. **Via Web Interface:**
   - Click "⛏️ Mining" or visit http://localhost:3001/api/mining
   - Enter your wallet address
   - Select number of threads
   - Click "Start Mining"

2. **Via API:**
```bash
curl -X POST http://localhost:3001/api/mining/start \
  -H "Content-Type: application/json" \
  -d '{
    "minerAddress": "K1234567890abcdef...",
    "threads": 4
  }'
```

### Step 11: Monitor Mining

```bash
# Get mining info
curl http://localhost:3001/api/mining/info

# Get mining jobs
curl http://localhost:3001/api/mining/jobs

# Get mining pool stats
curl http://localhost:3001/api/mining/pool
```

### Step 12: Stop Mining

```bash
curl -X POST http://localhost:3001/api/mining/stop/job-id-here
```

---

## 📊 Monitoring & Health

### Step 13: Check System Health

```bash
curl http://localhost:3001/health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-22T14:15:30.000Z",
  "uptime": 3600,
  "blockchain": {
    "height": 42,
    "isValid": true,
    "pendingTransactions": 3
  },
  "network": {
    "connectedPeers": 0,
    "hashRate": 0
  },
  "system": {
    "memory": {
      "rss": 50331648,
      "heapUsed": 20971520,
      "heapTotal": 31457280
    },
    "cpu": { "user": 1234567, "system": 987654 }
  }
}
```

### Step 14: View Metrics

```bash
# JSON format
curl http://localhost:3001/metrics

# Prometheus format
curl -H "Accept: text/plain" http://localhost:3001/metrics
```

---

## 🛠️ Advanced Operations

### Step 15: Cross-Chain Transactions

```bash
curl -X POST http://localhost:3001/api/wallet/cross-chain \
  -H "Content-Type: application/json" \
  -d '{
    "fromChain": "ethereum",
    "toChain": "keeta",
    "fromAddress": "K1234567890abcdef...",
    "toAddress": "K9876543210fedcba...",
    "amount": 100,
    "privateKey": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
  }'
```

### Step 16: Configuration Management

The system uses configuration files:

- `config/default.json` - Default settings
- `config/production.json` - Production overrides
- Environment variables override everything

**Key Environment Variables:**
```bash
export PORT=3001
export NODE_ENV=production
export DATABASE_DIR=./data
export BLOCKCHAIN_DIFFICULTY=4
export CORS_ORIGINS=https://yourdomain.com
```

### Step 17: Database Management

**View Database Stats:**
```bash
# Check data directory
ls -la data/

# View blockchain data
cat data/blocks.json | jq '.chain | length'

# View pending transactions
cat data/pending.json | jq '.transactions | length'
```

**Backup & Recovery:**
- Automatic backups created every hour
- Stored in `data/backups/`
- Last 10 backups retained
- Automatic recovery on corruption

---

## 🔧 Troubleshooting

### Common Issues

**1. Port Already in Use**
```bash
# Kill process on port 3001
lsof -ti:3001 | xargs kill -9

# Or use different port
export PORT=3002
node src/index.js
```

**2. Permission Issues**
```bash
# Fix data directory permissions
chmod 755 data
chmod 644 data/*.json
```

**3. Memory Issues**
```bash
# Increase Node.js memory limit
node --max-old-space-size=4096 src/index.js
```

**4. Database Corruption**
```bash
# Restore from latest backup
cp data/backups/blocks-*.json data/blocks.json
```

### Health Checks

**Check if services are running:**
```bash
# Check main service
curl http://localhost:3001/health

# Check API endpoints
curl http://localhost:3001/api/wallet/info/Ktest
curl http://localhost:3001/api/explorer/info
curl http://localhost:3001/api/mining/info
```

**Monitor logs:**
```bash
# Run with verbose logging
DEBUG=* node src/index.js
```

---

## 📈 Production Deployment

### Step 18: Production Setup

1. **Environment Configuration:**
```bash
export NODE_ENV=production
export PORT=3001
export DATABASE_DIR=/var/lib/keeta-chain
export CORS_ORIGINS=https://yourdomain.com
```

2. **Process Management (PM2):**
```bash
# Install PM2
npm install -g pm2

# Start with PM2
pm2 start src/index.js --name keeta-chain

# Monitor
pm2 monit

# Logs
pm2 logs keeta-chain
```

3. **Systemd Service:**
```bash
# Create service file
sudo nano /etc/systemd/system/keeta-chain.service
```

```ini
[Unit]
Description=Keeta Chain Blockchain
After=network.target

[Service]
Type=simple
User=keeta
WorkingDirectory=/opt/keeta-chain
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3001

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start
sudo systemctl enable keeta-chain
sudo systemctl start keeta-chain
sudo systemctl status keeta-chain
```

### Step 19: Security Hardening

1. **Firewall Configuration:**
```bash
# Allow only necessary ports
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP
sudo ufw allow 443   # HTTPS
sudo ufw allow 3001  # Keeta Chain
sudo ufw enable
```

2. **SSL/TLS Setup:**
```bash
# Use nginx as reverse proxy
sudo apt install nginx

# Configure nginx for SSL
sudo nano /etc/nginx/sites-available/keeta-chain
```

3. **Database Security:**
```bash
# Secure data directory
sudo chown keeta:keeta /var/lib/keeta-chain
sudo chmod 700 /var/lib/keeta-chain
```

---

## 🎯 Best Practices

### Development
- Use environment variables for sensitive data
- Test in development before production
- Monitor logs regularly
- Keep dependencies updated

### Production
- Use process managers (PM2/systemd)
- Set up monitoring and alerting
- Regular backups
- SSL/TLS encryption
- Firewall protection
- Regular security updates

### Security
- Never expose private keys in logs
- Use strong passwords
- Implement rate limiting
- Monitor for suspicious activity
- Keep software updated

---

## 📞 Support

### Getting Help
1. Check this guide first
2. Review the main README.md
3. Check application logs
4. Test API endpoints individually
5. Verify configuration

### Debug Commands
```bash
# Check configuration
node -e "const config = require('./src/config/config.js'); config.load().then(console.log)"

# Test database
node -e "const db = require('./src/config/database.js'); db.initialize().then(console.log)"

# Test crypto
node -e "const crypto = require('./src/core/crypto.js'); console.log(crypto.CryptoUtils.generateAddress('test'))"
```

---

**🎉 Congratulations! You now have a fully functional production-grade blockchain running!**

The Keeta Chain implementation includes:
- ✅ Secure cryptographic operations
- ✅ Persistent data storage
- ✅ Real-time monitoring
- ✅ Production security
- ✅ Comprehensive APIs
- ✅ Web interface
- ✅ Mining capabilities
- ✅ Cross-chain support

Ready for production deployment! 🚀
