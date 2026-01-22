import crypto from 'crypto';
import { scryptSync, randomBytes } from 'crypto';

export class CryptoUtils {
  static ALGORITHM = 'aes-256-gcm';
  static KEY_LENGTH = 32;
  static IV_LENGTH = 16;
  static SALT_LENGTH = 32;
  static TAG_LENGTH = 16;

  // Secure key derivation using scrypt
  static deriveKey(password, salt) {
    return scryptSync(password, salt, this.KEY_LENGTH);
  }

  // Encrypt sensitive data
  static encrypt(text, key) {
    const iv = randomBytes(this.IV_LENGTH);
    const cipher = crypto.createCipher(this.ALGORITHM, key);
    cipher.setAAD(Buffer.from('keeta-chain', 'utf8'));
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex')
    };
  }

  // Decrypt sensitive data
  static decrypt(encryptedData, key) {
    const decipher = crypto.createDecipher(this.ALGORITHM, key);
    decipher.setAAD(Buffer.from('keeta-chain', 'utf8'));
    decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  // Generate secure random bytes
  static secureRandom(length = 32) {
    return randomBytes(length);
  }

  // Create HMAC for message authentication
  static createHMAC(data, key) {
    const hmac = crypto.createHmac('sha256', key);
    hmac.update(data);
    return hmac.digest('hex');
  }

  // Verify HMAC
  static verifyHMAC(data, key, signature) {
    const expectedSignature = this.createHMAC(data, key);
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  // Generate secure key pair for wallets
  static generateKeyPair() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });

    return { publicKey, privateKey };
  }

  // Sign message with private key
  static sign(message, privateKey) {
    const sign = crypto.createSign('SHA256');
    sign.update(message);
    return sign.sign(privateKey, 'hex');
  }

  // Verify signature
  static verify(message, signature, publicKey) {
    try {
      const verify = crypto.createVerify('SHA256');
      verify.update(message);
      return verify.verify(publicKey, signature, 'hex');
    } catch (error) {
      return false;
    }
  }

  // Generate wallet address from public key
  static generateAddress(publicKey) {
    const hash = crypto.createHash('sha256')
      .update(publicKey)
      .digest('hex');
    
    // Add version byte and checksum
    const version = '00'; // Mainnet version
    const payload = version + hash.substring(0, 40);
    const checksum = crypto.createHash('sha256')
      .update(payload)
      .digest('hex')
      .substring(0, 8);
    
    return 'K' + payload + checksum;
  }

  // Validate address format and checksum
  static validateAddress(address) {
    if (!address || typeof address !== 'string' || !address.startsWith('K')) {
      return false;
    }

    if (address.length !== 51) { // K + 1 version + 40 hash + 8 checksum
      return false;
    }

    try {
      const version = address.substring(1, 3);
      const hash = address.substring(3, 43);
      const checksum = address.substring(43, 51);
      
      const expectedChecksum = crypto.createHash('sha256')
        .update(version + hash)
        .digest('hex')
        .substring(0, 8);
      
      return checksum === expectedChecksum;
    } catch (error) {
      return false;
    }
  }

  // Create secure hash for proof of work
  static createHash(data) {
    return crypto.createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');
  }

  // Generate deterministic seed from entropy
  static generateSeed(entropy) {
    return crypto.createHash('sha256')
      .update(entropy)
      .digest('hex');
  }
}

export class SecureWallet {
  constructor(password) {
    this.salt = CryptoUtils.secureRandom(CryptoUtils.SALT_LENGTH);
    this.key = CryptoUtils.deriveKey(password, this.salt);
    this.keyPair = null;
    this.address = null;
  }

  // Generate new wallet with encryption
  generateWallet() {
    this.keyPair = CryptoUtils.generateKeyPair();
    this.address = CryptoUtils.generateAddress(this.keyPair.publicKey);
    
    return {
      address: this.address,
      publicKey: this.keyPair.publicKey,
      encryptedPrivateKey: CryptoUtils.encrypt(this.keyPair.privateKey, this.key),
      salt: this.salt.toString('hex')
    };
  }

  // Decrypt private key
  decryptPrivateKey(encryptedPrivateKey, salt, password) {
    const key = CryptoUtils.deriveKey(password, Buffer.from(salt, 'hex'));
    return CryptoUtils.decrypt(encryptedPrivateKey, key);
  }

  // Sign transaction
  signTransaction(transaction, privateKey) {
    const message = JSON.stringify({
      from: transaction.fromAddress,
      to: transaction.toAddress,
      amount: transaction.amount,
      timestamp: transaction.timestamp,
      data: transaction.data
    });
    
    return CryptoUtils.sign(message, privateKey);
  }

  // Verify transaction signature
  static verifyTransaction(transaction, signature, publicKey) {
    const message = JSON.stringify({
      from: transaction.fromAddress,
      to: transaction.toAddress,
      amount: transaction.amount,
      timestamp: transaction.timestamp,
      data: transaction.data
    });
    
    return CryptoUtils.verify(message, signature, publicKey);
  }
}
