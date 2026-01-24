const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Store active WhatsApp clients
const clients = new Map();
const qrCodes = new Map();
const clientStatus = new Map();

// Session storage directory
const SESSION_DIR = path.join(__dirname, '.wwebjs_auth');
if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

/**
 * Initialize a WhatsApp client for a session
 */
function initializeClient(sessionId) {
  if (clients.has(sessionId)) {
    console.log(`Client ${sessionId} already exists`);
    return clients.get(sessionId);
  }

  console.log(`Initializing WhatsApp client for session: ${sessionId}`);
  
  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: sessionId,
      dataPath: SESSION_DIR
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    }
  });

  // QR Code event
  client.on('qr', (qr) => {
    console.log(`QR Code received for session: ${sessionId}`);
    qrcodeTerminal.generate(qr, { small: true });
    
    // Generate QR code as data URL for API
    qrcode.toDataURL(qr, (err, url) => {
      if (!err) {
        qrCodes.set(sessionId, url);
      }
    });
    
    clientStatus.set(sessionId, 'qr_ready');
  });

  // Ready event
  client.on('ready', () => {
    console.log(`WhatsApp client ${sessionId} is ready!`);
    clientStatus.set(sessionId, 'ready');
    qrCodes.delete(sessionId); // Remove QR code once authenticated
  });

  // Authenticated event
  client.on('authenticated', () => {
    console.log(`WhatsApp client ${sessionId} authenticated`);
    clientStatus.set(sessionId, 'authenticated');
  });

  // Auth failure event
  client.on('auth_failure', (msg) => {
    console.error(`Auth failure for ${sessionId}:`, msg);
    clientStatus.set(sessionId, 'auth_failed');
  });

  // Disconnected event
  client.on('disconnected', (reason) => {
    console.log(`WhatsApp client ${sessionId} disconnected:`, reason);
    clientStatus.set(sessionId, 'disconnected');
    clients.delete(sessionId);
    qrCodes.delete(sessionId);
  });

  // Message event (for location retrieval and auto-update)
  client.on('message', async (message) => {
    // Auto-update shipping address when location is received
    if (message.location) {
      console.log(`📍 Location received from ${message.from}:`, message.location);
      
      // Extract phone number from message.from (format: 91XXXXXXXXXX@c.us)
      const phoneNumber = message.from.split('@')[0];
      
      try {
        // Call backend to update shipping address for this customer's pending orders
        const axios = require('axios');
        const response = await axios.post('http://localhost:8000/v1/whatsapp/location-update', {
          phone_number: phoneNumber,
          latitude: message.location.latitude,
          longitude: message.location.longitude,
          description: message.location.description || null
        });
        
        console.log(`✅ Shipping address auto-updated for ${phoneNumber}:`, response.data);
      } catch (error) {
        console.error(`❌ Failed to auto-update shipping address for ${phoneNumber}:`, error.message);
      }
    }
  });

  clients.set(sessionId, client);
  client.initialize();
  
  return client;
}

/**
 * API Routes
 */

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', clients: clients.size });
});

