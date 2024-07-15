const WebSocket = require('ws');
const ClientFactory = require('./clientFactory');
const ChannelFactory = require('./channelFactory');
const { OPCODES, EVENTS, HEARTBEAT } = require('./include/constants');

function handleWebSocketConnection(ws) {
    console.log("New client connected");

    // Send a "HELLO" frame with other connected clients and the heartbeat interval
    sendHelloFrame(ws);

    // Initialize heartbeat tracking
    ws.missedHeartbeats = 0;

    // Set up a mechanism to check if the client missed too many heartbeats
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
                    ws.identifier = d.identifier; // Set ws.identifier
                    const client = ClientFactory.createClient(ws, d.identifier);
                    console.log(`Client identified as: ${client.identifier}`);

                    // Handle initial channel subscriptions
                    if (Array.isArray(d.channels)) {
                        d.channels.forEach(channelName => {
                            const channel = ChannelFactory.createChannel(channelName);
                            channel.addClient(client);
                            client.channels.push(channelName);
                            console.log(`Client ${client.identifier} joined channel: ${channelName}`);
                        });
                    }
                    break;

                case OPCODES.JOIN_CHANNEL:
                    console.info('Handling JOIN_CHANNEL:', d); // Log JOIN_CHANNEL message
                    const joinClient = ClientFactory.getClient(d.identifier);
                    if (joinClient) {
                        const channel = ChannelFactory.createChannel(d.channel);
                        channel.addClient(joinClient);
                        joinClient.channels.push(d.channel);
                        console.log(`Client ${joinClient.identifier} joined channel: ${d.channel}`);
                    }
                    break;

                case OPCODES.LEAVE_CHANNEL:
                    console.info('Handling LEAVE_CHANNEL:', d); // Log LEAVE_CHANNEL message
                    const leaveClient = ClientFactory.getClient(d.identifier);
                    if (leaveClient) {
                        const channel = ChannelFactory.getChannel(d.channel);
                        if (channel) {
                            channel.removeClient(leaveClient);
                            leaveClient.channels = leaveClient.channels.filter(c => c !== d.channel);
                            console.log(`Client ${leaveClient.identifier} left channel: ${d.channel}`);
                            if (channel.getClients().length === 0) {
                                ChannelFactory.removeChannel(d.channel);
                                console.log(`Channel ${d.channel} removed as it has no clients.`);
                            }
                        }
                    }
                    break;

                case OPCODES.DISPATCH:
                    console.info('Handling DISPATCH:', d); // Log DISPATCH message
                    const sendClient = ClientFactory.getClient(ws.identifier); // Use ws.identifier
                    if (!sendClient) {
                        console.log(`Client not found: ${ws.identifier}`);
                    } else if (!sendClient.channels.includes(d.channel)) {
                        console.log(`Client ${ws.identifier} is not in channel: ${d.channel}`);
                    } else {
                        const channel = ChannelFactory.getChannel(d.channel);
                        if (channel) {
                            channel.getClients().forEach(client => {
                                if (client !== sendClient) {
                                    const receiveMessagePayload = {
                                        op: OPCODES.DISPATCH,
                                        t: EVENTS.MESSAGE_CREATE,
                                        d: {
                                            channel: d.channel,
                                            message: d.message,
                                            talker: d.talker,
                                            identifier: ws.identifier // Include the identifier of the originating client
                                        }
                                    };
                                    console.info('Sending MESSAGE_CREATE to client:', receiveMessagePayload);
                                    client.ws.send(JSON.stringify(receiveMessagePayload));
                                }
                            });

                            if (d.echo === 1) {
                                const echoPayload = {
                                    op: OPCODES.DISPATCH,
                                    t: EVENTS.ECHO,
                                    d: {
                                        channel: d.channel,
                                        message: d.message,
                                        talker: d.talker
                                    }
                                };
                                console.info('Sending ECHO to originating client:', echoPayload);
                                ws.send(JSON.stringify(echoPayload));
                            }
                        }
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
        if (ws.identifier) {
            console.log(`Client ${ws.identifier} disconnected`);
            const client = ClientFactory.getClient(ws.identifier);
            if (client) {
                client.channels.forEach(channelName => {
                    const channel = ChannelFactory.getChannel(channelName);
                    if (channel) {
                        channel.removeClient(client);
                        if (channel.getClients().length === 0) {
                            ChannelFactory.removeChannel(channelName);
                            console.log(`Channel ${channelName} removed as it has no clients.`);
                        }
                    }
                });
            }
            ClientFactory.removeClient(ws.identifier); // Remove the client from ClientFactory
        }
    });
}

function sendHelloFrame(ws) {
    const connectedClients = Object.keys(ClientFactory.clients).map(id => ({
        identifier: id,
        channels: ClientFactory.clients[id].channels
    }));

    const channels = ChannelFactory.getAllChannels();

    const helloPayload = {
        op: OPCODES.HELLO,
        d: {
            connectedClients,
            channels,
            heartbeat_interval: HEARTBEAT.INTERVAL / 1000.0 // Send as a float representation
        }
    };

    console.info('Sending HELLO frame:', helloPayload);
    ws.send(JSON.stringify(helloPayload));
}

module.exports = { handleWebSocketConnection };
