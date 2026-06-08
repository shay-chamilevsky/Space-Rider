const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 3000;

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  // Handle POST /shutdown endpoint
  if (req.method === 'POST' && req.url === '/shutdown') {
    console.log('Shutdown signal received. Gracefully terminating server...');
    res.writeHead(200, { 
      'Content-Type': 'text/plain', 
      'Access-Control-Allow-Origin': '*' 
    });
    res.end('Server shutting down');
    
    // Graceful delay before termination
    setTimeout(() => {
      process.exit(0);
    }, 150);
    return;
  }

  // Handle preflight requests for CORS (especially if beacon makes a CORS preflight)
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  // Serve static files
  if (req.method === 'GET') {
    let filePath = req.url === '/' ? '/index.html' : req.url;
    // Strip query strings or hash parameters
    filePath = filePath.split('?')[0].split('#')[0];
    
    const absolutePath = path.join(__dirname, filePath);

    // Directory traversal security check
    if (!absolutePath.startsWith(__dirname)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('403 Forbidden');
      return;
    }

    fs.stat(absolutePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
      }

      const ext = path.extname(absolutePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, { 
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      });

      const readStream = fs.createReadStream(absolutePath);
      readStream.on('error', (streamErr) => {
        console.error("Stream read error:", streamErr);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('500 Internal Server Error');
        }
      });
      readStream.pipe(res);
    });
  } else {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('405 Method Not Allowed');
  }
});

server.listen(PORT, () => {
  console.log(`Space Rider local server active at http://localhost:${PORT}`);
  
  // Cross-platform browser launch
  let startCmd;
  switch (process.platform) {
    case 'darwin':
      startCmd = 'open';
      break;
    case 'win32':
      startCmd = 'start';
      break;
    default:
      startCmd = 'xdg-open';
  }

  console.log(`Opening browser to http://localhost:${PORT} using platform command: ${startCmd}`);
  
  // Execute open command
  exec(`${startCmd} http://localhost:${PORT}`, (err) => {
    if (err) {
      console.error(`Could not auto-launch browser: ${err.message}`);
    }
  });
});
