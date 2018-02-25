const config = require('./config.js');

const jwt = require('jsonwebtoken');
const TOKEN_EXPIRED_ERROR = "TokenExpiredError";
const JWT_ERROR = "JsonWebTokenError";


module.exports = {
    /**
     * Checks if a token is valid.
     * @param token {String} the jwt to check
     * @returns {undefined | object} Representing the data in the jwt
     */
    isValidToken: function(token){
        let decodedToken;
        try {
            decodedToken = jwt.verify(token, config.jwt.decryptKey, config.jwt.verifyOptions);
        } catch (error) {
            if(error.name = TOKEN_EXPIRED_ERROR){
                console.log(error);
            } else if(error.name = JWT_ERROR){
                console.log("Invalid token given: " + error);
            } else {
                console.error(new Date() + "Unexpected error while verifying token");
                console.error(error);
            }
            return undefined;
        }
        return decodedToken;
    },

    /**
     * Create a new Token for the given user.
     *
     * This method should only be called after the user has been verified.
     * @param user The userIDs
     * @returns {String}
     */
    getNewToken: function(user){
        return jwt.sign({user: user}, config.jwt.signKey, config.jwt.signOptions);
    }
};