const WebSocket = require('ws');
const ClientFactory = require('./clientFactory');
const { OPCODES, HEARTBEAT } = require('./include/constants');

function handleWebSocketConnection(ws) {
    console.log("New client connected");

    // Send a "HELLO" frame with other connected clients and the heartbeat interval
    sendHelloFrame(ws);

    // Initialize heartbeat tracking
    ws.missedHeartbeats = 0;

    // Set up heartbeat mechanism
    const heartbeatCheck = setInterval(() => {
        if (ws.missedHeartbeats >= HEARTBEAT.MAX_MISSED) {
            console.log(`Client ${ws.identifier} missed too many heartbeats, disconnecting`);
            ws.terminate();
        } else {
            ws.send(JSON.stringify({ op: OPCODES.HEARTBEAT }));
            ws.missedHeartbeats++;
        }
    }, HEARTBEAT.INTERVAL); // Use the interval as is

    ws.on('message', (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            const { op, d } = parsedMessage;

            switch (op) {
                case OPCODES.IDENTIFY:
                    const client = ClientFactory.createClient(ws, d.identifier);
                    console.log(`Client identified as: ${client.identifier}`);
                    break;

                case OPCODES.JOIN_CHANNEL:
                    const joinClient = ClientFactory.getClient(d.identifier);
                    if (joinClient) {
                        joinClient.joinChannel(d.channel);
                        console.log(`Client ${joinClient.identifier} joined channel: ${d.channel}`);
                    }
                    break;

                case OPCODES.LEAVE_CHANNEL:
                    const leaveClient = ClientFactory.getClient(d.identifier);
                    if (leaveClient) {
                        leaveClient.leaveChannel(d.channel);
                        console.log(`Client ${leaveClient.identifier} left channel: ${d.channel}`);
                    }
                    break;

                case OPCODES.SEND_MESSAGE:
                    const sendClient = ClientFactory.getClient(d.identifier);
                    if (sendClient && sendClient.channels.includes(d.channel)) {
                        ClientFactory.getAllClients().forEach(client => {
                            if (client.channels.includes(d.channel)) {
                                client.send({
                                    op: OPCODES.RECEIVE_MESSAGE,
                                    d: { channel: d.channel, message: d.message }
                                });
                            }
                        });
                    }
                    break;

                case OPCODES.HEARTBEAT:
                    ws.missedHeartbeats = 0;
                    ws.send(JSON.stringify({ op: OPCODES.HEARTBEAT_ACK }));
                    break;

                default:
                    ws.send(JSON.stringify({ op: 'ERROR', d: { message: 'Unknown opcode' } }));
            }
        } catch (error) {
            console.error('Error processing message:', error);
            ws.send(JSON.stringify({ op: 'ERROR', d: { message: 'Invalid message format' } }));
        }
    });

    ws.on('close', () => {
        clearInterval(heartbeatCheck);
        const client = ClientFactory.getClient(ws.identifier);
        if (client) {
            console.log(`Client ${client.identifier} disconnected`);
            ClientFactory.removeClient(client.identifier);
        }
    });
}

function sendHelloFrame(ws) {
    const connectedClients = Object.keys(ClientFactory.clients).map(id => ({
        identifier: id,
        channels: ClientFactory.clients[id].channels
    }));

    ws.send(JSON.stringify({
        op: OPCODES.HELLO,
        d: {
            connectedClients,
            heartbeat_interval: HEARTBEAT.INTERVAL / 1000.0
        }
    }));
}

module.exports = { handleWebSocketConnection };
