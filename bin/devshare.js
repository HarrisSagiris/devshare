#!/usr/bin/env node

const WebSocket = require('ws');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const argv = yargs(hideBin(process.argv))
  .option('login', {
    type: 'boolean', 
    description: 'Login to DevShare dashboard',
    demandOption: false
  })
  .option('port', {
    alias: 'p',
    type: 'number',
    description: 'Local port number to expose',
    demandOption: false
  })
  .argv;

const port = argv.port;
const serverUrl = 'https://devshare.roastme.icu';
const wsUrl = 'wss://devshare.roastme.icu/ws';

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

if (!port) {
  console.log('❌ Port number is required when sharing a local server');
  process.exit(1);
}

console.log(`🔍 Checking if localhost:${port} is running...`);

checkLocalPort()
  .then(async () => {
    console.log(`✅ Found local server on port ${port}`);

    console.log('🔗 Connecting to DevShare server...');
    
    const ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      console.log('✅ Connected to DevShare server!');
      
      // Send port information to the server
      ws.send(JSON.stringify({ port }));
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        if (message.type === 'connected') {
          console.log(`✨ Your localhost:${port} is now public at: http://${message.subdomain}.roastme.icu`);
          // Test the HTTP connection
          http.get(`${serverUrl}`, (res) => {
            if (res.statusCode === 200) {
              console.log('✅ HTTP connection successful');
            }
          }).on('error', (err) => {
            console.error('❌ HTTP connection error:', err.message);
          });
        } else if (message.type === 'request') {
          console.log(`📥 Incoming request: ${message.method} ${message.path}`);
        } else if (message.type === 'error') {
          console.error(`❌ Server error: ${message.error}`);
          ws.close();
          process.exit(1);
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
    console.error('Please make sure your local server is running before using devshare');
    process.exit(1);
  });
