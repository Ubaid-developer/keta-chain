import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';

export class DatabaseManager {
  constructor(dataDir = './data') {
    this.dataDir = dataDir;
    this.blocksFile = path.join(dataDir, 'blocks.json');
    this.pendingFile = path.join(dataDir, 'pending.json');
    this.configFile = path.join(dataDir, 'config.json');
    this.backupDir = path.join(dataDir, 'backups');
  }

  // Initialize database directory structure
  async initialize() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      await fs.mkdir(this.backupDir, { recursive: true });
      
      // Create initial files if they don't exist
      await this.ensureFile(this.blocksFile, '[]');
      await this.ensureFile(this.pendingFile, '[]');
      await this.ensureFile(this.configFile, '{}');
      
      console.log('✅ Database initialized successfully');
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      throw error;
    }
  }

  // Ensure file exists with default content
  async ensureFile(filePath, defaultContent) {
    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(filePath, defaultContent);
    }
  }

  // Save blockchain data
  async saveBlockchain(chain) {
    try {
      const data = {
        version: '1.0',
        timestamp: Date.now(),
        hash: this.calculateDataHash(chain),
        chain: chain
      };

      // Create backup before saving
      await this.createBackup(this.blocksFile);
      
      await fs.writeFile(this.blocksFile, JSON.stringify(data, null, 2));
      console.log(`💾 Saved blockchain with ${chain.length} blocks`);
    } catch (error) {
      console.error('❌ Failed to save blockchain:', error);
      throw error;
    }
  }

  // Load blockchain data
  async loadBlockchain() {
    try {
      const data = await fs.readFile(this.blocksFile, 'utf8');
      const parsed = JSON.parse(data);
      
      // Verify data integrity
      if (parsed.chain && Array.isArray(parsed.chain)) {
        const currentHash = this.calculateDataHash(parsed.chain);
        if (parsed.hash && currentHash !== parsed.hash) {
          throw new Error('Blockchain data integrity check failed');
        }
        
        console.log(`📖 Loaded blockchain with ${parsed.chain.length} blocks`);
        return parsed.chain;
      } else {
        console.log('📝 No valid blockchain data found, starting fresh');
        return [];
      }
    } catch (error) {
      console.error('❌ Failed to load blockchain:', error);
      
      // Try to load from backup
      const backup = await this.loadFromBackup(this.blocksFile);
      if (backup) {
        console.log('🔄 Restored from backup');
        return backup;
      }
      
      // Return empty chain if no backup available
      console.log('🆕 Starting with empty blockchain');
      return [];
    }
  }

  // Save pending transactions
  async savePendingTransactions(pendingTransactions) {
    try {
      const data = {
        version: '1.0',
        timestamp: Date.now(),
        count: pendingTransactions.length,
        transactions: pendingTransactions
      };

      await fs.writeFile(this.pendingFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('❌ Failed to save pending transactions:', error);
      throw error;
    }
  }

  // Load pending transactions
  async loadPendingTransactions() {
    try {
      const data = await fs.readFile(this.pendingFile, 'utf8');
      const parsed = JSON.parse(data);
      return parsed.transactions || [];
    } catch (error) {
      console.error('❌ Failed to load pending transactions:', error);
      return [];
    }
  }

  // Save configuration
  async saveConfig(config) {
    try {
      const data = {
        version: '1.0',
        timestamp: Date.now(),
        config: config
      };

      await fs.writeFile(this.configFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('❌ Failed to save config:', error);
      throw error;
    }
  }

  // Load configuration
  async loadConfig() {
    try {
      const data = await fs.readFile(this.configFile, 'utf8');
      const parsed = JSON.parse(data);
      return parsed.config || {};
    } catch (error) {
      console.error('❌ Failed to load config:', error);
      return {};
    }
  }

  // Create backup of a file
  async createBackup(filePath) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = path.basename(filePath, '.json');
      const backupPath = path.join(this.backupDir, `${fileName}-${timestamp}.json`);
      
      const data = await fs.readFile(filePath);
      await fs.writeFile(backupPath, data);
      
      // Clean old backups (keep last 10)
      await this.cleanOldBackups(fileName);
      
      console.log(`💾 Created backup: ${backupPath}`);
    } catch (error) {
      console.error('❌ Failed to create backup:', error);
    }
  }

  // Load from latest backup
  async loadFromBackup(filePath) {
    try {
      const fileName = path.basename(filePath, '.json');
      const backupFiles = await fs.readdir(this.backupDir);
      
      const fileBackups = backupFiles
        .filter(file => file.startsWith(fileName) && file.endsWith('.json'))
        .sort()
        .reverse();

      if (fileBackups.length > 0) {
        const latestBackup = path.join(this.backupDir, fileBackups[0]);
        const data = await fs.readFile(latestBackup, 'utf8');
        const parsed = JSON.parse(data);
        return parsed.chain || parsed.transactions || [];
      }
    } catch (error) {
      console.error('❌ Failed to load from backup:', error);
    }
    
    return null;
  }

  // Clean old backup files
  async cleanOldBackups(fileName, keepCount = 10) {
    try {
      const backupFiles = await fs.readdir(this.backupDir);
      
      const fileBackups = backupFiles
        .filter(file => file.startsWith(fileName) && file.endsWith('.json'))
        .sort()
        .reverse();

      if (fileBackups.length > keepCount) {
        const filesToDelete = fileBackups.slice(keepCount);
        
        for (const file of filesToDelete) {
          const filePath = path.join(this.backupDir, file);
          await fs.unlink(filePath);
          console.log(`🗑️ Deleted old backup: ${file}`);
        }
      }
    } catch (error) {
      console.error('❌ Failed to clean old backups:', error);
    }
  }

  // Calculate hash of data for integrity checking
  calculateDataHash(data) {
    return createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');
  }

  // Get database statistics
  async getStats() {
    try {
      const blocksData = await fs.readFile(this.blocksFile, 'utf8');
      const pendingData = await fs.readFile(this.pendingFile, 'utf8');
      
      const blocks = JSON.parse(blocksData);
      const pending = JSON.parse(pendingData);
      
      const stats = {
        blocksCount: blocks.chain ? blocks.chain.length : 0,
        pendingCount: pending.transactions ? pending.transactions.length : 0,
        lastSaved: blocks.timestamp || 0,
        backupCount: (await fs.readdir(this.backupDir)).length,
        dataDirSize: await this.getDirectorySize(this.dataDir)
      };
      
      return stats;
    } catch (error) {
      console.error('❌ Failed to get database stats:', error);
      return null;
    }
  }

  // Get directory size
  async getDirectorySize(dirPath) {
    try {
      const files = await fs.readdir(dirPath, { withFileTypes: true });
      let totalSize = 0;
      
      for (const file of files) {
        const filePath = path.join(dirPath, file.name);
        
        if (file.isDirectory()) {
          totalSize += await this.getDirectorySize(filePath);
        } else {
          const stats = await fs.stat(filePath);
          totalSize += stats.size;
        }
      }
      
      return totalSize;
    } catch (error) {
      return 0;
    }
  }

  // Compact database (remove old data, optimize storage)
  async compact() {
    try {
      console.log('🔧 Starting database compaction...');
      
      // Create full backup before compaction
      await this.createBackup(this.blocksFile);
      await this.createBackup(this.pendingFile);
      
      // Reload and resave data to optimize
      const chain = await this.loadBlockchain();
      await this.saveBlockchain(chain);
      
      const pending = await this.loadPendingTransactions();
      await this.savePendingTransactions(pending);
      
      console.log('✅ Database compaction completed');
    } catch (error) {
      console.error('❌ Database compaction failed:', error);
      throw error;
    }
  }
}

// Singleton instance
export const database = new DatabaseManager();
