const mysql = require('../mysql.js');
const utils = require('./utils.js');
const errors = require('../errors.js');

/**
 * Gets the rooms the requesting user is in.
 *
 * @param connection the database connection to answer to
 * @param data the data of the request
 * @param pool the database connection pool
 */
module.exports = async function(connection, data, pool) {
    const user = utils.getUserFromData(data);

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
                        [utils.buildRoomDatabaseName(resultMemberOfRooms[i].roomID)],
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
        utils.writeObjectToWebsocket(connection, {
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
};
