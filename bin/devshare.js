#!/usr/bin/env node

const WebSocket = require('ws');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

const argv = yargs(hideBin(process.argv))
  .option('port', {
    alias: 'p',
    type: 'number',
    description: 'Port number to use',
    default: 3000
  })
  .option('server', {
    alias: 's', 
    type: 'string',
    description: 'DevShare server URL',
    default: 'localhost:3000'
  })
  .argv;

const port = argv.port;
const serverUrl = argv.server.startsWith('http') ? argv.server : `http://${argv.server}`;
const wsUrl = serverUrl.replace(/^http/, 'ws') + '/ws';

console.log('Connecting to WebSocket server...');

const ws = new WebSocket(wsUrl, {
  headers: {
    'Origin': serverUrl
  }
});

ws.on('open', () => {
  const publicUrl = `${serverUrl}/${port}`;
  console.log('\n🚀 Connected successfully!');
  console.log(`📡 Your public URL: ${publicUrl}\n`);
  
  // Send port information to the server
  ws.send(JSON.stringify({ port }));
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
  ws.close();
  process.exit(0);
});
