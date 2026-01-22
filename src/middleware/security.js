import { createHash } from 'crypto';

// Rate limiting configurations - simplified for compatibility
export const createRateLimit = (windowMs, max, message) => {
  return {
    windowMs,
    max,
    message: { success: false, error: message },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      console.warn(`Rate limit exceeded for IP: ${req.ip}, Path: ${req.path}`);
      res.status(429).json({
        success: false,
        error: message,
        retryAfter: Math.round(windowMs / 1000)
      });
    }
  };
};

// Different rate limits for different endpoints
export const rateLimits = {
  // General API limits
  general: createRateLimit(
    15 * 60 * 1000, // 15 minutes
    100, // 100 requests
    'Too many requests from this IP, please try again later'
  ),
  
  // Strict limits for sensitive operations
  wallet: createRateLimit(
    15 * 60 * 1000, // 15 minutes
    20, // 20 requests
    'Wallet operations rate limit exceeded'
  ),
  
  // Mining limits
  mining: createRateLimit(
    60 * 1000, // 1 minute
    10, // 10 requests
    'Mining operations rate limit exceeded'
  ),
  
  // Transaction submission
  transaction: createRateLimit(
    60 * 1000, // 1 minute
    5, // 5 requests
    'Transaction submission rate limit exceeded'
  )
};

// Input validation and sanitization
export class InputValidator {
  // Validate address format
  static validateAddress(address) {
    if (!address || typeof address !== 'string') {
      return { valid: false, error: 'Address is required and must be a string' };
    }
    
    // Import CryptoUtils dynamically to avoid circular dependencies
    const { CryptoUtils } = require('../core/crypto.js');
    
    if (!CryptoUtils.validateAddress(address)) {
      return { valid: false, error: 'Invalid address format' };
    }
    
    return { valid: true };
  }

  // Validate amount
  static validateAmount(amount) {
    if (typeof amount !== 'number' || isNaN(amount)) {
      return { valid: false, error: 'Amount must be a valid number' };
    }
    
    if (amount <= 0) {
      return { valid: false, error: 'Amount must be greater than 0' };
    }
    
    if (amount > 1000000) { // Max transaction limit
      return { valid: false, error: 'Amount exceeds maximum transaction limit' };
    }
    
    return { valid: true };
  }

  // Validate private key format
  static validatePrivateKey(privateKey) {
    if (!privateKey || typeof privateKey !== 'string') {
      return { valid: false, error: 'Private key is required and must be a string' };
    }
    
    if (!privateKey.includes('-----BEGIN PRIVATE KEY-----') || 
        !privateKey.includes('-----END PRIVATE KEY-----')) {
      return { valid: false, error: 'Invalid private key format' };
    }
    
    return { valid: true };
  }

  // Validate transaction data
  static validateTransactionData(data) {
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'Transaction data must be an object' };
    }
    
    // Check for potentially dangerous properties
    const dangerousProps = ['__proto__', 'constructor', 'prototype'];
    for (const prop of dangerousProps) {
      if (prop in data) {
        return { valid: false, error: 'Invalid transaction data structure' };
      }
    }
    
    // Limit data size
    const dataSize = JSON.stringify(data).length;
    if (dataSize > 1024) { // 1KB limit
      return { valid: false, error: 'Transaction data too large' };
    }
    
    return { valid: true };
  }

  // Sanitize string input
  static sanitizeString(input, maxLength = 1000) {
    if (typeof input !== 'string') {
      return '';
    }
    
    return input
      .trim()
      .substring(0, maxLength)
      .replace(/[<>]/g, ''); // Remove potential HTML tags
  }

  // Validate pagination parameters
  static validatePagination(page, limit) {
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    
    if (pageNum < 1 || pageNum > 1000) {
      return { valid: false, error: 'Invalid page number' };
    }
    
    if (limitNum < 1 || limitNum > 100) {
      return { valid: false, error: 'Invalid limit value' };
    }
    
    return { valid: true, page: pageNum, limit: limitNum };
  }
}

// Security headers configuration - simplified for compatibility
export const securityHeaders = (req, res, next) => {
  // Basic security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // HSTS in production
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  
  next();
};

// Request logging middleware
export const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  const requestId = createHash('sha256')
    .update(req.ip + Date.now() + Math.random())
    .digest('hex')
    .substring(0, 8);
  
  // Add request ID to request object
  req.requestId = requestId;
  
  // Log request
  console.log(`[${requestId}] ${req.method} ${req.path} - IP: ${req.ip}`);
  
  // Log response
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`[${requestId}] ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
  });
  
  next();
};

// Error handling middleware
export const errorHandler = (err, req, res, next) => {
  console.error(`[${req.requestId}] Error:`, {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip
  });
  
  // Don't expose internal errors in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(err.status || 500).json({
    success: false,
    error: isDevelopment ? err.message : 'Internal server error',
    requestId: req.requestId,
    ...(isDevelopment && { stack: err.stack })
  });
};

// Async error wrapper
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// IP whitelist middleware (optional)
export const createIPWhitelist = (allowedIPs) => {
  return (req, res, next) => {
    if (allowedIPs.includes(req.ip)) {
      next();
    } else {
      console.warn(`Unauthorized IP access attempt: ${req.ip}`);
      res.status(403).json({
        success: false,
        error: 'Access denied from this IP address'
      });
    }
  };
};

// Request size limit
export const requestSizeLimit = (maxSize = '10mb') => {
  return (req, res, next) => {
    const contentLength = req.get('content-length');
    if (contentLength && parseInt(contentLength) > parseInt(maxSize)) {
      return res.status(413).json({
        success: false,
        error: 'Request entity too large'
      });
    }
    next();
  };
};

// CORS configuration
export const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    // In production, you should specify allowed origins
    const allowedOrigins = process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',')
      : ['http://localhost:3001'];
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked for origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};
