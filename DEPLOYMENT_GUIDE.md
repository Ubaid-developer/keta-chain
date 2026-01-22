# 🚀 Production Deployment Guide

## ✅ Database Bug Fixed
The database initialization issue has been resolved. The blockchain now properly handles empty/invalid data files and starts fresh when needed.

## 🔧 Port Conflict Resolution
```bash
# Kill any process using port 3001
lsof -ti:3001 | xargs kill -9

# Or use a different port
export PORT=3002
node src/production-app.js
```

## 📋 Production Deployment Steps

### Step 1: Environment Setup

```bash
# Clone and navigate to project
cd keeta-chain

# Install production dependencies
npm ci --production

# Create required directories
mkdir -p data logs backups

# Set production environment
export NODE_ENV=production
export PORT=3001
```

### Step 2: Configuration

Create environment file:
```bash
# .env
NODE_ENV=production
PORT=3001
DATABASE_DIR=/var/lib/keeta-chain
LOG_LEVEL=info
CORS_ORIGINS=https://yourdomain.com
```

### Step 3: Start Production App

```bash
# Method 1: Direct start
node src/production-app.js

# Method 2: Using npm script
npm run prod

# Method 3: With PM2 (recommended)
npm install -g pm2
pm2 start src/production-app.js --name keeta-chain
```

### Step 4: Verify Deployment

```bash
# Check health
curl http://localhost:3001/health

# Check metrics
curl http://localhost:3001/metrics

# Test Keeta integration
curl -X POST http://localhost:3001/keeta/demo-transaction
```

## 🌐 Live Testing Endpoints

### Main Application
- **Dashboard**: http://localhost:3001
- **Health Check**: http://localhost:3001/health
- **Metrics**: http://localhost:3001/metrics

### Blockchain Features
- **Wallet**: http://localhost:3001/api/wallet
- **Explorer**: http://localhost:3001/api/explorer
- **Mining**: http://localhost:3001/api/mining

### Keeta Network Integration
- **Status**: http://localhost:3001/keeta/status
- **Demo Transaction**: http://localhost:3001/keeta/demo-transaction
- **Create Account**: http://localhost:3001/keeta/create-account

## 🧪 Live Testing Script

```bash
#!/bin/bash
# test-deployment.sh

echo "🧪 Testing Keeta Chain Production Deployment..."

# Test 1: Health Check
echo "1. Testing health endpoint..."
curl -s http://localhost:3001/health | jq '.status'

# Test 2: Create Wallet
echo "2. Creating wallet..."
WALLET_RESPONSE=$(curl -s -X POST http://localhost:3001/api/wallet/create \
  -H "Content-Type: application/json" \
  -d '{"password": "test-password"}')
echo $WALLET_RESPONSE | jq '.wallet.address'

# Test 3: Keeta Demo Transaction
echo "3. Testing Keeta integration..."
curl -s -X POST http://localhost:3001/keeta/demo-transaction | jq '.success'

# Test 4: Create Keeta Account
echo "4. Creating Keeta account..."
KEETA_RESPONSE=$(curl -s -X POST http://localhost:3001/keeta/create-account \
  -H "Content-Type: application/json" \
  -d '{}')
echo $KEETA_RESPONSE | jq '.account.publicKeyString'

# Test 5: Mining
echo "5. Starting mining..."
WALLET_ADDRESS=$(echo $WALLET_RESPONSE | jq -r '.wallet.address')
curl -s -X POST http://localhost:3001/api/mining/start \
  -H "Content-Type: application/json" \
  -d "{\"minerAddress\": \"$WALLET_ADDRESS\", \"threads\": 2}" | jq '.success'

echo "✅ All tests completed!"
```

## 🐳 Docker Deployment

### Dockerfile
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/
COPY config/ ./config/

# Create data directory
RUN mkdir -p data logs backups

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start application
CMD ["node", "src/production-app.js"]
```

### Docker Compose
```yaml
version: '3.8'
services:
  keeta-chain:
    build: .
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - PORT=3001
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
      - ./backups:/app/backups
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### Deploy with Docker
```bash
# Build and run
docker build -t keeta-chain:production .
docker run -d -p 3001:3001 --name keeta-chain keeta-chain:production

# Or with compose
docker-compose up -d
```

