
module.exports = {
    isValidToken: function(token){
       console.log(new Date() + ' Auto accepted token: ' + token); //TODO remove logging of tokens
       // TODO check token validity
        return true;
    }
};