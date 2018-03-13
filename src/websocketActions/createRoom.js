const mysql = require('../mysql.js');
const utils = require('./utils.js');
const errors = require('../errors.js');

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
module.exports = async function(connection, data, pool, connections) {
    const user = utils.getUserFromData(data);

    if(data.roomName === undefined || (data.roomName === null && data.roomType === "private")){
        errors.missingData(connection, data.action, "roomName must be set.");
        return;
    }
    if(data.invite === null || data.invite === undefined){
        errors.missingData(connection, data.action, "invite must be set.");
        return;
    }

    let databaseConnection = null;
    try {
        databaseConnection = await mysql.getConnection(pool);

        let existingUsers = [];
        let usersToTest = [];
        const roomDisplayName = (data.roomType === "private")? null : data.roomName;


        if(roomDisplayName === null){//privateRoom
            usersToTest = [data.invite.toString(), user];
        } else { //public room
            usersToTest = data.invite;
        }

        //No need to remove duplicates from usersToTest because they don't ruin the sql statement
        let resultCheckUser = await mysql.query(
            databaseConnection,
            "SELECT `userID` FROM `user` WHERE `userID` IN (?);",
            [usersToTest],
            true
        );

        for(let i = 0; i < resultCheckUser.length; i++){
            existingUsers.push(resultCheckUser[i].userID);
        }

        //Filter all users that have not been added
        let usersNotAdded = utils.arrayMinus(usersToTest, existingUsers);

        let errorMsgInvalidUsers = {
            action:data.action,
            requestID:data.requestID,
            roomStatus:"invalid",
            invalidUsers:usersNotAdded
        };

        if(roomDisplayName === null && existingUsers.length !== 2){
            errorMsgInvalidUsers.errorMsg = "Private room needs exatly to users.";
            utils.writeObjectToWebsocket(connection, errorMsgInvalidUsers);
            databaseConnection.release();
            return;
        }
        if(existingUsers.length === undefined || existingUsers.length <= 0){
            errorMsgInvalidUsers.errorMsg = "Public room needs at least 1 person to be added.";
            utils.writeObjectToWebsocket(connection, errorMsgInvalidUsers);
            databaseConnection.release();
            return;
        }


        // Create the room in the room table
        let resultsRoomCreated = await mysql.query(
            databaseConnection,
            "INSERT INTO `room`(`displayName`) VALUE (?);",
            [roomDisplayName],
            true
        );

        //Setup constants for easier access
        const newRoomID = resultsRoomCreated.insertId;
        if(!newRoomID) throw new Error("Expected that insertID was set. See for details https://github.com/mysqljs/mysql#getting-the-id-of-an-inserted-row");
        const newRoomDatabaseName = utils.buildRoomDatabaseName(newRoomID);

        //Create the roomtable and add a creation message to it
        const messageRoomCreated = (roomDisplayName === null)?"Hello in your private chat room":"Room was created by " + user + " with name " + roomDisplayName + ".";
        let resultRoomCreation = await mysql.query(
            databaseConnection,
            "CREATE TABLE ?? (`messageID` INT NOT NULL AUTO_INCREMENT PRIMARY KEY, `userID` VARCHAR(30), `type` VARCHAR(20), `answerToMessageID` INT, `content` TEXT NOT NULL, `sendOn` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP );" +
            "INSERT INTO ??(`userID`, `type`, `content`) VALUES (?,?,?);",
            [newRoomDatabaseName, newRoomDatabaseName, user, "system", messageRoomCreated],
            true
        );


        //Assuming everything is fine with the query and moving on to next step
        //Building array of values to add
        let arrayToAdd = [];
        for(let i = 0; i < existingUsers.length; i++){
            arrayToAdd.push([newRoomID, existingUsers[i], 0]);
        }

        // Add all users to the room via adding them in the user_room table
        let resultUsersAdded = await mysql.query(
            databaseConnection,
            "INSERT INTO `user_room`(`roomID`, `userID`, `lastMessageRead`) VALUES ?;",
            [arrayToAdd],
            true
        );
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

        utils.writeObjectToWebsocket(connection, websocketResponse);

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

        utils.writeObjToAllUsers(existingUsers, connections, websocketNewMessageNotification);
    } catch (err){
        console.log(new Date() + " Error while creating room", err);
        errors.internalServerError(connection, data.action, data);
    } finally {
        try {
            if (databaseConnection) databaseConnection.release();
        } catch (err){
            console.log(new Date() + " Error while releasing database connection");
        }
    }
};