// Initialize a new WhatsApp session
app.post('/api/whatsapp/init', (req, res) => {
  const { sessionId } = req.body;
  
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  try {
    initializeClient(sessionId);
    res.json({ 
      success: true, 
      message: 'WhatsApp client initialized',
      sessionId 
    });
  } catch (error) {
    console.error('Error initializing client:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get QR code for a session
app.get('/api/whatsapp/qr/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  const qr = qrCodes.get(sessionId);
  const status = clientStatus.get(sessionId);
  
  if (!qr && status !== 'ready') {
    return res.status(404).json({ 
      error: 'QR code not available',
      status: status || 'not_initialized'
    });
  }
  
  res.json({ 
    qr, 
    status: status || 'unknown'
  });
});

// Get status of a session
app.get('/api/whatsapp/status/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const status = clientStatus.get(sessionId) || 'not_initialized';
  const hasClient = clients.has(sessionId);
  
  res.json({ 
    sessionId,
    status,
    connected: hasClient && status === 'ready'
  });
});

// Send a WhatsApp message
app.post('/api/whatsapp/send', async (req, res) => {
  const { sessionId, to, message } = req.body;
  
  if (!sessionId || !to || !message) {
    return res.status(400).json({ 
      error: 'sessionId, to, and message are required' 
    });
  }

  const client = clients.get(sessionId);
  
  if (!client || clientStatus.get(sessionId) !== 'ready') {
    return res.status(400).json({ 
      error: 'WhatsApp client not ready',
      status: clientStatus.get(sessionId)
    });
  }

  try {
    // Format phone number (remove spaces, dashes, etc.)
    let phoneNumber = to.replace(/[^\d+]/g, '');
    
    // Ensure it has country code
    if (!phoneNumber.startsWith('+')) {
      phoneNumber = '+' + phoneNumber;
    }
    
    // Remove + and add @c.us
    const chatId = phoneNumber.substring(1) + '@c.us';
    
    await client.sendMessage(chatId, message);
    
    res.json({ 
      success: true, 
      message: 'Message sent successfully',
      to: chatId
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get location from WhatsApp messages
app.post('/api/whatsapp/get-location', async (req, res) => {
  const { sessionId, phoneNumber } = req.body;
  
  console.log(`[get-location] Request received - sessionId: ${sessionId}, phoneNumber: ${phoneNumber}`);
  
  if (!sessionId || !phoneNumber) {
    return res.status(400).json({ 
      error: 'sessionId and phoneNumber are required' 
    });
  }

  const client = clients.get(sessionId);
  
  if (!client || clientStatus.get(sessionId) !== 'ready') {
    console.log(`[get-location] Client not ready - status: ${clientStatus.get(sessionId)}, hasClient: ${!!client}`);
    return res.status(400).json({ 
      error: 'WhatsApp client not ready',
      status: clientStatus.get(sessionId)
    });
  }

  try {
    // Format phone number - ensure it starts with country code
    let formattedNumber = phoneNumber.replace(/[^\d]/g, '');
    
    // If number doesn't have country code, assume India (+91)
    if (formattedNumber.length === 10) {
      formattedNumber = '91' + formattedNumber;
    }
    
    const chatId = formattedNumber + '@c.us';
    console.log(`[get-location] Formatted chatId: ${chatId}`);
    
    // Add timeout wrapper for all async operations
    const timeout = (ms, promise, errorMsg) => {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(errorMsg));
        }, ms);
        
        promise.then(
          (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          (error) => {
            clearTimeout(timer);
            reject(error);
          }
        );
      });
    };
    
    // Try to get all chats with timeout
    console.log('[get-location] Fetching chats...');
    const chats = await timeout(
      10000, 
      client.getChats(),
      'Timeout while fetching chats from WhatsApp'
    );
    console.log(`[get-location] Retrieved ${chats.length} chats`);
    
    const matchingChat = chats.find(chat => 
      chat.id._serialized === chatId || 
      chat.id.user === formattedNumber
    );
    
    if (!matchingChat) {
      console.log(`[get-location] No chat found for ${chatId}`);
      return res.status(404).json({ 
        success: false,
        error: 'No chat found with this number. Make sure you have a conversation with this contact.' 
      });
    }
    
    console.log(`[get-location] Chat found: ${matchingChat.id._serialized}`);
    
    // Fetch recent messages with timeout (reduced limit for faster response)
    console.log('[get-location] Fetching messages...');
    const messages = await timeout(
      15000,
      matchingChat.fetchMessages({ limit: 50 }),
      'Timeout while fetching messages from WhatsApp. Try again or reduce the number of messages.'
    );
    console.log(`[get-location] Fetched ${messages.length} messages`);
    
    // Find the most recent location message
    const locationMessage = messages.reverse().find(msg => msg.location);
    
    if (!locationMessage) {
      console.log(`[get-location] No location message found in ${messages.length} messages`);
      return res.status(404).json({ 
        success: false,
        error: 'No location found in recent messages. Please ask the customer to share their location via WhatsApp.' 
      });
    }
    
    console.log(`[get-location] Location found: ${locationMessage.location.latitude}, ${locationMessage.location.longitude}`);
    
    res.json({
      success: true,
      latitude: locationMessage.location.latitude,
      longitude: locationMessage.location.longitude,
      description: locationMessage.location.description || null,
      timestamp: locationMessage.timestamp
    });
  } catch (error) {
    console.error('[get-location] Error:', error.message, error.stack);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to fetch location from WhatsApp'
    });
  }
});

// Logout/disconnect a session
app.post('/api/whatsapp/logout', async (req, res) => {
  const { sessionId } = req.body;
  
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  const client = clients.get(sessionId);
  
  if (!client) {
    return res.status(404).json({ error: 'Client not found' });
  }

  try {
    await client.logout();
    clients.delete(sessionId);
    qrCodes.delete(sessionId);
    clientStatus.delete(sessionId);
    
    res.json({ 
      success: true, 
      message: 'Logged out successfully' 
    });
  } catch (error) {
    console.error('Error logging out:', error);
    res.status(500).json({ error: error.message });
  }
});

// List all active sessions
app.get('/api/whatsapp/sessions', (req, res) => {
  const sessions = [];
  
  for (const [sessionId, client] of clients.entries()) {
    sessions.push({
      sessionId,
      status: clientStatus.get(sessionId) || 'unknown',
      hasQR: qrCodes.has(sessionId)
    });
  }
  
  res.json({ sessions });
});

/**
 * Auto-restore existing sessions on startup
 */
function autoRestoreSessions() {
  try {
    if (!fs.existsSync(SESSION_DIR)) {
      console.log('No session directory found');
      return;
    }
    
    const sessionDirs = fs.readdirSync(SESSION_DIR);
    console.log(`Found ${sessionDirs.length} stored sessions`);
    
    for (const dir of sessionDirs) {
      if (dir.startsWith('session-')) {
        const sessionId = dir.replace('session-', '');
        console.log(`Restoring session: ${sessionId}`);
        
        // Initialize the client (it will auto-authenticate from stored session)
        setTimeout(() => {
          initializeClient(sessionId);
        }, 1000); // Stagger initialization to avoid overwhelming the system
      }
    }
  } catch (error) {
    console.error('Error auto-restoring sessions:', error);
  }
}

// Start server
app.listen(PORT, () => {
  console.log(`WhatsApp service running on port ${PORT}`);
  console.log(`Session storage: ${SESSION_DIR}`);
  
  // Auto-restore existing sessions after a short delay
  setTimeout(() => {
    console.log('Auto-restoring existing sessions...');
    autoRestoreSessions();
  }, 2000);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  
  for (const [sessionId, client] of clients.entries()) {
    try {
      await client.destroy();
      console.log(`Closed client: ${sessionId}`);
    } catch (error) {
      console.error(`Error closing client ${sessionId}:`, error);
    }
  }
  
  process.exit(0);
});
