const fs = require('fs');

let config;

try {
    config = JSON.parse(fs.readFileSync(__dirname + '../config/config.json', 'utf8'));
    //TODO: validate config errors
} catch (error){
    console.error('Error while parsing config.json');
    throw error;
}

const signKey = fs.readFileSync(__dirname + 'config/' + config.jwt.signKeyLocation, 'utf8');
const decryptKey = fs.readFileSync(__dirname + 'config/' + config.jwt.decryptKeyLocation, 'utf8');

if(signKey === undefined || decryptKey === undefined){
    throw new Error("Jwt keys are empty.");
}

console.log("Successfully parsed configuration.");
module.exports = {
    jwt:{
        signKey: signKey,
        decryptKey: decryptKey,
        signOptions: config.jwt.signOptions,
        verifyOptions: config.jwt.verifyOptions
    },
    database:config.database
};