import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';

export class KeetaNode {
  constructor(blockchain, port = 6001) {
    this.blockchain = blockchain;
    this.port = port;
    this.peers = new Map();
    this.nodeId = uuidv4();
    this.server = null;
    this.hashRate = 0;
    this.connectedPeers = [];
    this.messageHandlers = new Map();
    
    this.setupMessageHandlers();
  }

  setupMessageHandlers() {
    this.messageHandlers.set('BLOCK', this.handleBlock.bind(this));
    this.messageHandlers.set('TRANSACTION', this.handleTransaction.bind(this));
    this.messageHandlers.set('PEER_DISCOVERY', this.handlePeerDiscovery.bind(this));
    this.messageHandlers.set('CHAIN_REQUEST', this.handleChainRequest.bind(this));
    this.messageHandlers.set('CHAIN_RESPONSE', this.handleChainResponse.bind(this));
    this.messageHandlers.set('HASHRATE_UPDATE', this.handleHashRateUpdate.bind(this));
  }

  start() {
    this.server = new WebSocket.Server({ port: this.port });
    
    this.server.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    console.log(`🌐 Keeta Node ${this.nodeId} started on port ${this.port}`);
  }

  handleConnection(ws, req) {
    const peerId = uuidv4();
    const peer = {
      id: peerId,
      ws: ws,
      address: req.socket.remoteAddress,
      port: req.socket.remotePort,
      connected: Date.now()
    };

    this.peers.set(peerId, peer);
    this.connectedPeers.push(peerId);

    console.log(`🔗 New peer connected: ${peerId} from ${peer.address}:${peer.port}`);

    ws.on('message', (message) => {
      this.handleMessage(peerId, message);
    });

    ws.on('close', () => {
      this.handleDisconnection(peerId);
    });

    ws.on('error', (error) => {
      console.error(`❌ Peer ${peerId} error:`, error);
      this.handleDisconnection(peerId);
    });

    // Send current chain info to new peer
    this.sendToPeer(peerId, {
      type: 'CHAIN_RESPONSE',
      data: {
        chain: this.blockchain.chain,
        height: this.blockchain.chain.length,
        hash: this.blockchain.getLatestBlock().hash
      }
    });

    // Request peers from new node
    this.broadcastToPeers({
      type: 'PEER_DISCOVERY',
      data: {
        nodeId: this.nodeId,
        address: 'localhost',
        port: this.port
      }
    }, peerId);
  }

  handleDisconnection(peerId) {
    this.peers.delete(peerId);
    this.connectedPeers = this.connectedPeers.filter(id => id !== peerId);
    console.log(`❌ Peer disconnected: ${peerId}`);
  }

  handleMessage(peerId, message) {
    try {
      const data = JSON.parse(message);
      const handler = this.messageHandlers.get(data.type);
      
      if (handler) {
        handler(peerId, data.data);
      } else {
        console.warn(`⚠️ Unknown message type: ${data.type}`);
      }
    } catch (error) {
      console.error(`❌ Error handling message from ${peerId}:`, error);
    }
  }

  handleBlock(peerId, blockData) {
    console.log(`📦 Received block from peer ${peerId}:`, blockData.index);
    
    // Validate block
    if (this.isValidBlock(blockData)) {
      // Add to blockchain if valid
      if (blockData.index === this.blockchain.chain.length) {
        this.blockchain.chain.push(blockData);
        console.log(`✅ Added block ${blockData.index} to chain`);
        
        // Broadcast to other peers
        this.broadcastToPeers({
          type: 'BLOCK',
          data: blockData
        }, peerId);
      }
    } else {
      console.warn(`⚠️ Invalid block received from peer ${peerId}`);
    }
  }

