function notifyClientsAndShutdown(wss, server) {
    const shutdown = () => {
        console.log('Server is shutting down. Notifying clients...');
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send('Server is shutting down. Please reconnect later.');
            }
        });

        setTimeout(() => {
            server.close(() => {
                console.log('HTTP server closed');
                process.exit(0);
            });
        }, 1000); // Adjust the timeout as needed
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('beforeExit', shutdown);
}

module.exports = { handleShutdown: notifyClientsAndShutdown };
