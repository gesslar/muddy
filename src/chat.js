const WebSocket = require('ws');
const ClientFactory = require('./clientFactory');
const { OPCODES, HEARTBEAT } = require('./include/constants');

function handleWebSocketConnection(ws) {
    console.log("New client connected");

    // Send a "HELLO" frame with other connected clients and the heartbeat interval
    sendHelloFrame(ws);

    // Initialize heartbeat tracking
    ws.missedHeartbeats = 0;

    // Set up heartbeat mechanism to check if the client missed too many heartbeats
    const heartbeatCheck = setInterval(() => {
        if (ws.missedHeartbeats >= HEARTBEAT.MAX_MISSED) {
            console.log(`Client ${ws.identifier} missed too many heartbeats, disconnecting`);
            ws.terminate();
        }
    }, HEARTBEAT.INTERVAL); // Use the interval as is

    ws.on('message', (message) => {
        console.info('Received message:', message); // Log incoming message
        try {
            const parsedMessage = JSON.parse(message);
            const { op, d } = parsedMessage;

            switch (op) {
                case OPCODES.IDENTIFY:
                    console.info('Handling IDENTIFY:', d); // Log IDENTIFY message
                    const client = ClientFactory.createClient(ws, d.identifier);
                    console.log(`Client identified as: ${client.identifier}`);
                    break;

                case OPCODES.JOIN_CHANNEL:
                    console.info('Handling JOIN_CHANNEL:', d); // Log JOIN_CHANNEL message
                    const joinClient = ClientFactory.getClient(d.identifier);
                    if (joinClient) {
                        joinClient.joinChannel(d.channel);
                        console.log(`Client ${joinClient.identifier} joined channel: ${d.channel}`);
                    }
                    break;

                case OPCODES.LEAVE_CHANNEL:
                    console.info('Handling LEAVE_CHANNEL:', d); // Log LEAVE_CHANNEL message
                    const leaveClient = ClientFactory.getClient(d.identifier);
                    if (leaveClient) {
                        leaveClient.leaveChannel(d.channel);
                        console.log(`Client ${leaveClient.identifier} left channel: ${d.channel}`);
                    }
                    break;

                case OPCODES.SEND_MESSAGE:
                    console.info('Handling SEND_MESSAGE:', d); // Log SEND_MESSAGE message
                    const sendClient = ClientFactory.getClient(d.identifier);
                    if (sendClient && sendClient.channels.includes(d.channel)) {
                        ClientFactory.getAllClients().forEach(client => {
                            if (client.channels.includes(d.channel)) {
                                const receiveMessagePayload = {
                                    op: OPCODES.RECEIVE_MESSAGE,
                                    d: { channel: d.channel, message: d.message }
                                };
                                console.info('Sending RECEIVE_MESSAGE:', receiveMessagePayload);
                                client.send(JSON.stringify(receiveMessagePayload));
                            }
                        });
                    }
                    break;

                case OPCODES.HEARTBEAT:
                    console.info('Received HEARTBEAT'); // Log HEARTBEAT message
                    ws.missedHeartbeats = 0;
                    const heartbeatAckPayload = { op: OPCODES.HEARTBEAT_ACK };
                    console.info('Sending HEARTBEAT_ACK:', heartbeatAckPayload);
                    ws.send(JSON.stringify(heartbeatAckPayload));
                    break;

                default:
                    const errorPayload = { op: 'ERROR', d: { message: 'Unknown opcode' } };
                    console.info('Sending ERROR:', errorPayload);
                    ws.send(JSON.stringify(errorPayload));
            }
        } catch (error) {
            console.error('Error processing message:', error);
            const errorPayload = { op: 'ERROR', d: { message: 'Invalid message format' } };
            console.info('Sending ERROR:', errorPayload);
            ws.send(JSON.stringify(errorPayload));
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

    const helloPayload = {
        op: OPCODES.HELLO,
        d: {
            connectedClients,
            heartbeat_interval: HEARTBEAT.INTERVAL / 1000.0 // Send as a float representation
        }
    };

    console.info('Sending HELLO frame:', helloPayload);
    ws.send(JSON.stringify(helloPayload));
}

module.exports = { handleWebSocketConnection };
