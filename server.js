const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

let lobbyState = {
    players: {},
    gameStarted: false
};

const CORNER_SPAWNS = [
    { x: -18, z: 18 },
    { x: 18, z: 18 },
    { x: -18, z: -18 },
    { x: 18, z: -18 }
];

io.on('connection', (socket) => {
    let assignedSlot = null;
    let usedSlots = Object.values(lobbyState.players).map(p => p.slot);
    for (let i = 1; i <= 4; i++) {
        if (!usedSlots.includes(i)) {
            assignedSlot = i;
            break;
        }
    }

    if (!assignedSlot || lobbyState.gameStarted) {
        socket.emit('lobby_full');
        socket.disconnect();
        return;
    }

    lobbyState.players[socket.id] = {
        id: socket.id,
        slot: assignedSlot,
        ready: false,
        x: CORNER_SPAWNS[assignedSlot - 1].x,
        z: CORNER_SPAWNS[assignedSlot - 1].z,
        y: 3.0,
        yaw: 0,
        pitch: 0,
        health: 3,
        isDowned: false,
        reviveProgress: 0
    };

    io.emit('update_lobby', lobbyState);

    socket.on('set_ready', (isReady) => {
        if (lobbyState.players[socket.id]) {
            lobbyState.players[socket.id].ready = isReady;
            let allPlayers = Object.values(lobbyState.players);
            let allReady = allPlayers.length > 0 && allPlayers.every(p => p.ready);

            if (allReady && !lobbyState.gameStarted) {
                lobbyState.gameStarted = true;
                io.emit('start_game', lobbyState.players);
            } else {
                io.emit('update_lobby', lobbyState);
            }
        }
    });

    socket.on('player_move', (data) => {
        if (lobbyState.players[socket.id]) {
            let p = lobbyState.players[socket.id];
            p.x = data.x;
            p.y = data.y;
            p.z = data.z;
            p.yaw = data.yaw;
            p.pitch = data.pitch;
            socket.broadcast.emit('remote_player_moved', p);
        }
    });

    socket.on('player_shot', (data) => {
        socket.broadcast.emit('remote_player_shot', data);
    });

    socket.on('revive_progress', (targetId) => {
        if (lobbyState.players[targetId] && lobbyState.players[targetId].isDowned) {
            lobbyState.players[targetId].reviveProgress += 0.05;
            if (lobbyState.players[targetId].reviveProgress >= 1.0) {
                lobbyState.players[targetId].isDowned = false;
                lobbyState.players[targetId].health = 1;
                lobbyState.players[targetId].reviveProgress = 0;
            }
            io.emit('update_players_state', lobbyState.players);
        }
    });

    socket.on('disconnect', () => {
        delete lobbyState.players[socket.id];
        if (Object.keys(lobbyState.players).length === 0) {
            lobbyState.gameStarted = false;
        }
        io.emit('update_lobby', lobbyState);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
