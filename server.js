const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const crypto = require('crypto');

class TerrorGameServer {
    constructor(port = 8080) {
        this.port = port;
        this.players = new Map();
        this.enemies = new Map();
        
        // Configuración del sistema de autenticación
        this.usersFilePath = path.join(__dirname, 'data', 'users.json');
        this.setupServer();
    }

    // Métodos para el sistema de autenticación
    readUsers() {
        try {
            // Crear directorio data si no existe
            if (!fs.existsSync(path.dirname(this.usersFilePath))) {
                fs.mkdirSync(path.dirname(this.usersFilePath));
            }
            
            // Crear archivo users.json si no existe
            if (!fs.existsSync(this.usersFilePath)) {
                fs.writeFileSync(this.usersFilePath, '[]', 'utf8');
                return [];
            }
            
            const data = fs.readFileSync(this.usersFilePath, 'utf8');
            return JSON.parse(data);
        } catch (err) {
            console.error('Error leyendo usuarios:', err);
            return [];
        }
    }

    writeUsers(users) {
        fs.writeFileSync(this.usersFilePath, JSON.stringify(users, null, 2), 'utf8');
    }

    hashPassword(password) {
        return crypto.createHash('sha256').update(password).digest('hex');
    }

    setupServer() {
        const app = express();
        
        // Middlewares
        app.use(express.static('public'));
        app.use(bodyParser.urlencoded({ extended: false }));
        app.use(bodyParser.json());

        // Rutas de autenticación
        app.post('/api/register', (req, res) => {
            const { username, email, password } = req.body;
            const users = this.readUsers();

            if (!username || !email || !password) {
                return res.status(400).json({ error: 'Todos los campos son requeridos' });
            }

            if (users.some(user => user.username === username)) {
                return res.status(400).json({ error: 'El usuario ya existe' });
            }

            if (users.some(user => user.email === email)) {
                return res.status(400).json({ error: 'El email ya está registrado' });
            }

            const newUser = {
                id: Date.now().toString(),
                username,
                email,
                password: this.hashPassword(password),
                createdAt: new Date().toISOString()
            };

            users.push(newUser);
            this.writeUsers(users);

            res.json({ success: true, message: 'Registro exitoso' });
        });

        app.post('/api/login', (req, res) => {
            const { username, password } = req.body;
            const users = this.readUsers();

            const user = users.find(u => u.username === username && u.password === this.hashPassword(password));

            if (!user) {
                return res.status(401).json({ error: 'Credenciales inválidas' });
            }

            res.json({ 
                success: true, 
                message: 'Login exitoso', 
                user: { 
                    id: user.id,
                    username: user.username,
                    email: user.email
                } 
            });
        });

        // Rutas para páginas de autenticación
        app.get('/login', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'auth', 'login.html'));
        });

        app.get('/register', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'auth', 'register.html'));
        });

        app.get('/welcome', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'auth', 'welcome.html'));
        });

        // Crear servidor HTTP
        const server = http.createServer(app);

        // Crear servidor WebSocket
        this.wss = new WebSocket.Server({ server });
        
        this.wss.on('connection', (ws, req) => {
            console.log('🎮 Nueva conexión establecida');
            this.handleConnection(ws, req);
        });

        // Manejar rutas no encontradas
        app.use((req, res) => {
            this.handleHttpRequest(req, res);
        });

        server.listen(this.port, () => {
            console.log(`🚀 Servidor Terror Room iniciado`);
            console.log(`🌐 URL: http://localhost:${this.port}`);
            console.log(`🔗 WebSocket: ws://localhost:${this.port}`);
            console.log(`🔐 Sistema de autenticación activo`);
            console.log(`📊 Para ver estadísticas presiona Ctrl+C`);
        });
    }

    // Resto de los métodos existentes (handleHttpRequest, handleConnection, etc.)
    // ... (mantén todo el resto del código igual hasta el final)
    handleHttpRequest(req, res) {
        let filePath = req.url === '/' ? '/index.html' : req.url;
        
        // Buscar en carpeta public primero
        const publicPath = path.join(__dirname, 'public', filePath);
        const rootPath = path.join(__dirname, filePath);
        
        let actualPath = fs.existsSync(publicPath) ? publicPath : rootPath;

        if (!fs.existsSync(actualPath)) {
            res.writeHead(404, {'Content-Type': 'text/html'});
            res.end(`
                <h1>Terror Room Server</h1>
                <p>Servidor funcionando correctamente ✅</p>
                <p>Coloca tu archivo HTML del juego en la carpeta del proyecto o en /public/</p>
                <p>Jugadores conectados: ${this.players.size}</p>
                <p>Enemigos activos: ${this.enemies.size}</p>
            `);
            return;
        }

        const ext = path.extname(actualPath);
        const contentType = {
            '.html': 'text/html',
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.json': 'application/json'
        }[ext] || 'text/plain';

        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(actualPath).pipe(res);
    }

    handleConnection(ws, req) {
        ws.playerId = null;
        ws.playerName = null;
        ws.room = 1;
        ws.isAlive = true;

        // Heartbeat
        ws.on('pong', () => {
            ws.isAlive = true;
        });

        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data);
                this.handleMessage(ws, message);
            } catch (error) {
                console.error('❌ Error procesando mensaje:', error);
            }
        });

        ws.on('close', () => {
            this.handleDisconnection(ws);
        });

        ws.on('error', (error) => {
            console.error('❌ Error WebSocket:', error);
        });
    }

    handleMessage(ws, message) {
        switch (message.type) {
            case 'join':
                this.handlePlayerJoin(ws, message);
                break;
            case 'playerMove':
                this.handlePlayerMove(ws, message);
                break;
            case 'enemySpawned':
                this.handleEnemySpawned(ws, message);
                break;
            case 'enemyDefeated':
                this.handleEnemyDefeated(ws, message);
                break;
            case 'chatMessage':
                this.handleChatMessage(ws, message);
                break;
            case 'ping':
                this.sendToPlayer(ws, { type: 'pong' });
                break;
            case 'roomChange':
                this.handleRoomChange(ws, message);
                break;
        }
    }

    handlePlayerJoin(ws, message) {
        ws.playerId = message.playerId;
        ws.playerName = message.playerName;
        ws.room = message.room || 1;

        const playerData = {
            playerId: message.playerId,
            playerName: message.playerName,
            position: message.position,
            room: ws.room,
            health: 100,
            keys: 0,
            ws: ws
        };

        this.players.set(message.playerId, playerData);
        console.log(`👤 ${message.playerName} se unió al juego (Sala ${ws.room})`);

        // Enviar jugadores existentes al nuevo jugador
        this.sendToPlayer(ws, {
            type: 'playersList',
            players: Array.from(this.players.values())
                .filter(p => p.room === ws.room && p.playerId !== message.playerId)
                .map(p => ({
                    playerId: p.playerId,
                    playerName: p.playerName,
                    position: p.position
                }))
        });

        // Notificar a otros jugadores
        this.broadcastToRoom(ws.room, {
            type: 'playerJoined',
            playerId: message.playerId,
            playerName: message.playerName,
            position: message.position
        }, message.playerId);

        // Enviar enemigos existentes
        Array.from(this.enemies.values())
            .filter(enemy => enemy.room === ws.room)
            .forEach(enemy => {
                this.sendToPlayer(ws, {
                    type: 'enemySpawned',
                    enemyId: enemy.enemyId,
                    position: enemy.position,
                    enemyType: enemy.type
                });
            });
    }

    handlePlayerMove(ws, message) {
        const player = this.players.get(message.playerId);
        if (player) {
            player.position = message.position;
            
            this.broadcastToRoom(player.room, {
                type: 'playerMove',
                playerId: message.playerId,
                position: message.position
            }, message.playerId);
        }
    }

    handleEnemySpawned(ws, message) {
        const enemyData = {
            enemyId: message.enemyId,
            position: message.position,
            type: message.enemyType,
            room: message.room || ws.room,
            spawnedBy: ws.playerId
        };

        this.enemies.set(message.enemyId, enemyData);

        this.broadcastToRoom(enemyData.room, {
            type: 'enemySpawned',
            enemyId: message.enemyId,
            position: message.position,
            enemyType: message.enemyType
        });

        console.log(`👹 Enemigo ${message.enemyType} spawneado en sala ${enemyData.room}`);
    }

    handleEnemyDefeated(ws, message) {
        const enemy = this.enemies.get(message.enemyId);
        if (enemy) {
            this.enemies.delete(message.enemyId);

            this.broadcastToRoom(enemy.room, {
                type: 'enemyDefeated',
                enemyId: message.enemyId,
                defeatedBy: ws.playerName
            });

            console.log(`💀 Enemigo derrotado por ${ws.playerName}`);
        }
    }

    handleChatMessage(ws, message) {
        const player = this.players.get(ws.playerId);
        if (player) {
            console.log(`💬 [Sala ${player.room}] ${message.playerName}: ${message.message}`);
            
            this.broadcastToRoom(player.room, {
                type: 'chatMessage',
                playerId: message.playerId,
                playerName: message.playerName,
                message: message.message
            }, message.playerId);
        }
    }

    handleRoomChange(ws, message) {
        const player = this.players.get(ws.playerId);
        if (player) {
            const oldRoom = player.room;
            player.room = message.room;
            ws.room = message.room;

            this.broadcastToRoom(oldRoom, {
                type: 'playerLeft',
                playerId: ws.playerId,
                playerName: ws.playerName
            }, ws.playerId);

            this.broadcastToRoom(message.room, {
                type: 'playerJoined',
                playerId: ws.playerId,
                playerName: ws.playerName,
                position: player.position
            }, ws.playerId);

            console.log(`🚪 ${ws.playerName}: Sala ${oldRoom} → Sala ${message.room}`);
        }
    }

    handleDisconnection(ws) {
        if (ws.playerId) {
            const player = this.players.get(ws.playerId);
            if (player) {
                this.broadcastToRoom(player.room, {
                    type: 'playerLeft',
                    playerId: ws.playerId,
                    playerName: ws.playerName
                }, ws.playerId);

                this.players.delete(ws.playerId);
                console.log(`👋 ${ws.playerName} se desconectó`);
            }
        }
    }

    sendToPlayer(ws, message) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }

    broadcastToRoom(room, message, excludePlayerId = null) {
        this.players.forEach(player => {
            if (player.room === room && player.playerId !== excludePlayerId) {
                this.sendToPlayer(player.ws, message);
            }
        });
    }

    startHeartbeat() {
        setInterval(() => {
            this.wss.clients.forEach(ws => {
                if (!ws.isAlive) {
                    return ws.terminate();
                }
                ws.isAlive = false;
                ws.ping();
            });
        }, 30000);
    }

    getStats() {
        const rooms = {};
        this.players.forEach(player => {
            rooms[player.room] = (rooms[player.room] || 0) + 1;
        });

        return {
            players: this.players.size,
            enemies: this.enemies.size,
            rooms: rooms
        };
    }


}

// Iniciar servidor
const port = process.env.PORT || 8080;
const server = new TerrorGameServer(port);
server.startHeartbeat();

// Mostrar estadísticas cada 30 segundos
setInterval(() => {
    const stats = server.getStats();
    if (stats.players > 0) {
        console.log(`📊 ${stats.players} jugadores conectados, ${stats.enemies} enemigos activos`);
        Object.entries(stats.rooms).forEach(([room, count]) => {
            console.log(`   Sala ${room}: ${count} jugadores`);
        });
    }
}, 30000);

// Manejo de cierre
process.on('SIGINT', () => {
    console.log('\n🛑 Cerrando servidor...');
    process.exit(0);
});