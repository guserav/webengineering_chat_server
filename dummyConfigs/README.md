# Configs
## config.json
This config is the base config to specify the general configuration of the chatserver.
The config has the following categories:
## debug
Boolean that indicates whether the server should be started in debug mode.
## jwt
Includes the all options related to JavascriptWebTokens.

- signKeyLocation: The path of the file containing the signing key (Path is relative to /config)
- decryptKeyLocation: The path of the file containing the decrypting key (Path is relative to /config)
- signOptions: a object containing the options for [jwt.sign](https://github.com/auth0/node-jsonwebtoken#jwtsignpayload-secretorprivatekey-options-callback)
- verifyOptions: a object containing the options for [jwt.verify](https://github.com/auth0/node-jsonwebtoken#jwtverifytoken-secretorpublickey-options-callback)


## database
All options for the database pool connection.
The config object is passed plain to the database connection therefor it should have the form of the [specification](https://github.com/mysqljs/mysql#pool-options)

## websocket

- acceptOrigin a String or an array of string for the origins to accept for a websocket connection
## http
All options related to the http server

- port: the port to listen on
- corsAllowOrigin: To write in the http response in the header [Access-Control-Allow-Origin](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Allow-Origin)