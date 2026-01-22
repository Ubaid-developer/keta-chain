import fs from 'fs/promises';
import path from 'path';

export class ConfigManager {
  constructor() {
    this.config = {};
    this.isLoaded = false;
  }

  async load(environment = process.env.NODE_ENV || 'development') {
    if (this.isLoaded) return this.config;

    try {
      const configFile = path.join(process.cwd(), 'config', `${environment}.json`);
      const defaultFile = path.join(process.cwd(), 'config', 'default.json');
      
      // Load default config first
      let config = {};
      try {
        const defaultData = await fs.readFile(defaultFile, 'utf8');
        config = JSON.parse(defaultData);
      } catch (error) {
        console.warn('⚠️ No default config file found, using built-in defaults');
      }

      // Override with environment-specific config
      try {
        const envData = await fs.readFile(configFile, 'utf8');
        const envConfig = JSON.parse(envData);
        config = this.mergeConfigs(config, envConfig);
      } catch (error) {
        console.warn(`⚠️ No ${environment} config file found, using defaults`);
      }

      // Override with environment variables
      config = this.overrideWithEnvVars(config);

      this.config = config;
      this.isLoaded = true;

      console.log(`✅ Configuration loaded for ${environment} environment`);
      return this.config;
    } catch (error) {
      console.error('❌ Failed to load configuration:', error);
      throw error;
    }
  }

  mergeConfigs(base, override) {
    const result = { ...base };
    
    for (const key in override) {
      if (override[key] && typeof override[key] === 'object' && !Array.isArray(override[key])) {
        result[key] = this.mergeConfigs(result[key] || {}, override[key]);
      } else {
        result[key] = override[key];
      }
    }
    
    return result;
  }

  overrideWithEnvVars(config) {
    const envMappings = {
      'PORT': 'server.port',
      'HOST': 'server.host',
      'NODE_ENV': 'server.nodeEnv',
      'BLOCKCHAIN_DIFFICULTY': 'blockchain.difficulty',
      'BLOCKCHAIN_MINING_REWARD': 'blockchain.miningReward',
      'DATABASE_DIR': 'database.dataDir',
      'RATE_LIMIT_ENABLED': 'security.rateLimiting.enabled',
      'CORS_ORIGINS': 'security.cors.allowedOrigins'
    };

    for (const [envVar, configPath] of Object.entries(envMappings)) {
      const value = process.env[envVar];
      if (value !== undefined) {
        this.setNestedValue(config, configPath, this.parseEnvValue(value));
      }
    }

    return config;
  }

  setNestedValue(obj, path, value) {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in current)) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }

    current[keys[keys.length - 1]] = value;
  }

  parseEnvValue(value) {
    // Try to parse as JSON first
    try {
      return JSON.parse(value);
    } catch {
      // If not JSON, return as string
      return value;
    }
  }

  get(path, defaultValue = undefined) {
    if (!this.isLoaded) {
      throw new Error('Configuration not loaded. Call load() first.');
    }

    return this.getNestedValue(this.config, path, defaultValue);
  }

  getNestedValue(obj, path, defaultValue) {
    const keys = path.split('.');
    let current = obj;

    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        return defaultValue;
      }
    }

    return current;
  }

  validate() {
    const required = [
      'server.port',
      'blockchain.difficulty',
      'database.dataDir'
    ];

    const missing = [];
    for (const path of required) {
      if (this.get(path) === undefined) {
        missing.push(path);
      }
    }

    if (missing.length > 0) {
      throw new Error(`Missing required configuration: ${missing.join(', ')}`);
    }

    return true;
  }

  async reload(environment = process.env.NODE_ENV || 'development') {
    this.isLoaded = false;
    return await this.load(environment);
  }
}

// Singleton instance
export const config = new ConfigManager();

// Default configuration
export const defaultConfig = {
  server: {
    port: 3001,
    host: 'localhost',
    nodeEnv: 'development'
  },
  security: {
    rateLimiting: {
      enabled: true,
      windowMs: 900000,
      maxRequests: 100,
      walletMax: 20,
      miningMax: 10,
      transactionMax: 5
    },
    cors: {
      allowedOrigins: ['http://localhost:3001'],
      credentials: true
    },
    helmet: {
      enabled: true,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    }
  },
  blockchain: {
    difficulty: 4,
    miningReward: 10,
    maxTransactionsPerBlock: 10000,
    blockTime: 2500
  },
  database: {
    dataDir: './data',
    backupInterval: 3600000,
    maxBackups: 10,
    compactInterval: 86400000
  },
  network: {
    port: 6001,
    maxPeers: 50,
    heartbeatInterval: 30000
  },
  logging: {
    level: 'info',
    maxFiles: 10,
    maxSize: '10MB'
  },
  monitoring: {
    enabled: true,
    metricsInterval: 60000,
    healthCheckInterval: 30000
  }
};
