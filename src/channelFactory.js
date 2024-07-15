class Channel {
    constructor(name) {
        this.name = name;
        this.clients = [];
    }

    addClient(client) {
        if (!this.clients.includes(client)) {
            this.clients.push(client);
        }
    }

    removeClient(client) {
        this.clients = this.clients.filter(c => c !== client);
    }

    getClients() {
        return this.clients;
    }
}

class ChannelFactory {
    constructor() {
        this.channels = {};
    }

    createChannel(name) {
        if (!this.channels[name]) {
            this.channels[name] = new Channel(name);
        }
        return this.channels[name];
    }

    getChannel(name) {
        return this.channels[name];
    }

    removeChannel(name) {
        delete this.channels[name];
    }

    channelExists(name) {
        return !!this.channels[name];
    }

    getAllChannels() {
        return Object.keys(this.channels);
    }
}

module.exports = new ChannelFactory();
