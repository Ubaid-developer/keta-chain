import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { CryptoUtils, SecureWallet } from './crypto.js';
import { database } from '../config/database.js';

export class Block {
  constructor(index, transactions, previousHash, timestamp = Date.now()) {
    this.index = index;
    this.timestamp = timestamp;
    this.transactions = transactions;
    this.previousHash = previousHash;
    this.hash = this.calculateHash();
    this.nonce = 0;
  }

  calculateHash() {
    return CryptoUtils.createHash({
      index: this.index,
      timestamp: this.timestamp,
      transactions: this.transactions,
      previousHash: this.previousHash,
      nonce: this.nonce
    });
  }

  mineBlock(difficulty) {
    const target = '0'.repeat(difficulty);
    
    while (this.hash.substring(0, difficulty) !== target) {
      this.nonce++;
      this.hash = this.calculateHash();
      
      // Prevent infinite loops in production
      if (this.nonce > Number.MAX_SAFE_INTEGER) {
        throw new Error('Mining timeout - nonce exceeded maximum value');
      }
    }
    
    console.log(`Block mined: ${this.hash}`);
  }

  hasValidTransactions() {
    for (const tx of this.transactions) {
      if (!tx.isValid()) return false;
    }
    return true;
  }
}

export class Transaction {
  constructor(fromAddress, toAddress, amount, data = {}) {
    // Input validation
    if (!CryptoUtils.validateAddress(toAddress)) {
      throw new Error('Invalid recipient address');
    }
    
    if (fromAddress && !CryptoUtils.validateAddress(fromAddress)) {
      throw new Error('Invalid sender address');
    }
    
    if (typeof amount !== 'number' || amount <= 0) {
      throw new Error('Invalid transaction amount');
    }
    
    this.id = uuidv4();
    this.fromAddress = fromAddress;
    this.toAddress = toAddress;
    this.amount = Math.round(amount * 100) / 100; // Round to 2 decimal places
    this.timestamp = Date.now();
    this.data = Object.freeze({ ...data }); // Freeze to prevent modifications
    this.signature = null;
  }

  calculateHash() {
    return CryptoUtils.createHash({
      fromAddress: this.fromAddress,
      toAddress: this.toAddress,
      amount: this.amount,
      timestamp: this.timestamp,
      data: this.data
    });
  }

  signTransaction(signingKey) {
    if (!signingKey) {
      throw new Error('Private key is required for signing');
    }
    
    // For mining rewards, fromAddress is null
    if (this.fromAddress) {
      // Verify that the private key matches the fromAddress
      const tempPublicKey = crypto.createPublicKey(signingKey);
      const derivedAddress = CryptoUtils.generateAddress(tempPublicKey.export({ format: 'pem', type: 'spki' }));
      
      if (derivedAddress !== this.fromAddress) {
        throw new Error('Private key does not match sender address');
      }
    }

    const message = this.calculateHash();
    this.signature = SecureWallet.signTransaction(this, signingKey);
  }

  isValid() {
    // Mining rewards are always valid
    if (this.fromAddress === null) return true;

    if (!this.signature || this.signature.length === 0) {
      throw new Error('Transaction is not signed');
    }

    try {
      // Recreate public key from address (this is simplified - in production you'd store public keys)
      const message = this.calculateHash();
      
      // For production, you'd maintain a mapping of addresses to public keys
      // This is a simplified validation
      return this.signature && this.signature.length > 0;
    } catch (error) {
      console.error('Transaction validation error:', error);
      return false;
    }
  }
}

export class Blockchain {
  constructor() {
    this.chain = [];
    this.difficulty = 4;
    this.pendingTransactions = [];
    this.miningReward = 10;
    this.maxTransactionsPerBlock = 10000; // High TPS capability
    this.isInitialized = false;
  }

  // Initialize blockchain from database
  async initialize() {
    if (this.isInitialized) return;
    
    try {
      await database.initialize();
      
      // Load existing data
      const savedChain = await database.loadBlockchain();
      if (savedChain.length > 0) {
        this.chain = savedChain;
      } else {
        // Create genesis block if no data exists
        this.chain = [this.createGenesisBlock()];
        await this.saveChain();
      }
      
      this.pendingTransactions = await database.loadPendingTransactions();
      this.isInitialized = true;
      
      console.log(`🔗 Blockchain initialized with ${this.chain.length} blocks`);
    } catch (error) {
      console.error('❌ Blockchain initialization failed:', error);
      // Fallback to in-memory blockchain
      this.chain = [this.createGenesisBlock()];
      this.isInitialized = true;
    }
  }

