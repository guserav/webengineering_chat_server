const HTTP_SERVER_PORT = 8080;

const config = require('./src/config.js');
const WebSocketServer = require('websocket').server;
const http = require('http');
const websocketLogic = require('./src/websockets');
const mysql      = require('mysql');

// Initiate Database
const pool = mysql.createPool(config.database);
if(!pool) console.error(new Date() + "Failed to establish database connection!");
// TODO check if database is ready

const server = http.createServer(function(request, response) {
    console.log((new Date()) + ' Received request for ' + request.url);
    response.writeHead(404);
    response.end();
});
server.listen(HTTP_SERVER_PORT, function() {
    const host = server.address().address;
    const port = server.address().port;
    console.log((new Date()) + ' Server is running on ' + host + ' and listening on port ' + port);
});



// Websocket initiation
websocketLogic.setDatabaseConnectionPool(pool);
wsServer = new WebSocketServer({
    httpServer: server,
    autoAcceptConnections: false
});

function isRequestAllowed(request) {
    console.log(new Date() + ' Origin auto accepted: ', request.origin);
    // TODO maybe add logic here
    return true;
}

wsServer.on('request', function(request) {
    if (!isRequestAllowed(request)) { //Deny non allowed origins
        request.reject();
        console.log((new Date()) + ' Connection from ', request.origin, ' rejected.');
        return;
    }

    let connection = request.accept(null, request.origin); //TODO maybe specify protocol
    console.log((new Date()) + ' Connection accepted.');
    websocketLogic.setupConnection(connection);
});
