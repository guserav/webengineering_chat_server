/*
 * This file contains all code handling the websocket requests
 */
const tokens = require('./tokens.js');
const errors = require('./errors.js');
const jwt = require('jsonwebtoken');
const mysql = require('./mysql.js');
//TODO add error handling of errors described here: https://github.com/mysqljs/mysql#error-handling

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
async function getRooms(connection, data, pool) {
    const user = jwt.decode(data.token).user;

    let databaseConnection = null;
    try {
        databaseConnection = await mysql.getConnection(pool);
        const resultMemberOfRooms = await mysql.query(
            databaseConnection,
            "SELECT `roomID`, `lastMessageRead` FROM `user_room` WHERE `userID` = ?;",
            [user],
            true
        );
        //If the user doesn't exist or is in no rooms than he will receive an empty answer

        //Generate a Promise per room that retrieves all information
        let perRoomPromises = [];
        let roomsData = [];
        for(let i = 0; i < resultMemberOfRooms.length; i++){
            perRoomPromises.push(new Promise(function(fulfill, reject){
                try{
                    //Fetching all users in the room
                    let roomData = {
                        lastReadMessage:resultMemberOfRooms[i].lastMessageRead,
                        roomID:resultMemberOfRooms[i].roomID
                    };
                    let getRoomMember = mysql.query(
                        databaseConnection,
                        "SELECT `userID`, `lastMessageRead` FROM `user_room` WHERE `roomID` = ?;",
                        [resultMemberOfRooms[i].roomID],
                        false
                    ).then(function(res){
                        roomData.members = res;
                    });

                    //Fetch room details (public/private) and room name
                    let getRoomDetails = mysql.query(
                        databaseConnection,
                        "SELECT `displayName` FROM `room` WHERE `roomID` = ?;",
                        [resultMemberOfRooms[i].roomID],
                        false //Don't want release on failure
                    ).then(function(resultRoomDetails){
                        if(resultRoomDetails.length !== 1){
                            console.error(new Date() + "RoomID not found or roomID not unique. Possible that integrity is destroyed.", resultRoomDetails);
                            throw new Error("Can't find RoomID");
                        }
                        if(resultRoomDetails[0].displayName === null){
                            //this means the room is a private Room
                            roomData.roomType = "private";
                        }else{
                            roomData.roomType = "public";
                            roomData.roomName = resultRoomDetails[0].displayName;
                        }
                    });

                    //Get last Message of the room
                    let getLastMessage = mysql.query(
                        databaseConnection,
                        "SELECT `messageID`, `userID`, `type`, `answerToMessageID`, `content`, `sendOn` FROM ?? ORDER BY `messageID` DESC LIMIT 1;",
                        [buildRoomDatabaseName(resultMemberOfRooms[i].roomID)],
                        false
                    ).then(function(resultLastMessage){
                        if(resultLastMessage.length !== 1){
                            console.error(new Date() + "Expected only on message or messageID is not unique", resultLastMessage);
                            throw new Error("Can't fetch last message");
                        }
                        roomData.lastMessage = resultLastMessage;
                    });

                    Promise.all([getRoomMember, getRoomDetails, getLastMessage]).then(function(){
                        if(roomData.roomType === "private"){ //For private rooms auto set the room Name to that of the other participant
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
        await Promise.all(perRoomPromises);
        databaseConnection.release();
        databaseConnection = null;
        writeObjectToWebsocket(connection, {
            action: data.action,
            rooms:roomsData
        });
    } catch (err){
        console.error(new Date() + " Error while fetching room data", err);
        errors.internalServerError(connection, data.action, data);
    } finally {
        try {
            if (databaseConnection) databaseConnection.release();
        } catch (err){
            console.log(new Date() + " Error while releasing database connection");
        }
    }
}

/**
 * Get the messages for a given room
 *
 * If the user is not in the room then the websocket receives an error message.
 *
 * Else an answer is transmitted with the requested data in it
 *
 * @param connection
 * @param data
 * @param pool
 */
async function getMessages(connection, data, pool) {
    const user = jwt.decode(data.token).user;
    const room = data.room;

    let databaseConnection = null;
    try {
        databaseConnection = await mysql.getConnection(pool);
        const resultCheckUserInRoom = await mysql.query(
            databaseConnection,
            "SELECT * FROM `user_room` WHERE `userID` = ? AND `roomID` = ?;",
            [user, room],
            true
        );

        if(resultCheckUserInRoom.length === undefined || resultCheckUserInRoom.length <= 0){
            databaseConnection.release();
            errors.missingData(connection, data.action, "User not in Room");
            return;
        }

        let resultMessages;
        const roomTable = buildRoomDatabaseName(room);
        if(data.startFromID !== undefined) {
            if (data.maxCount !== undefined && data.maxCount > 0) {
                resultMessages = await mysql.query(
                    databaseConnection,
                    "SELECT `messageID`, `userID`, `type`, `answerToMessageID`, `content`, `sendOn` FROM ?? WHERE `messageID` < ? ORDER BY `messageID` DESC LIMIT ?;",
                    [roomTable, data.startFromID, data.maxCount],
                    true);
            } else {
                resultMessages = await mysql.query(
                    databaseConnection,
                    "SELECT `messageID`, `userID`, `type`, `answerToMessageID`, `content`, `sendOn` FROM ?? WHERE `messageID` < ? ORDER BY `messageID` DESC;",
                    [roomTable, data.startFromID],
                    true);
            }
        } else {
            if (data.maxCount !== undefined && data.maxCount > 0) {
                resultMessages = await mysql.query(
                    databaseConnection,
                    "SELECT `messageID`, `userID`, `type`, `answerToMessageID`, `content`, `sendOn` FROM ?? ORDER BY `messageID` DESC LIMIT ?;",
                    [roomTable, data.maxCount],
                    true);
            } else {
                resultMessages = await mysql.query(
                    databaseConnection,
                    "SELECT `messageID`, `userID`, `type`, `answerToMessageID`, `content`, `sendOn` FROM ?? ORDER BY `messageID` DESC;",
                    [roomTable],
                    true);
            }
        }

        databaseConnection.release();
        let websocketResponse = {
            action: data.action,
            messages: resultMessages.reverse()
        };
        writeObjectToWebsocket(connection, websocketResponse);
    } catch (err){
        console.log(new Date() + " Error while retrieving room data", err);
        errors.internalServerError(connection, data.action, data);
    } finally {
        try {
            if (databaseConnection) databaseConnection.release();
        } catch (err){
            console.log(new Date() + " Error while releasing database connection");
        }
    }
}

/**
 * Send the wanted message and broadcasts a new Message action to all users
 * @param connection
 * @param data
 * @param pool
 * @param connections
 */
async function sendMessage(connection, data, pool, connections) {
    const user = jwt.decode(data.token).user;
    const room = data.room;
    const type = data.type;
    const answerToMessageID = data.answerToMessageID;
    const content = data.content;

    if(type !== "message" && type !== "picture" && type !== "answer"){
        errors.missingData(connection, data.action, "No valid type provided");
        return;
    }
    if(type === "answer" && !(answerToMessageID >= 0)){
        errors.missingData(connection, data.action, "Answer needs answer to MessageID");
        return;
    }
    if(content === null || content === undefined){
        errors.missingData(connection, data.action, "No content provided");
        return;
    }

    let databaseConnection = null;
    try {
        databaseConnection = await mysql.getConnection(pool);

        //Check if user is in room and get all other users in room
        const resultUserInRoom = await mysql.query(
            databaseConnection,
            "SELECT * FROM `user_room` WHERE `userID` = ? AND `roomID` = ?;" +
            "SELECT `userID` FROM `user_room` WHERE `roomID` = ?;",
            [user, room, room],
            true
        );
        if(resultUserInRoom.length === undefined || resultUserInRoom.length !== 2 || resultUserInRoom[0].length < 1 ){
            databaseConnection.release();
            errors.missingData(connection, data.action, "User not in Room");
            return;
        }


        const resultMessageCreation = await mysql.query(
            databaseConnection,
            "INSERT INTO ??(`userID`, `type`, `answerToMessageID`, `content`) VALUE (?, ?,?,?);",
            [],
            true
        );
        databaseConnection.release();
        let answerToWebsocket = {
            action:data.action,
            requestID:data.requestID
        };
        if(resultMessageCreation.insertId === undefined){
            answerToWebsocket.messageStatus = "invalid";
            writeObjectToWebsocket(connection, answerToWebsocket);
            return;
        }
        answerToWebsocket.messageStatus = "ok";
        writeObjectToWebsocket(connection, answerToWebsocket);

        let broadcastToAll = {
            action:"newMessage",
            data:[{
                roomID:room,
                messages:[{
                    type:type,
                    content:content,
                    answerToMessageID:answerToMessageID,
                    userID:user,
                    sendOn:new Date(),
                    messageID:resultMessageCreation.insertId
                }]
            }]
        };
        for(let i = 0; i < resultUserInRoom[1].length; i++){
            const userConnection = connections[resultUserInRoom[1][i]];
            if(userConnection){
                try{
                    //Test if connection is still open
                    if(userConnection.connected && userConnection.closeDescription === null){
                        writeObjectToWebsocket(userConnection, broadcastToAll);
                    }
                } catch(err){
                    console.error(new Date() + "Tried to send new message request to a websocket that should still be open.: " + err);
                }
            }
        }
    } catch (err){
        console.log(new Date() + " Error while sending message", err);
        errors.internalServerError(connection, data.action, data);
    } finally {
        try {
            if (databaseConnection) databaseConnection.release();
        } catch (err){
            console.log(new Date() + " Error while releasing database connection");
        }
    }
}

/**
 * Create a new Room and add the users specified
 *
 * By
 * Creating an entry in room
 *
 * Creating a RoomMessages_%roomID% Table
 * Adding a message stating that the room has been initialised
 *
 * Adding all users via user_room with last message read initialised to 0
 *
 * Writing a response that all users have been successfully added
 * Writing a message to all users that they have been added
 *
 * @param connection
 * @param data
 * @param pool
 * @param connections
 */
function createRoom(connection, data, pool, connections) {
    const user = jwt.decode(data.token).user;

    if(data.roomName === undefined || (data.roomName === null && data.roomType === "private")){
        errors.missingData(connection, data.action, "roomName must be set.");
        return;
    }
    if(data.invite === null || data.invite === undefined){
        errors.missingData(connection, data.action, "invite must be set.");
        return;
    }
    pool.getConnection(async function(err, databaseConnection){
        if(err) throw err;
        //TODO verify legimety of the Request e.g only 2 users in private chat room
        let existingUsers = [];
        let usersToTest = [];
        const roomDisplayName = (data.roomType === "private")? null : data.roomName;


        if(roomDisplayName === null){//privateRoom
            usersToTest = [data.invite.toString(), user];
        } else { //public room
            usersToTest = data.invite;
        }

        //No need to remove duplicates from usersToTest because they don't ruin the sql statement
        await new Promise(function(fulfill, reject){
            databaseConnection.query("SELECT `userID` FROM `user` WHERE `userID` IN (?);", [usersToTest], function(err, resultCheckUser){
                if(err){
                    reject(err);
                    return;
                }
                for(let i = 0; i < resultCheckUser.length; i++){
                    existingUsers.push(resultCheckUser[i].userID);
                }
                fulfill(null);
            });
        });

        let usersNotAdded = [];
        //Filter all users that have not been added
        for(let i = 0; i < usersToTest.length; i++){
            let found = false;
            for(let j = 0; j < existingUsers; j++){
                if(usersToTest[i] === existingUsers[j]){
                    found = true;
                }
            }
            if(!found){
                //Prevent adding duplicates to usersNotAdded
                for(let j = 0; j < usersNotAdded.length; j++){
                    if(usersNotAdded[j] === usersToTest[i]){
                        found = true;
                    }
                }
                if(!found){
                    usersNotAdded.push(usersToTest[i]);
                }
            }
        }

        let errorMsgInvalidUsers = {
            action:data.action,
            requestID:data.requestID,
            roomStatus:"invalid",
            invalidUsers:usersNotAdded
        };

        if(roomDisplayName === null && existingUsers.length !== 2){
            errorMsgInvalidUsers.errorMsg = "Private room needs exatly to users.";
            writeObjectToWebsocket(connection, errorMsgInvalidUsers);
            databaseConnection.release();
            return;
        }
        if(existingUsers.length === undefined || existingUsers.length <= 0){
            errorMsgInvalidUsers.errorMsg = "Public room needs at least 1 person to be added.";
            writeObjectToWebsocket(connection, errorMsgInvalidUsers);
            databaseConnection.release();
            return;
        }

        // Create the room in the room table
        databaseConnection.query("INSERT INTO `room`(`displayName`) VALUE (?);", [roomDisplayName], function(err, resultsRoomCreated){
            if(err){
                databaseConnection.release();
                throw err;
            }
            //Setup constants for easier access
            const newRoomID = resultsRoomCreated.insertId;
            if(!newRoomID) throw new Error("Expected that insertID was set. See for details https://github.com/mysqljs/mysql#getting-the-id-of-an-inserted-row");
            const newRoomDatabaseName = buildRoomDatabaseName(newRoomID);

            //Create the roomtable and add a creation message to it
            const queryCreateTableAndAddCreationMessage = "CREATE TABLE ?? (`messageID` INT NOT NULL AUTO_INCREMENT PRIMARY KEY, `userID` VARCHAR(30), `type` VARCHAR(20), `answerToMessageID` INT, `content` TEXT NOT NULL, `sendOn` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP );" +
                "INSERT INTO ??(`userID`, `type`, `content`) VALUES (?,?,?);";
            const messageRoomCreated = (roomDisplayName === null)?"Hello in your private chat room":"Room was created by " + user + " with name " + roomDisplayName + ".";
            databaseConnection.query(queryCreateTableAndAddCreationMessage, [newRoomDatabaseName, newRoomDatabaseName, user, "system", messageRoomCreated], function(err, resultRoomCreation){
                if(err){
                    databaseConnection.release();
                    throw err;
                }
                //Assuming everything is fine with the query and moving on to next step
                //Building array of values to add
                let arrayToAdd = [];
                for(let i = 0; i < existingUsers.length; i++){
                    arrayToAdd.push([newRoomID, existingUsers[i], 0]);
                }

                // Add all users to the room via adding them in the user_room table
                databaseConnection.query("INSERT INTO `user_room`(`roomID`, `userID`, `lastMessageRead`) VALUES ?;", [arrayToAdd], function(err, resultUsersAdded){
                    if(err){
                        databaseConnection.release();
                        throw err;
                    }
                    if(resultUsersAdded.affectedRows !== existingUsers.length){
                        console.error(new Date() + "Only added " + resultUsersAdded.affectedRows + "/" + existingUsers + "users to the room created.");
                    }

                    let websocketResponse = {
                        action:data.action,
                        requestID:data.requestID,
                        roomID:newRoomID,
                        roomStatus:(usersNotAdded.length>0)?"partially added users":"ok",
                        invalidUsers:usersNotAdded
                    };

                    writeObjectToWebsocket(connection, websocketResponse);

                    //TODO check if result really contains the insertId
                    let websocketNewMessageNotification = {
                        action:"newMessages",
                        data:[{
                            roomID: newRoomID,
                            messages: [{
                                type: "system",
                                content: messageRoomCreated,
                                userID: user,
                                messageID: resultRoomCreation[1].insertId,
                                sendOn:new Date()
                            }]
                        }]
                    };
                    for(let i = 0; i < existingUsers.length; i++){
                        const userConnection = connections[existingUsers[i]];
                        if(userConnection){
                            try{
                                //Test if connection is still open
                                if(userConnection.connected && userConnection.closeDescription === null){
                                    writeObjectToWebsocket(userConnection, websocketNewMessageNotification);
                                }
                            } catch(err){
                                console.error(new Date() + "Tried to send new message request to a websocket that should still be open.: " + err);
                            }
                        }
                    }
                });
            });
        });
    });
}

/**
 * Adds the requested Persons to the chat room
 *
 * The user adding must be in the chat room himself
 * Therefor it needs to be checked if the chatroom exists and is not private.
 * Also it should be checked if the users are existing and if they already are in the chatroom.
 *
 * The remaining users need to be added to the chat room.
 * All users now in the chat room need to be notified about the adding of those people.
 * The person adding them gets an answer stating which users were invalid.
 *
 * @param connection
 * @param data
 * @param pool
 * @param connections
 */
function addPersonToRoom(connection, data, pool, connections) {
    const user = jwt.decode(data.token).user;
    const userToTest = data.users;
    const room = data.roomID;

    if(userToTest === undefined || userToTest.length > 0){
        errors.missingData(connection, data.action, "To add users they need to be specified.");
        return;
    }

    pool.getConnection(function(err, databaseConnection){
        if(err) throw err;
        const sqlTestValidaty = "SELECT `displayName` FROM `room` WHERE `roomID` = ?;" +
            "SELECT * FROM `user_room` WHERE `userID` = ? AND `roomID` = ?;" +
            "SELECT `userID` FROM `user_room` WHERE `roomID` = ?;" +
            //Get all valid user names that are not already added to the group
            "(SELECT `userID` FROM `user` WHERE `userID` IN (?)) MINUS (SELECT `userID` FROM `user_room` WHERE `roomID` = ?);" +
            "SELECT `messageID` FROM ?? ORDER BY `messageID` DESC LIMIT 1;";
        databaseConnection.query(sqlTestValidaty, [room, user, room, room, userToTest, room, buildRoomDatabaseName(room)], function(err, resultTestValidaty){
            if(err || resultTestValidaty.length !== 5 || resultTestValidaty[1].length !== 1){
                databaseConnection.release();
                //TODO write answer to websocket
                errors.invalidRequest(connection, data.action, "User can't add persons to room he isn't in himself.", data);
                return;
            }
            //Test if private room
            if(resultTestValidaty[0][0].displayName === undefined || resultTestValidaty[0][0].displayName === null){
                databaseConnection.release();
                errors.invalidRequest(connection, data.action, "Cant't add user to private room.", data);
                return;
            }

            const usersInRoom = resultTestValidaty[2];
            const usersToAdd = resultTestValidaty[3];
            const lastMessageID = resultTestValidaty[4][0].messageID;

            if(usersToAdd === undefined || !(usersToAdd.length > 0)){
                databaseConnection.release();
                //TODO maybe change to answer with status invalid
                errors.missingData(connection, data.action, "No valid users to Add");
                return;
            }

            let usersNotAdded = [];
            //Filter all users that have not been added
            for(let i = 0; i < userToTest; i++){
                let found = false;
                for(let j = 0; j < usersToAdd; j++){
                    if(userToTest[i] === usersToAdd[j]){
                        found = true;
                    }
                }
                if(!found){
                    //Prevent adding duplicates to usersNotAdded
                    for(let j = 0; j < usersNotAdded.length; j++){
                        if(usersNotAdded[j] === userToTest[i]){
                            found = true;
                        }
                    }
                    if(!found){
                        usersNotAdded.push(userToTest[i]);
                    }
                }
            }

            //Building array of values to add
            let arrayToAdd = [];
            for(let i = 0; i < usersToAdd.length; i++){
                arrayToAdd.push([room, usersToAdd[i], lastMessageID]);
            }

            const USER_ADDED_MESSAGE = "Users where added to the room";
            databaseConnection.query("INSERT INTO `user_room`(`roomID`, `userID`) VALUES (?);INSERT INTO ??(`type`, `userID`, `content`) VALUES (?,?,?);", [usersToAdd, buildRoomDatabaseName(room), "system", user, USER_ADDED_MESSAGE], function(err, resultAddingcwUsers){
                databaseConnection.release();
                if(err){
                    console.log(new Date(), err);
                    writeObjectToWebsocket(connection, {
                        action:data.action,
                        room_status:"invalid",
                        roomID:room,
                        invalid_users:userToTest
                    });
                    return;
                }
                let answer = {
                    action:data.action,
                    room_status:(usersNotAdded.length > 0)?"partially added users":"ok",
                    roomID:room,
                    invalidUsers:usersNotAdded
                };
                writeObjectToWebsocket(connection, answer);
                let newMessageNotification = {
                    action:"newMessages",
                    data:[{
                        roomID:room,
                        messages:[{
                            type:"system",
                            userID:user,
                            content:USER_ADDED_MESSAGE,
                            sendOn:new Date(),
                            messageID:resultAddingcwUsers[1].insertId
                        }]
                    }]
                };
                let writeAnswer = function(val){
                    const userConnection = connections[val];
                    if(userConnection){
                        try{
                            //Test if connection is still open
                            if(userConnection.connected && userConnection.closeDescription === null){
                                writeObjectToWebsocket(userConnection, newMessageNotification);
                            }
                        } catch(err){
                            console.error(new Date() + "Tried to send new message request to a websocket that should still be open.: " + err);
                        }
                    }
                };
                usersToAdd.forEach(writeAnswer);
                usersInRoom.forEach(writeAnswer);
            });

        });
    });
}

/**
 * Reads the room until the messageID specified in the request.
 *
 * Basically updates the row (in user_room) where userID and roomID are the same as specified in the request.
 * If no row was changed than an error will be send to the websocket else nothing happens.
 *
 * @param connection
 * @param data
 * @param pool
 */
function readRoom(connection, data, pool) {
    const user = jwt.decode(data.token).user;
    const newLastMessage = data.messageID;
    const room = data.roomID;
    pool.query("UPDATE `user_room` SET `lastMessageRead` = ? WHERE `roomID` = ? AND `userID` = ?", [newLastMessage, room, user], function(err, result){
        if(err || result.changedRows !== 1){
            errors.invalidRequest(connection, data.action, "User not in specified room.", data);
        }
    });
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
            //TODO maybe log data of message without token
            if (message.type === 'utf8') {
                let data;
                try {
                    data = JSON.parse(message.utf8Data);
                } catch (error){
                    errors.noJSONReceived(connection, message.utf8Data);
                    return;
                }
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