const util = require('util');

const INVALID_WEBSOCKET_REQUEST= "Invalid_Request";
const INVALID_TOKEN = {code:1003, description:"Invalid token '%s' provided"};

const newWebsocketError = function (type, message) {
    return {
        type: type,
        message: message
    };
};
const newWebsocketErrorForAction = function(type, message, action){
    return {
        type: type,
        message: message,
        action: action
    };
};

const writeErrorToWebsocket = function(connection, error){
    connection.sendUTF(JSON.stringify(error));
    console.error(new Date() + "Error send through websocket", error);
};

module.exports = {
    binaryDataReceived: function(connection) {
        writeErrorToWebsocket(connection, newWebsocketError(INVALID_WEBSOCKET_REQUEST, 'Binary data is not accepted'));
    },

    noJSONReceived: function(connection, msg){
        writeErrorToWebsocket(connection, newWebsocketError(INVALID_WEBSOCKET_REQUEST, 'Data is not in json format: ' + msg));
    },

    unknownAction: function(connection, action){
        writeErrorToWebsocket(connection, newWebsocketErrorForAction(INVALID_WEBSOCKET_REQUEST, "Unknown action", action));
    },

    closeWebsocketInvalidToken: function(connection, token){
        connection.close(INVALID_TOKEN.code, util.format(INVALID_TOKEN.description, token));
    },

    missingData: function(connection, action, message){
        writeErrorToWebsocket(connection, newWebsocketErrorForAction(INVALID_WEBSOCKET_REQUEST, message, action));
    }
};