const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const httpProxy = require('http-proxy');
const crypto = require('crypto');
const https = require('https');
const fs = require('fs');

const app = express();

// Create HTTP server since SSL certs aren't available
const server = http.createServer(app);

const wss = new WebSocket.Server({ noServer: true });
const proxy = httpProxy.createProxyServer({
  // Add CORS headers to proxy responses
  changeOrigin: true,
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  }
});

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

        console.log(`Client registered: ${clientSubdomain}.roastme.icu -> localhost:${data.port}`);
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

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  // Forward request details to client
  client.ws.send(JSON.stringify({
    type: 'request',
    method: req.method,
    path: req.url
  }));

  // Proxy the request to localhost with the client's port
  proxy.web(req, res, {
    target: `http://localhost:${client.port}`,
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
server.listen(PORT, () => {
  console.log(`DevShare server running on port ${PORT}`);
});
