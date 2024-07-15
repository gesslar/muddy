const WebSocket = require("ws");

const server = new WebSocket.Server({ port: 8080 });

// Store clients and their subscribed channels
const clients = {};

server.on("connection", (ws) => {
  console.log("New client connected");

  // Send a "HELLO" frame with other connected muds
  sendHelloFrame(ws);

  // Implement heartbeat mechanism
  let isAlive = true;
  ws.on("pong", () => {
    isAlive = true;
  });

  const heartbeatInterval = setInterval(() => {
    if (!isAlive) {
      return ws.terminate();
    }
    isAlive = false;
    ws.ping();
  }, 30000); // Send heartbeat every 30 seconds

  ws.on("message", (message) => {
    try {
      const parsedMessage = JSON.parse(message);
      const { opcode, data } = parsedMessage;

      // Handle message based on opcode
      switch (opcode) {
        case 'IDENTIFY':
          // Identify the client with a unique identifier
          ws.identifier = data.identifier;
          clients[ws.identifier] = { ws, channels: [] };
          console.log(`Client identified as: ${ws.identifier}`);
          break;

        case 'JOIN_CHANNEL':
          // Join the specified channel
          if (ws.identifier) {
            const channel = data.channel;
            if (!clients[ws.identifier].channels.includes(channel)) {
              clients[ws.identifier].channels.push(channel);
              console.log(`Client ${ws.identifier} joined channel: ${channel}`);
            }
          } else {
            sendErrorAndClose(ws, 4000, 'Client not identified');
          }
          break;

        case 'LEAVE_CHANNEL':
          // Leave the specified channel
          if (ws.identifier) {
            const channel = data.channel;
            clients[ws.identifier].channels = clients[ws.identifier].channels.filter(ch => ch !== channel);
            console.log(`Client ${ws.identifier} left channel: ${channel}`);
          } else {
            sendErrorAndClose(ws, 4000, 'Client not identified');
          }
          break;

        case 'SEND_MESSAGE':
          // Broadcast the message to all clients in the specified channel
          const channel = data.channel;
          const messageData = data.message;
          if (ws.identifier && clients[ws.identifier].channels.includes(channel)) {
            Object.values(clients).forEach(client => {
              if (client.channels.includes(channel) && client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(JSON.stringify({
                  opcode: 'RECEIVE_MESSAGE',
                  data: { channel, message: messageData }
                }));
              }
            });
          } else {
            sendErrorAndClose(ws, 4001, 'Client not in channel or not identified');
          }
          break;

        default:
          sendErrorAndClose(ws, 4002, 'Unknown opcode');
      }
    } catch (error) {
      console.error('Error processing message:', error);
      sendErrorAndClose(ws, 4003, 'Invalid message format');
    }
  });

  ws.on("close", (code, reason) => {
    clearInterval(heartbeatInterval);
    if (ws.identifier) {
      console.log(`Client ${ws.identifier} disconnected with code ${code} and reason ${reason}`);
      delete clients[ws.identifier];
    }
    // Respond with a close code indicating closed by client
    ws.close(1000, 'Closed by client');
  });
});

console.log("WebSocket server is running on port 8080");

function sendErrorAndClose(ws, code, message) {
  ws.close(code, message);
}

function sendHelloFrame(ws) {
  const connectedMuds = Object.keys(clients).map(id => ({
    identifier: id,
    channels: clients[id].channels
  }));

  ws.send(JSON.stringify({
    opcode: 'HELLO',
    data: { connectedMuds }
  }));
}
