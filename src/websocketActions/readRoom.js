const mysql = require('../mysql.js');
const utils = require('./utils.js');
const errors = require('../errors.js');

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
module.exports = async function(connection, data, pool) {
    const user = utils.getUserFromData(data);
    const newLastMessage = data.messageID;
    const room = data.roomID;

    try {
        let result = await mysql.query(
            pool,
            "UPDATE `user_room` SET `lastMessageRead` = ? WHERE `roomID` = ? AND `userID` = ?",
            [newLastMessage, room, user]
        );
        if(result.changedRows !== 1){
            errors.invalidRequest(connection, data.action, "User not in specified room.", data);
        }
    } catch (err){
        console.log(new Date() + " Error while marking room as read", err);
        errors.invalidRequest(connection, data.action, "User not in specified room.", data);
    }
};
