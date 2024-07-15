const OPCODES = {
    DISPATCH: 0x00,
    HEARTBEAT: 0x01,
    IDENTIFY: 0x02,
    JOIN_CHANNEL: 0x03,
    LEAVE_CHANNEL: 0x04,
    SEND_MESSAGE: 0x05,
    RECEIVE_MESSAGE: 0x06,
    HELLO: 0x0A,
    HEARTBEAT_ACK: 0x0B
};

const HEARTBEAT = {
    INTERVAL: 45000.0, // 45.0 seconds
    MAX_MISSED: 3
};

module.exports = {
    OPCODES,
    HEARTBEAT
};
