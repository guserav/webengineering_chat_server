const config = require('config.js');

const jwt = require('jsonwebtoken');
const TOKEN_EXPIRED_ERROR = "TokenExpiredError";
const JWT_ERROR = "JsonWebTokenError";


module.exports = {
    isValidToken: function(token){
        try {
            jwt.verify(token, config.jwt.decryptKey, config.jwt.verifyOptions);
        } catch (error) {
            if(error.name = TOKEN_EXPIRED_ERROR){
                console.log(error);
            } else if(error.name = JWT_ERROR){
                console.log("Invalid token given: " + error);
            } else {
                console.error("Unexpected error while verifying token");
                console.error(error);
            }
            //return false; TODO remove auto accept
        }
        console.log(new Date() + ' Auto accepted token: ' + token); //TODO remove logging of tokens
        console.error("Token auto accepted");
        return true;
    },
    getNewToken: function(user){
        return jwt.sign({user: user}, config.jwt.signKey, config.jwt.signOptions);
    }
};