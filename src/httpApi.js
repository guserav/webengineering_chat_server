const bodyParser = require('body-parser');
const token = require('./tokens.js');
const scrypt = require('js-scrypt');
const randomNumber = require("random-number-csprng");

module.exports = {
    setDatabaseConnectionPool: function(pool){
        if(!pool) console.error(new Date() + " Database connection not valid");
        this.databaseConPool = pool;
    },

    initialiseApp: function(app){
        const _this = this;

        app.use(bodyParser.json());
        app.post("/user/newToken",async function(req, res){
            const password = req.body.password;
            const user = req.body.user;

            _this.databaseConPool.getConnection(function(err, connection){
                if(err) throw err;
                connection.query('SELECT * FROM `user` WHERE `user`.`userID` = ?', [user], function(err, results, fields){
                    connection.release();
                    if(err){
                        console.error(err);
                        res.sendStatus(500);
                        return;
                    }
                    if(results.length !== 1){
                        res.status(403).send("Username or password not correct");
                        return;
                    }
                    const lookupPassword = results[0].passwordHash;
                    const salt = results[0].salt;

                    const computedPassword = scrypt.hashSync(password, salt).toString('base64');

                    if(computedPassword !== lookupPassword){
                        res.status(403).send("Username or password not correct");
                        return;
                    }
                    res.status(200).send(token.getNewToken(user));
                })
            });
        });

        app.post("/user/create",async function(req, res){
            const password = req.body.password;
            const user = req.body.user;
            if(password === undefined || user === undefined){
                res.sendStatus(403);
                return;
            }

            let saltArray = [];
            for (let i = 0; i < 32; i++){
                let randomInt = await randomNumber(-Math.pow(2, 8 * 2), Math.pow(2, 8 * 2));
                saltArray.push(randomInt);
            }

            const salt = Buffer.from(saltArray).toString('base64');
            const hash = scrypt.hashSync(password, salt).toString('base64');

            _this.databaseConPool.getConnection(function(err, connection){
                if(err) throw err;
                connection.query('INSERT INTO `user`(`userID`, `passwordHash`, `salt`) VALUES (? , ?, ?)', [user, hash, salt], function(err, results, fields) {
                    connection.release();
                    if(err){
                        res.sendStatus(403);
                        return;
                    }
                    res.sendStatus(200);
                });
            });
        });
    }
};