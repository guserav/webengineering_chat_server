const mysql = require('../mysql.js');
const utils = require('./utils.js');
const errors = require('../errors.js');

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
module.exports = async function(connection, data, pool) {
    const user = utils.getUserFromData(data);
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
            errors.missingData(connection, data.action, "User not in Room");
            return;
        }

        let resultMessages;
        const roomTable = utils.buildRoomDatabaseName(room);
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

        let websocketResponse = {
            action: data.action,
            messages: resultMessages.reverse()
        };
        utils.writeObjectToWebsocket(connection, websocketResponse);
    } catch (err){
        console.log(new Date() + " Error while retrieving room data", err);
        errors.internalServerError(connection, data.action, data);
    } finally {
        try {
            if (databaseConnection) databaseConnection.release();
        } catch (err){
            console.log(new Date() + " Error while releasing database connection" + err);
        }
    }
};