  // Save blockchain to database
  async saveChain() {
    if (!this.isInitialized) return;
    
    try {
      await database.saveBlockchain(this.chain);
    } catch (error) {
      console.error('❌ Failed to save blockchain:', error);
    }
  }

  // Save pending transactions
  async savePendingTransactions() {
    if (!this.isInitialized) return;
    
    try {
      await database.savePendingTransactions(this.pendingTransactions);
    } catch (error) {
      console.error('❌ Failed to save pending transactions:', error);
    }
  }

  createGenesisBlock() {
    return new Block(0, [], '0');
  }

  getLatestBlock() {
    return this.chain[this.chain.length - 1];
  }

  async addTransaction(transaction) {
    if (!transaction.fromAddress || !transaction.toAddress) {
      throw new Error('Transaction must include from and to address');
    }

    if (!transaction.isValid()) {
      throw new Error('Cannot add invalid transaction to chain');
    }

    if (transaction.amount <= 0) {
      throw new Error('Transaction amount should be higher than 0');
    }

    // Get wallet balance
    const walletBalance = this.getBalance(transaction.fromAddress);
    
    if (walletBalance < transaction.amount) {
      throw new Error('Not enough balance');
    }

    this.pendingTransactions.push(transaction);
    await this.savePendingTransactions();
  }

  getBalance(address) {
    let balance = 0;

    for (const block of this.chain) {
      for (const trans of block.transactions) {
        if (trans.fromAddress === address) {
          balance -= trans.amount;
        }

        if (trans.toAddress === address) {
          balance += trans.amount;
        }
      }
    }

    return balance;
  }

  getAllTransactionsForWallet(address) {
    const txs = [];

    for (const block of this.chain) {
      for (const tx of block.transactions) {
        if (tx.fromAddress === address || tx.toAddress === address) {
          txs.push(tx);
        }
      }
    }

    return txs;
  }

  async minePendingTransactions(miningRewardAddress) {
    // Create reward transaction
    const rewardTx = new Transaction(null, miningRewardAddress, this.miningReward);
    
    // Get transactions to mine (limit for performance)
    const transactionsToMine = this.pendingTransactions.slice(0, this.maxTransactionsPerBlock);
    transactionsToMine.push(rewardTx);

    const block = new Block(
      this.chain.length,
      transactionsToMine,
      this.getLatestBlock().hash
    );

    block.mineBlock(this.difficulty);

    console.log('Block successfully mined!');
    this.chain.push(block);

    // Remove mined transactions from pending
    this.pendingTransactions = this.pendingTransactions.slice(this.maxTransactionsPerBlock);
    
    // Save both chain and pending transactions
    await this.saveChain();
    await this.savePendingTransactions();
  }

  isChainValid() {
    const realGenesis = JSON.stringify(this.createGenesisBlock());

    if (realGenesis !== JSON.stringify(this.chain[0])) {
      return false;
    }

    for (let i = 1; i < this.chain.length; i++) {
      const currentBlock = this.chain[i];
      const previousBlock = this.chain[i - 1];

      if (previousBlock.hash !== currentBlock.previousHash) {
        return false;
      }

      if (!currentBlock.hasValidTransactions()) {
        return false;
      }

      if (currentBlock.hash !== currentBlock.calculateHash()) {
        return false;
      }
    }

    return true;
  }

  getChainStats() {
    return {
      height: this.chain.length,
      difficulty: this.difficulty,
      pendingTransactions: this.pendingTransactions.length,
      totalTransactions: this.chain.reduce((sum, block) => sum + block.transactions.length, 0),
      isValid: this.isChainValid()
    };
  }

  // Cross-chain functionality
  createCrossChainTransaction(fromChain, toChain, fromAddress, toAddress, amount, data) {
    const crossChainData = {
      fromChain,
      toChain,
      bridgeFee: amount * 0.001, // 0.1% bridge fee
      ...data
    };

    return new Transaction(fromAddress, toAddress, amount, crossChainData);
  }

  // Tokenization features
  createTokenTransaction(creator, tokenName, symbol, totalSupply, metadata) {
    const tokenData = {
      type: 'TOKEN_CREATION',
      tokenName,
      symbol,
      totalSupply,
      metadata,
      timestamp: Date.now()
    };

    return new Transaction(creator, creator, 0, tokenData);
  }
}
