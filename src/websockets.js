/*
 * This file contains all code handling the websocket requests
 * TODO implement notifications for new messages
 */
const tokens = require('./tokens.js');
const errors = require('./errors.js');

function writeObjectToWebsocket(connection, obj){
    connection.sendUTF(JSON.stringify(obj));
}

function getRooms(connection, data) {
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

function getMessages(connection, data) {
    console.error('Method not yet implemented');
    writeObjectToWebsocket(connection, {
        action: data.action,
        rooms:[{
            roomID:"klasdfj",
            roomName:"TestRoom",
            messages:[{
                "messageID":"lkj",
                "type":"message",
                "content":"This is a dummy message"
            }]
        }]}
    );
}

function sendMessage(connection, data) {
    console.error('Method not yet implemented');
    writeObjectToWebsocket(connection, {
        action: data.action,
        messageStatus:"ok",
        requestID:data.requestID
    })
}

function createRoom(connection, data) {
    console.error('Method not yet implemented');
    writeObjectToWebsocket(connection, {
        action: data.action,
        roomStatus:"ok",
        invalidUsers:[{userID:"asöklfj"}]
    })
}

function addPersonToRoom(connection, data) {
    console.error('Method not yet implemented');
    writeObjectToWebsocket(connection, {
        action: data.action,
        roomStatus:"ok",
        invalidUsers:[{userID:"asöklfj"}]
    })
}

function readRoom(connection, data) {
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
        connection.on('message', function(message) {
            if (message.type === 'utf8') {
                console.log('Received Message: ' + message.utf8Data);

                const data = JSON.parse(message.utf8Data);
                if(!tokens.isValidToken(data.token)){
                    errors.closeWebsocketInvalidToken(connection, data.token);
                    return;
                }

                const actionToPerform = apiEndpoints[data.action];
                if(actionToPerform === undefined){
                    errors.unknownAction(connection, data.action);
                    return;
                }

                actionToPerform(connection, data);
            } else if (message.type === 'binary') {
                errors.binaryDataReceived(connection);
            }
        });

        connection.on('close', function(reasonCode, description) {
            console.log((new Date()) + ' Peer ' + connection.remoteAddress + ' disconnected. ' + reasonCode + ': ' + description);
        });
    }
};