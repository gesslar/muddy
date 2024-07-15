const OPCODES = {
    DISPATCH: 0x00,
    HEARTBEAT: 0x01,
    IDENTIFY: 0x02,
    JOIN_CHANNEL: 0x03,
    LEAVE_CHANNEL: 0x04,
    HELLO: 0x0A,
    HEARTBEAT_ACK: 0x0B
};

const EVENTS = {
    MESSAGE_CREATE: "MESSAGE_CREATE",
    ECHO: "ECHO"
};

const HEARTBEAT = {
    INTERVAL: 45000, // 45 seconds in milliseconds
    MAX_MISSED: 3
};

module.exports = {
    OPCODES,
    EVENTS,
    HEARTBEAT
};
