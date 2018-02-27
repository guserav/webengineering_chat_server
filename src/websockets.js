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

function buildRoomDatabaseName(roomID){
    return "RoomMessages_" + roomID.toString();
}

/**
 * Gets the rooms the requesting user is in.
 *
 * @param connection the database connection to answer to
 * @param data the data of the request
 * @param pool the database connection pool
 */
function getRooms(connection, data, pool) {
    const user = jwt.decode(data.token).user;

    pool.getConnection(function(err, databaseConnection){
        if(err) throw err;
        databaseConnection.query("SELECT `roomID`, `lastMessageRead` FROM `room_user` WHERE `userID` = ?", [user], function(err, resultMemberOfRooms, field){
            if(err){
                databaseConnection.release();
                throw err;
            }
            //If the user doesn't exist or is in no rooms than he will receive an empty answer

            let perRoomPromises = [];
            let roomsData = [];
            for(let i = 0; i < resultMemberOfRooms.length; i++){
                perRoomPromises.push(new Promise(function(fulfill, reject){
                    try{
                        let roomData = {};
                        let getRoomMember = new Promise(function (fulfill, reject) {
                            databaseConnection.query("SELECT `userID`, `lastMessageRead` FROM `room_user` WHERE `roomID` = ?", [resultMemberOfRooms[i].roomID], function(err, resultRoomMember, field){
                                if(err){
                                    reject(err);
                                    return;
                                }
                                roomData.members = resultRoomMember;
                                fulfill(null);
                            });
                        });
                        let getRoomDetails = new Promise(function (fulfill, reject) {
                            databaseConnection.query("SELECT `displayName` FROM `Room` WHERE `roomID` = ?", [resultMemberOfRooms[i].roomID], function(err, resultRoomDetails, field){
                                if(err){
                                    reject(err);
                                    return;
                                }
                                if(resultRoomDetails.length !== 1){
                                    console.error(new Date() + "RoomID not found or roomID not unique. Possible that integrity is destroyed.", resultRoomDetails);
                                    reject(new Error("Can't find RoomID"));
                                    return;
                                }
                                if(resultRoomDetails[0].displayName === null){
                                    //is private Room
                                    roomData.roomType = "private";
                                }else{
                                    roomData.roomType = "public";
                                    roomData.roomName = resultRoomDetails[0].displayName;
                                }
                                fulfill(null);
                            });
                        });
                        let getLastMessage = new Promise(function (fulfill, reject) {
                            databaseConnection.query("SELECT `messageID`, `userID`, `type`, `answerToMessageID`, `content`, `sendOn` FROM ? WHERE `messageID` = MAX(`messageID`)", [buildRoomDatabaseName(resultMemberOfRooms[i].roomID)], function(err, resultLastMessage, field){
                                if(err){
                                    reject(err);
                                    return;
                                }
                                if(resultLastMessage.length !== 1){
                                    console.error(new Date() + "Expected only on message messageID is not unique", resultLastMessage);
                                    reject(new Error("Can't fetch last message"));
                                    return;
                                }
                                roomData.lastMessage = resultLastMessage;
                                fulfill(null);
                            });
                        });

                        Promise.all([getRoomMember, getRoomDetails, getLastMessage]).then(function(){
                            if(roomData.roomType === "private"){
                                roomData.roomName = (roomData.members[0].userID === user)? roomData.members[1].userID : roomsData.members[0].userID;
                            }
                            roomsData.push(roomData);
                            fulfill(roomData);
                        }).catch(function(err){
                            reject(err);
                        });
                    }catch(ex){
                        reject(ex);
                    }
                }));
            }

            //resolve all Promises and write the response to the websocket
            Promise.all(perRoomPromises).then(function(){
                writeObjectToWebsocket(connection, {
                    action: data.action,
                    rooms:roomsData
                });
            }).catch(function(err){
                writeObjectToWebsocket(connection,{
                    action: data.action,
                    type: "error",
                    message: err.toString()
                });
                throw err; // TODO write proper response to connection
            }).finally(function(){
                databaseConnection.release();
            });
        });
    });
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
        }]}
    );
}

function sendMessage(connection, data, pool) {
    console.error('Method not yet implemented');
    writeObjectToWebsocket(connection, {
        action: data.action,
        messageStatus:"ok",
        requestID:data.requestID
    });
}

function createRoom(connection, data, pool) {
    console.error('Method not yet implemented');
    writeObjectToWebsocket(connection, {
        action: data.action,
        roomStatus:"ok",
        invalidUsers:[{userID:"asöklfj"}]
    });
}

function addPersonToRoom(connection, data, pool) {
    console.error('Method not yet implemented');
    writeObjectToWebsocket(connection, {
        action: data.action,
        roomStatus:"ok",
        requestID:data.requestID,
        invalidUsers:[{userID:"asöklfj"}]
    });
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

                actionToPerform(connection, data, _this.databaseConPool, _this.connections);
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