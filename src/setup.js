const http = require('http');
const WebSocket = require('ws');

function setupServer() {
    const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Hello World\n');
    });

    const wss = new WebSocket.Server({ server });

    server.listen(8080, () => {
        console.log('HTTP server is listening on http://localhost:8080');
    });

    return { wss, server };
}

module.exports = { setupServer };
