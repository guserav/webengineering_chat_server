const mysql = require('../mysql.js');
const utils = require('./utils.js');
const errors = require('../errors.js');

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
module.exports = async function(connection, data, pool, connections) {
    const user = utils.getUserFromData(data);
    const userToTest = data.users;
    const room = data.roomID;

    if(userToTest === undefined || userToTest.length <= 0 || typeof userToTest === "string" || userToTest instanceof String){
        errors.missingData(connection, data.action, "To add users they need to be specified in a array.");
        return;
    }

    let databaseConnection = null;
    try {
        databaseConnection = await mysql.getConnection(pool);


        let resultTestValidaty = await mysql.query(
            databaseConnection,
            "SELECT `displayName` FROM `room` WHERE `roomID` = ?;" +
            "SELECT * FROM `user_room` WHERE `userID` = ? AND `roomID` = ?;" +
            "SELECT `userID` FROM `user_room` WHERE `roomID` = ?;" +
            //Get all valid user names that are not already added to the group
            "SELECT `userID` FROM `user` WHERE `userID` NOT IN (SELECT `userID` FROM `user_room` WHERE `roomID` = ?) AND `userID` IN (?);" +
            "SELECT `messageID` FROM ?? ORDER BY `messageID` DESC LIMIT 1;",
            [room, user, room, room, room, userToTest, utils.buildRoomDatabaseName(room)],
            true
        );

        if(resultTestValidaty.length !== 5 || resultTestValidaty[1].length !== 1){
            errors.invalidRequest(connection, data.action, "User can't add persons to room he isn't in himself.", data);
            return;
        }
        //Test if private room
        if(resultTestValidaty[0][0].displayName === undefined || resultTestValidaty[0][0].displayName === null){
            errors.invalidRequest(connection, data.action, "Cant't add user to private room.", data);
            return;
        }

        const usersInRoom = resultTestValidaty[2].map((e) => e.userID);
        const usersToAdd = resultTestValidaty[3].map((e) => e.userID);
        const lastMessageID = resultTestValidaty[4][0].messageID;

        if(usersToAdd === undefined || !(usersToAdd.length > 0)){
            errors.missingData(connection, data.action, "No valid users to Add");
            return;
        }

        //Filter all users that have not been added
        let usersNotAdded = utils.arrayMinus(userToTest, usersToAdd);

        //Building array of values to add
        let arrayToAdd = [];
        for(let i = 0; i < usersToAdd.length; i++){
            arrayToAdd.push([room, usersToAdd[i], lastMessageID]);
        }

        const USER_ADDED_MESSAGE = "Users where added to the room";
        let resultAddingUsers;
        try {
            resultAddingUsers = await mysql.query(
                databaseConnection,
                "INSERT INTO `user_room`(`roomID`, `userID`) VALUES ?;INSERT INTO ??(`type`, `userID`, `content`) VALUES (?,?,?);",
                [arrayToAdd, utils.buildRoomDatabaseName(room), "system", user, USER_ADDED_MESSAGE],
                true
            );
        } catch (err){
            console.log(new Date(), err);
            utils.writeObjectToWebsocket(connection, {
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
        utils.writeObjectToWebsocket(connection, answer);
        let newMessageNotification = {
            action:"newMessages",
            data:[{
                roomID:room,
                messages:[{
                    type:"system",
                    userID:user,
                    content:USER_ADDED_MESSAGE,
                    sendOn:new Date(),
                    messageID:resultAddingUsers[1].insertId
                }]
            }]
        };
        utils.writeObjToAllUsers(usersToAdd, connections, newMessageNotification);
        utils.writeObjToAllUsers(usersInRoom, connections, newMessageNotification);
    } catch (err){
        console.log(new Date() + " Error while adding user to room", err);
        errors.internalServerError(connection, data.action, data);
    } finally {
        try {
            if (databaseConnection) databaseConnection.release();
        } catch (err){
            console.log(new Date() + " Error while releasing database connection" + err);
        }
    }
};
