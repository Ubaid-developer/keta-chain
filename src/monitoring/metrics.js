import { createHash } from 'crypto';

export class MetricsCollector {
  constructor() {
    this.metrics = new Map();
    this.startTime = Date.now();
    this.intervals = new Map();
  }

  // Counter metric
  incrementCounter(name, labels = {}, value = 1) {
    const key = this.createKey(name, labels);
    const current = this.metrics.get(key) || { type: 'counter', value: 0, labels };
    current.value += value;
    this.metrics.set(key, current);
  }

  // Gauge metric
  setGauge(name, labels = {}, value) {
    const key = this.createKey(name, labels);
    this.metrics.set(key, { type: 'gauge', value, labels });
  }

  // Histogram metric
  recordHistogram(name, labels = {}, value) {
    const key = this.createKey(name, labels);
    const current = this.metrics.get(key) || { 
      type: 'histogram', 
      values: [], 
      count: 0, 
      sum: 0,
      labels 
    };
    
    current.values.push(value);
    current.count++;
    current.sum += value;
    
    // Keep only last 1000 values to prevent memory leaks
    if (current.values.length > 1000) {
      current.values.shift();
    }
    
    this.metrics.set(key, current);
  }

  // Timer metric
  recordTimer(name, labels = {}, duration) {
    this.recordHistogram(`${name}_duration_ms`, labels, duration);
  }

  // Create unique key for metric
  createKey(name, labels) {
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return labelStr ? `${name}{${labelStr}}` : name;
  }

  // Get all metrics
  getMetrics() {
    const result = {
      timestamp: Date.now(),
      uptime: Date.now() - this.startTime,
      metrics: {}
    };

    for (const [key, metric] of this.metrics) {
      result.metrics[key] = this.formatMetric(metric);
    }

    return result;
  }

  // Format metric for output
  formatMetric(metric) {
    switch (metric.type) {
      case 'counter':
      case 'gauge':
        return {
          type: metric.type,
          value: metric.value,
          labels: metric.labels
        };
      
      case 'histogram':
        const values = metric.values.sort((a, b) => a - b);
        return {
          type: metric.type,
          count: metric.count,
          sum: metric.sum,
          min: values.length > 0 ? Math.min(...values) : 0,
          max: values.length > 0 ? Math.max(...values) : 0,
          avg: metric.count > 0 ? metric.sum / metric.count : 0,
          p50: this.percentile(values, 0.5),
          p95: this.percentile(values, 0.95),
          p99: this.percentile(values, 0.99),
          labels: metric.labels
        };
      
      default:
        return metric;
    }
  }

  // Calculate percentile
  percentile(sortedValues, p) {
    if (sortedValues.length === 0) return 0;
    const index = Math.ceil(sortedValues.length * p) - 1;
    return sortedValues[Math.max(0, index)];
  }

  // Reset metrics
  reset() {
    this.metrics.clear();
  }

  // Get metrics in Prometheus format
  getPrometheusFormat() {
    let output = '';
    
    for (const [key, metric] of this.metrics) {
      const name = key.split('{')[0];
      const labels = key.includes('{') ? key.split('{')[1].replace('}', '') : '';
      
      switch (metric.type) {
        case 'counter':
        case 'gauge':
          output += `# TYPE ${name} ${metric.type}\n`;
          output += `${key} ${metric.value}\n`;
          break;
          
        case 'histogram':
          output += `# TYPE ${name} ${metric.type}\n`;
          output += `${key}_count ${metric.count}\n`;
          output += `${key}_sum ${metric.sum}\n`;
          break;
      }
    }
    
    return output;
  }
}

export class SystemMonitor {
  constructor() {
    this.metrics = new MetricsCollector();
    this.isRunning = false;
  }

  async start(blockchain, node) {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.blockchain = blockchain;
    this.node = node;

    // Collect metrics every minute
    this.metricsInterval = setInterval(() => {
      this.collectSystemMetrics();
    }, 60000);

    // Health check every 30 seconds
    this.healthInterval = setInterval(() => {
      this.performHealthCheck();
    }, 30000);

    console.log('📊 Monitoring started');
  }

  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
    }
    
    console.log('📊 Monitoring stopped');
  }

  collectSystemMetrics() {
    try {
      // Blockchain metrics
      const stats = this.blockchain.getChainStats();
      this.metrics.setGauge('blockchain_height', {}, stats.height);
      this.metrics.setGauge('blockchain_difficulty', {}, stats.difficulty);
      this.metrics.setGauge('pending_transactions', {}, stats.pendingTransactions);
      this.metrics.setGauge('total_transactions', {}, stats.totalTransactions);
      this.metrics.setGauge('blockchain_valid', {}, stats.isValid ? 1 : 0);

      // Node metrics
      const peers = this.node.getConnectedPeers();
      this.metrics.setGauge('connected_peers', {}, peers.length);
      this.metrics.setGauge('network_hashrate', {}, this.node.getHashRate());

      // System metrics
      const memUsage = process.memoryUsage();
      this.metrics.setGauge('memory_rss_bytes', {}, memUsage.rss);
      this.metrics.setGauge('memory_heap_used_bytes', {}, memUsage.heapUsed);
      this.metrics.setGauge('memory_heap_total_bytes', {}, memUsage.heapTotal);
      this.metrics.setGauge('cpu_usage_percent', {}, process.cpuUsage().user / 1000000);

      // Uptime
      this.metrics.setGauge('uptime_seconds', {}, process.uptime());

    } catch (error) {
      console.error('❌ Error collecting metrics:', error);
    }
  }

  performHealthCheck() {
    try {
      const isHealthy = this.blockchain.isChainValid();
      const hasPeers = this.node.getConnectedPeers().length > 0;
      
      this.metrics.setGauge('health_status', {}, isHealthy && hasPeers ? 1 : 0);
      
      if (!isHealthy) {
        console.warn('⚠️ Blockchain health check failed');
      }
      
    } catch (error) {
      console.error('❌ Health check failed:', error);
      this.metrics.setGauge('health_status', {}, 0);
    }
  }

  // Record custom events
  recordTransactionCreated() {
    this.metrics.incrementCounter('transactions_created_total');
  }

  recordBlockMined() {
    this.metrics.incrementCounter('blocks_mined_total');
  }

  recordPeerConnected() {
    this.metrics.incrementCounter('peers_connected_total');
  }

  recordPeerDisconnected() {
    this.metrics.incrementCounter('peers_disconnected_total');
  }

  recordApiRequest(method, endpoint, statusCode, duration) {
    this.metrics.incrementCounter('api_requests_total', {
      method,
      endpoint,
      status: statusCode.toString()
    });
    
    this.metrics.recordTimer('api_request_duration_ms', {
      method,
      endpoint
    }, duration);
  }

  recordMiningJobStarted() {
    this.metrics.incrementCounter('mining_jobs_started_total');
  }

  recordMiningJobCompleted(blocksMined) {
    this.metrics.incrementCounter('mining_jobs_completed_total');
    this.metrics.incrementCounter('blocks_mined_total', {}, blocksMined);
  }

  getMetrics() {
    return this.metrics.getMetrics();
  }

  getPrometheusMetrics() {
    return this.metrics.getPrometheusFormat();
  }
}

// Singleton instance
export const monitor = new SystemMonitor();
