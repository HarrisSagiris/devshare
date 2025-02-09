#!/usr/bin/env node

const WebSocket = require('ws');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const http = require('http');

const argv = yargs(hideBin(process.argv))
  .option('port', {
    alias: 'p',
    type: 'number',
    description: 'Local port number to expose',
    demandOption: true
  })
  .argv;

const port = argv.port;
const serverUrl = 'ws://135.181.149.116:5000/ws'; // Using ws:// since server doesn't support SSL

// First check if the local port is actually running
const checkLocalPort = () => {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:${port}`, (res) => {
      resolve(true);
    }).on('error', (err) => {
      reject(err);
    });
    req.end();
  });
};

console.log(`🔍 Checking if localhost:${port} is running...`);

checkLocalPort()
  .then(() => {
    console.log(`✅ Found local server on port ${port}`);
    console.log('🔗 Connecting to DevShare server...');
    
    const ws = new WebSocket(serverUrl);

    ws.on('open', () => {
      console.log('✅ Connected to DevShare server!');
      
      // Send port information to the server
      ws.send(JSON.stringify({ port }));
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        if (message.type === 'connected') {
          console.log(`✨ Your localhost:${port} is now public at: http://${message.subdomain}.135.181.149.116:5000`);
        } else if (message.type === 'request') {
          console.log(`📥 Incoming request: ${message.method} ${message.path}`);
        }
      } catch (err) {
        console.error('Failed to parse message:', err);
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      if (error.code === 'ECONNREFUSED') {
        console.error('Could not connect to DevShare server. Is it running?');
      }
      process.exit(1);
    });

    ws.on('close', () => {
      console.log('Connection closed');
      process.exit(0);
    });

    // Handle process termination
    process.on('SIGINT', () => {
      console.log('\nShutting down...');
      ws.close();
      process.exit(0);
    });

  })
  .catch((err) => {
    console.error(`❌ No server found running on localhost:${port}`);
    console.error('Please make sure your local server is running before using quickhost');
    process.exit(1);
  });
