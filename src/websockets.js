/*
 * This file contains all code handling the websocket requests
 * TODO implement notifications for new messages
 */
const tokens = require('./tokens.js');
const errors = require('./errors.js');

const apiEndpoints = { //TODO implement all api endpoints
    getRooms: undefined,
    getMessages: undefined,
    sendMessage: undefined,
    createRoom: undefined,
    addPersonToRoom: undefined,
    readRoom: undefined
};

module.exports = {
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