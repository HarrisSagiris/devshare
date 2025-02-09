const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const httpProxy = require('http-proxy');
const crypto = require('crypto');
const https = require('https');
const fs = require('fs');

const app = express();

// Create HTTPS server with SSL certificates
const server = https.createServer({
  key: fs.readFileSync('/etc/letsencrypt/live/roastme.icu/privkey.pem'),
  cert: fs.readFileSync('/etc/letsencrypt/live/roastme.icu/fullchain.pem')
}, app);

const wss = new WebSocket.Server({ noServer: true });
const proxy = httpProxy.createProxyServer();

// Store client connections with their subdomains
const clients = new Map(); // subdomain -> {ws, port}

// Generate random subdomain
function generateSubdomain() {
  return crypto.randomBytes(3).toString('hex');
}

// Handle WebSocket upgrade
server.on('upgrade', (request, socket, head) => {
  if (request.url === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  }
});

wss.on('connection', (ws) => {
  console.log('New client connected');
  let clientSubdomain = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.port) {
        // Generate unique subdomain
        clientSubdomain = generateSubdomain();
        
        // Store client info
        clients.set(clientSubdomain, {
          ws,
          port: data.port
        });

        // Send subdomain back to client
        ws.send(JSON.stringify({
          type: 'connected',
          subdomain: clientSubdomain
        }));

        console.log(`Client registered: ${clientSubdomain}.roastme.icu -> 135.181.149.116:${data.port}`);
      }
    } catch (err) {
      console.error('Error processing message:', err);
    }
  });

  ws.on('close', () => {
    if (clientSubdomain) {
      clients.delete(clientSubdomain);
      console.log(`Client unregistered: ${clientSubdomain}.roastme.icu`);
    }
  });
});

// Handle HTTP requests
app.use((req, res) => {
  const hostname = req.hostname;
  const subdomain = hostname.split('.')[0];
  
  const client = clients.get(subdomain);
  if (!client) {
    return res.status(404).send('No client connected for this subdomain');
  }

  // Forward request details to client
  client.ws.send(JSON.stringify({
    type: 'request',
    method: req.method,
    path: req.url
  }));

  // Proxy the request to Hetzner server with the client's port
  proxy.web(req, res, {
    target: `http://135.181.149.116:${client.port}`,
    ws: true
  }, (err) => {
    if (err) {
      console.error('Proxy error:', err);
      res.status(500).send('Proxy error');
    }
  });
});

// Handle WebSocket proxy errors
proxy.on('error', (err) => {
  console.error('Proxy error:', err);
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '135.181.149.116', () => {
  console.log(`DevShare server running on 135.181.149.116:${PORT}`);
});
