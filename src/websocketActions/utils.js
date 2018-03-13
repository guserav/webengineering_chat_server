const jwt = require('jsonwebtoken');
module.exports = {

    /**
     * Writes JSON representation of the object to the websocket
     * @param connection the websocket connection to write to
     * @param obj the obj to write
     */
    writeObjectToWebsocket:function (connection, obj){
        connection.sendUTF(JSON.stringify(obj));
    },

    /**
     * Builds the roomDatabaseName from the roomID
     * @param roomID Id of the room
     * @returns {string} representing the database name
     */
    buildRoomDatabaseName:function (roomID){
        return "RoomMessages_" + roomID.toString();
    },

    /**
     * Returns the user that is specified in the jwt token
     * @param data the sent data of the request
     * @returns {String} representing the userID
     */
    getUserFromData:function (data){
        return jwt.decode(data.token).user;
    },

    /**
     * Writes the given object to all users specified that are currently connected
     * @param users Array of userID to write to
     * @param connections All connections that are currently active
     * @param broadcastToAll The object to send
     */
    writeObjToAllUsers:function (users, connections, broadcastToAll) {
        for (let i = 0; i < users[1].length; i++) {
            const userConnection = connections[users[1][i]];
            if (userConnection) {
                try {
                    //Test if connection is still open
                    if (userConnection.connected && userConnection.closeDescription === null) {
                        this.writeObjectToWebsocket(userConnection, broadcastToAll);
                    }
                } catch (err) {
                    console.error(new Date() + "Tried to send new message request to a websocket that should still be open.: " + err);
                }
            }
        }
    },

    /**
     * Adds all Elements that are in a and not in b to dest and returns it
     * @param a {Array}
     * @param b {Array}
     * @return {Array}
     */
    arrayMinus:function (a, b) {
        let dest = [];
        for (let i = 0; i < a.length; i++) {
            let found = false;
            for (let j = 0; j < b; j++) {
                if (a[i] === b[j]) {
                    found = true;
                }
            }
            if (!found) {
                //Prevent adding duplicates to usersNotAdded
                for (let j = 0; j < dest.length; j++) {
                    if (dest[j] === a[i]) {
                        found = true;
                    }
                }
                if (!found) {
                    dest.push(a[i]);
                }
            }
        }
        return dest;
    }
};
