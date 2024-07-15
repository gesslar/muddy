const { setupServer } = require('./setup');
const { handleShutdown } = require('./shutdown');
const { handleWebSocketConnection } = require('./chat');

// Set up the WebSocket server
const { wss, server } = setupServer();

wss.on('connection', handleWebSocketConnection);

console.log('WebSocket server is listening on ws://localhost:8080');

// Handle server shutdown
handleShutdown(wss, server);
