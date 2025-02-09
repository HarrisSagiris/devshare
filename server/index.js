const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const httpProxy = require('http-proxy');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ 
  noServer: true // Change to use noServer option instead of path
});
const proxy = httpProxy.createProxyServer();

// Store client connections
const clients = new Map();

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

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.port) {
        // Store the client's port mapping
        clients.set(data.port, ws);
        console.log(`Client registered for port ${data.port}`);
      }
    } catch (err) {
      console.error('Error processing message:', err);
    }
  });

  ws.on('close', () => {
    // Remove client mapping when they disconnect
    for (const [port, client] of clients.entries()) {
      if (client === ws) {
        clients.delete(port);
        console.log(`Client unregistered from port ${port}`);
        break;
      }
    }
  });
});

// Handle HTTP requests
app.use('/:port', (req, res) => {
  const port = parseInt(req.params.port);
  
  if (!clients.has(port)) {
    return res.status(404).send('No client connected for this port');
  }

  // Proxy the request to localhost with the specified port
  proxy.web(req, res, {
    target: `http://localhost:${port}`,
    ws: true
  }, (err) => {
    if (err) {
      console.error('Proxy error:', err);
      res.status(500).send('Proxy error');
    }
  });
});

// Error handling
proxy.on('error', (err) => {
  console.error('Proxy error:', err);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`);
});