## 🚀 Systemd Service

### Service File
```ini
# /etc/systemd/system/keeta-chain.service
[Unit]
Description=Keeta Chain Production Blockchain
After=network.target

[Service]
Type=simple
User=keeta
Group=keeta
WorkingDirectory=/opt/keeta-chain
ExecStart=/usr/bin/node src/production-app.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3001
Environment=DATABASE_DIR=/var/lib/keeta-chain

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=keeta-chain

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/keeta-chain /var/log/keeta-chain

[Install]
WantedBy=multi-user.target
```

### Enable Service
```bash
# Create user
sudo useradd -r -s /bin/false keeta

# Setup directories
sudo mkdir -p /opt/keeta-chain /var/lib/keeta-chain /var/log/keeta-chain
sudo chown keeta:keeta /opt/keeta-chain /var/lib/keeta-chain /var/log/keeta-chain

# Copy files
sudo cp -r . /opt/keeta-chain/
sudo chown -R keeta:keeta /opt/keeta-chain

# Enable and start
sudo systemctl enable keeta-chain
sudo systemctl start keeta-chain
sudo systemctl status keeta-chain
```

## 📊 Monitoring Setup

### Prometheus Configuration
```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'keeta-chain'
    static_configs:
      - targets: ['localhost:3001']
    metrics_path: '/metrics'
    scrape_interval: 30s
```

### Grafana Dashboard
- Import dashboard for Keeta Chain metrics
- Monitor: TPS, block height, memory usage, network health
- Set up alerts for: high memory, low peer count, invalid blocks

## 🔒 Security Hardening

### Firewall Setup
```bash
# UFW configuration
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 3001/tcp  # Keeta Chain
sudo ufw enable
```

### SSL/TLS with Nginx
```nginx
# /etc/nginx/sites-available/keeta-chain
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 🚨 Alerting Setup

### Health Check Script
```bash
#!/bin/bash
# health-check.sh

HEALTH=$(curl -s http://localhost:3001/health | jq -r '.status')
if [ "$HEALTH" != "healthy" ]; then
    echo "🚨 Keeta Chain health check failed!"
    # Send alert (email, Slack, etc.)
    exit 1
fi

echo "✅ Keeta Chain is healthy"
```

### Cron Job
```bash
# Add to crontab
*/5 * * * * /opt/keeta-chain/scripts/health-check.sh
```

## 📈 Performance Tuning

### Node.js Optimization
```bash
# Start with optimized flags
node --max-old-space-size=4096 --optimize-for-size src/production-app.js
```

### Environment Variables
```bash
export NODE_OPTIONS="--max-old-space-size=4096"
export UV_THREADPOOL_SIZE=16
export NODE_ENV=production
```

## 🔄 Backup Strategy

### Automated Backup Script
```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/var/backups/keeta-chain"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup
tar -czf "$BACKUP_DIR/keeta-chain-$DATE.tar.gz" /var/lib/keeta-chain

# Keep last 7 days
find "$BACKUP_DIR" -name "keeta-chain-*.tar.gz" -mtime +7 -delete

echo "✅ Backup completed: keeta-chain-$DATE.tar.gz"
```

### Cron Backup
```bash
# Daily backup at 2 AM
0 2 * * * /opt/keeta-chain/scripts/backup.sh
```

## 🎯 Production Checklist

- [x] Database bug fixed
- [x] Port conflict resolved
- [ ] Environment variables configured
- [ ] SSL/TLS certificates installed
- [ ] Firewall configured
- [ ] Monitoring setup
- [ ] Backup strategy implemented
- [ ] Log rotation configured
- [ ] Health checks active
- [ ] Load testing completed
- [ ] Security audit passed

## 🚀 Go Live!

Once all steps are completed:

```bash
# Final verification
curl -f http://localhost:3001/health

# Start production
npm run prod

# Monitor logs
tail -f logs/app.log

# Check metrics
curl http://localhost:3001/metrics
```

**🎉 Your Keeta Chain is now running in production!**

The application includes:
- ✅ Production-grade blockchain
- ✅ Official Keeta Network integration
- ✅ Real-time monitoring
- ✅ Security hardening
- ✅ Automatic backups
- ✅ Health checks
- ✅ Performance metrics

Ready for live testing and deployment! 🚀
