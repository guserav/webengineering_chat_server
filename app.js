const config = require('./src/config.js');
const WebSocketServer = require('websocket').server;
const http = require('http');
const websocketLogic = require('./src/websockets');
const express = require('express');
const httpApi = require('./src/httpApi.js');
const mysql      = require('mysql');

// Initiate Database
const pool = mysql.createPool(Object.assign({multipleStatements:true}, config.database));
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
const wsServer = new WebSocketServer({
    httpServer: server,
    autoAcceptConnections: false
});

/**
 * Tests if the origin of the request can be accepted
 * @param request
 * @returns {boolean}
 */
function isRequestAllowed(request) {
    const toAccept = config.websocket.acceptOrigin;
    if(toAccept){
        if(!request.order) return false;
        if(toAccept.length){ // Go through array of origins
            for(let i = 0; i < toAccept.length; i++){
                if(toAccept[i] === request.origin){
                    return true;
                }
            }
            return false; //No acceptable origin found
        } else {
            return toAccept === request.origin;
        }
    } else {
        console.log(new Date() + ' Origin auto accepted: ', request.origin);
        return true;
    }
}

wsServer.on('request', function(request) {
    if (!isRequestAllowed(request)) { //Deny non allowed origins
        request.reject();
        console.log((new Date()) + ' Connection from ', request.origin, ' rejected.');
        return;
    }

    let connection = request.accept(null, request.origin); //specify protocol with none
    console.log((new Date()) + ' Connection accepted.');
    websocketLogic.setupConnection(connection);
});
