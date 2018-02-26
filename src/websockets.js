/*
 * This file contains all code handling the websocket requests
 * TODO implement notifications for new messages
 */
const tokens = require('./tokens.js');
const errors = require('./errors.js');
const jwt = require('jsonwebtoken');

function writeObjectToWebsocket(connection, obj){
    connection.sendUTF(JSON.stringify(obj));
}

function getRooms(connection, data, pool) {
    console.error('Method not yet implemented');
    writeObjectToWebsocket(connection, {
        action: data.action,
        rooms:[{
            roomType:"private",
            members:[{
                userID: "testUser"
            }],
            roomID:"klasdfj",
            roomName:"TestRoom",
            lastMessage:{
                "messageID":"lkj",
                "type":"message",
                "content":"This is a dummy message"
            },
            lastReadMesage:"lkj"
        }]}
    );
}

function getMessages(connection, data, pool) {
    console.error('Method not yet implemented');
    writeObjectToWebsocket(connection, {
            action: data.action,
            roomID: data.roomID,
            roomName: "TestRoom",
            messages: [{
                "messageID": "lkj",
                "type": "message",
                "content": "This is a dummy message"
            }]
        }
    );
}

function sendMessage(connection, data, pool) {
    console.error('Method not yet implemented');
    writeObjectToWebsocket(connection, {
        action: data.action,
        messageStatus:"ok",
        requestID:data.requestID
    })
}

function createRoom(connection, data, pool) {
    console.error('Method not yet implemented');
    writeObjectToWebsocket(connection, {
        action: data.action,
        roomStatus:"ok",
        invalidUsers:[{userID:"asöklfj"}]
    })
}

function addPersonToRoom(connection, data, pool) {
    console.error('Method not yet implemented');
    writeObjectToWebsocket(connection, {
        action: data.action,
        roomStatus:"ok",
        invalidUsers:[{userID:"asöklfj"}]
    })
}

function readRoom(connection, data, pool) {
    console.error('Method not yet implemented');
}

const apiEndpoints = { //TODO implement all api endpoints
    getRooms: getRooms,
    getMessages: getMessages,
    sendMessage: sendMessage,
    createRoom: createRoom,
    addPersonToRoom: addPersonToRoom,
    readRoom: readRoom
};

module.exports = {
    connections:{},

    setupConnection: function (connection){
        const _this = this;
        connection.on('message', function(message) {
            if (message.type === 'utf8') {
                console.log('Received Message: ' + message.utf8Data);

                const data = JSON.parse(message.utf8Data);
                const tokenData = tokens.isValidToken(data.token);
                if(!tokenData){
                    errors.closeWebsocketInvalidToken(connection, data.token);
                    return;
                }

                //Terminate the previous websocket using this token
                let lastConnection = _this.connections[tokenData.user];
                if(!(lastConnection === undefined)){
                    if(!(lastConnection === connection)){
                        lastConnection.close(1003, 'Other connection established');
                    }
                }
                _this.connections[tokenData.user] = connection;

                //Token changed for the websocket
                if(connection.lastTokenUsed !== data.token){
                    if(connection.lastTokenUsed !== undefined){
                        _this.connections[jwt.decode(connection.lastTokenUsed).user] = undefined;
                    }
                    connection.lastTokenUsed = data.token;
                }

                const actionToPerform = apiEndpoints[data.action];
                if(actionToPerform === undefined){
                    errors.unknownAction(connection, data.action);
                    return;
                }

                actionToPerform(connection, data, _this.databaseConPool);
            } else if (message.type === 'binary') {
                errors.binaryDataReceived(connection);
            }
        });

        connection.on('close', function(reasonCode, description) {
            _this.connections[connection.lastTokenUsed] = undefined;
            console.log((new Date()) + ' Peer ' + connection.remoteAddress + ' disconnected. ' + reasonCode + ': ' + description);
        });
    },

    setDatabaseConnectionPool: function(pool){
        if(!pool) console.error(new Date() + " Database connection not valid");
        this.databaseConPool = pool;
    }
};