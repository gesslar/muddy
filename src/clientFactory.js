// clientFactory.js

class Client {
    constructor(ws, identifier) {
        this.ws = ws;
        this.identifier = identifier;
        this.channels = [];
        this.isAlive = true;
    }

    send(message) {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }

    joinChannel(channel) {
        if (!this.channels.includes(channel)) {
            this.channels.push(channel);
        }
    }

    leaveChannel(channel) {
        this.channels = this.channels.filter(ch => ch !== channel);
    }
}

class ClientFactory {
    constructor() {
        this.clients = {};
    }

    createClient(ws, identifier) {
        const client = new Client(ws, identifier);
        this.clients[identifier] = client;
        return client;
    }

    getClient(identifier) {
        return this.clients[identifier];
    }

    removeClient(identifier) {
        delete this.clients[identifier];
    }

    getAllClients() {
        return Object.values(this.clients);
    }
}

module.exports = new ClientFactory();