  handleTransaction(peerId, txData) {
    console.log(`💸 Received transaction from peer ${peerId}:`, txData.id);
    
    try {
      this.blockchain.addTransaction(txData);
      
      // Broadcast to other peers
      this.broadcastToPeers({
        type: 'TRANSACTION',
        data: txData
      }, peerId);
    } catch (error) {
      console.warn(`⚠️ Invalid transaction from peer ${peerId}:`, error.message);
    }
  }

  handlePeerDiscovery(peerId, data) {
    console.log(`🔍 Peer discovery from ${peerId}:`, data);
    
    // Connect to new peer if not already connected
    const peerKey = `${data.address}:${data.port}`;
    if (!this.isPeerConnected(peerKey) && data.port !== this.port) {
      this.connectToPeer(data.address, data.port);
    }
  }

  handleChainRequest(peerId, data) {
    console.log(`📋 Chain request from ${peerId}`);
    
    this.sendToPeer(peerId, {
      type: 'CHAIN_RESPONSE',
      data: {
        chain: this.blockchain.chain,
        height: this.blockchain.chain.length,
        hash: this.blockchain.getLatestBlock().hash
      }
    });
  }

  handleChainResponse(peerId, data) {
    console.log(`📋 Chain response from ${peerId}:`, data.height, 'blocks');
    
    // Compare chains and sync if needed
    if (data.height > this.blockchain.chain.length) {
      console.log(`🔄 Syncing chain with peer ${peerId}`);
      this.replaceChain(data.chain);
    }
  }

  handleHashRateUpdate(peerId, data) {
    // Update network hashrate calculation
    this.hashRate = data.hashRate;
  }

  connectToPeer(address, port) {
    const ws = new WebSocket(`ws://${address}:${port}`);
    
    ws.on('open', () => {
      console.log(`🔗 Connected to peer: ${address}:${port}`);
      this.handleConnection(ws, { socket: { remoteAddress: address, remotePort: port } });
    });

    ws.on('error', (error) => {
      console.error(`❌ Failed to connect to ${address}:${port}:`, error);
    });
  }

  sendToPeer(peerId, message) {
    const peer = this.peers.get(peerId);
    if (peer && peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(JSON.stringify(message));
    }
  }

  broadcastToPeers(message, excludePeerId = null) {
    for (const peerId of this.connectedPeers) {
      if (peerId !== excludePeerId) {
        this.sendToPeer(peerId, message);
      }
    }
  }

  broadcastTransaction(transaction) {
    this.broadcastToPeers({
      type: 'TRANSACTION',
      data: transaction
    });
  }

  broadcastBlock(block) {
    this.broadcastToPeers({
      type: 'BLOCK',
      data: block
    });
  }

  isPeerConnected(address) {
    return Array.from(this.peers.values()).some(peer => 
      `${peer.address}:${peer.port}` === address
    );
  }

  isValidBlock(block) {
    // Basic validation - would be more comprehensive in production
    return block && 
           block.index && 
           block.hash && 
           block.previousHash && 
           block.transactions &&
           block.timestamp;
  }

  replaceChain(newChain) {
    if (newChain.length > this.blockchain.chain.length) {
      this.blockchain.chain = newChain;
      console.log(`🔄 Chain replaced with longer chain (${newChain.length} blocks)`);
    }
  }

  getConnectedPeers() {
    return Array.from(this.peers.values()).map(peer => ({
      id: peer.id,
      address: peer.address,
      port: peer.port,
      connected: peer.connected
    }));
  }

  getHashRate() {
    return this.hashRate;
  }

  updateHashRate(newHashRate) {
    this.hashRate = newHashRate;
    this.broadcastToPeers({
      type: 'HASHRATE_UPDATE',
      data: { hashRate: newHashRate }
    });
  }

  getNetworkStats() {
    return {
      nodeId: this.nodeId,
      port: this.port,
      connectedPeers: this.connectedPeers.length,
      hashRate: this.hashRate,
      chainHeight: this.blockchain.chain.length,
      pendingTransactions: this.blockchain.pendingTransactions.length
    };
  }
}
