const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const httpProxy = require('http-proxy');
const crypto = require('crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/devshare', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

// User Schema
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Enable CORS for the CLI client
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  next();
});

// Create HTTP server
const server = http.createServer(app);

const wss = new WebSocket.Server({ noServer: true });
const proxy = httpProxy.createProxyServer({
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
        clientSubdomain = generateSubdomain();
        clients.set(clientSubdomain, {
          ws,
          port: data.port
        });

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

// Auth routes
app.post('/api/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = new User({
      email,
      password: hashedPassword
    });

    await user.save();

    const token = jwt.sign(
      { userId: user._id, email: user.email },
      'your_jwt_secret',
      { expiresIn: '30d' }
    );

    res.status(201).json({ 
      token,
      message: 'Registration successful'
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email },
      'your_jwt_secret',
      { expiresIn: '30d' }
    );

    res.json({ 
      token,
      message: 'Login successful'
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Handle HTTP requests for tunneling
app.use((req, res) => {
  const hostname = req.hostname;
  const subdomain = hostname.split('.')[0];
  
  const client = clients.get(subdomain);
  if (!client) {
    return res.status(404).send('No client connected for this subdomain');
  }

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  client.ws.send(JSON.stringify({
    type: 'request',
    method: req.method,
    path: req.url
  }));

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

const PORT = process.env.PORT || 443;
server.listen(PORT, () => {
  console.log(`DevShare server running on port ${PORT}`);
});
