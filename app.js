const config = require('./src/config.js');
const WebSocketServer = require('websocket').server;
const http = require('http');
const websocketLogic = require('./src/websockets');
const express = require('express');
const httpApi = require('./src/httpApi.js');
const mysql      = require('mysql');

// Initiate Database
const pool = mysql.createPool(config.database);
if(!pool) console.error(new Date() + "Failed to establish database connection!");
// TODO check if database is ready

// HTTP Api init
const app = express();
httpApi.setDatabaseConnectionPool(pool);
httpApi.initialiseApp(app);
const server = http.createServer(app);

server.listen(config.http.port, function() {
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
