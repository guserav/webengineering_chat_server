const mysql = require('../mysql.js');
const utils = require('./utils.js');
const errors = require('../errors.js');

/**
 * Send the wanted message and broadcasts a new Message action to all users
 * @param connection
 * @param data
 * @param pool
 * @param connections
 */
module.exports = async function(connection, data, pool, connections) {
    const user = utils.getUserFromData(data);
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
            errors.missingData(connection, data.action, "User not in Room");
            return;
        }


        const resultMessageCreation = await mysql.query(
            databaseConnection,
            "INSERT INTO ??(`userID`, `type`, `answerToMessageID`, `content`) VALUE (?, ?,?,?);",
            [utils.buildRoomDatabaseName(room), user, type, answerToMessageID, content],
            true
        );
        let answerToWebsocket = {
            action:data.action,
            requestID:data.requestID
        };
        if(resultMessageCreation.insertId === undefined){
            answerToWebsocket.messageStatus = "invalid";
            utils.writeObjectToWebsocket(connection, answerToWebsocket);
            return;
        }
        answerToWebsocket.messageStatus = "ok";
        utils.writeObjectToWebsocket(connection, answerToWebsocket);

        let broadcastToAll = {
            action:"newMessages",
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

        utils.writeObjToAllUsers(resultUserInRoom[1].map((e) => e.userID), connections, broadcastToAll);
    } catch (err){
        console.log(new Date() + " Error while sending message", err);
        errors.internalServerError(connection, data.action, data);
    } finally {
        try {
            if (databaseConnection) databaseConnection.release();
        } catch (err){
            console.log(new Date() + " Error while releasing database connection" + err);
        }
    }
};
