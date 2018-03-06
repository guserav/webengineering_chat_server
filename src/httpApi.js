const config = require('./config.js');
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

            res.set("Access-Control-Allow-Origin", config.http.corsAllowOrigin);
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
                });
            });
        });

        app.post("/user/create",async function(req, res){
            const password = req.body.password;
            const user = req.body.user;

            res.set("Access-Control-Allow-Origin", config.http.corsAllowOrigin);
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
                    // TODO add detailed answer
                    connection.release();
                    if(err){
                        res.sendStatus(403);
                        return;
                    }
                    res.sendStatus(200);
                });
            });
        });

        if(config.debug === true){
            app.get("/resetDatabase", function(req, res){
                //TODO reset Database
                //See script https://medium.com/@inanbunyamin90/how-to-drop-all-tables-in-mysql-f711774b6645
                const dropAllTable = /*"SET FOREIGN_KEY_CHECKS = 0;\n" +*/
                    "SET GROUP_CONCAT_MAX_LEN=32768;\n" +
                    "SET @tables = NULL;\n" +
                    "SELECT GROUP_CONCAT('`', table_name, '`') INTO @tables\n" +
                    "  FROM information_schema.tables\n" +
                    "  WHERE table_schema = (SELECT DATABASE());\n" +
                    "SELECT IFNULL(@tables,'dummy') INTO @tables;\n" +
                    "\n" +
                    "SET @tables = CONCAT('DROP TABLE IF EXISTS ', @tables);\n" +
                    "PREPARE stmt FROM @tables;\n" +
                    "EXECUTE stmt;\n" +
                    "DEALLOCATE PREPARE stmt;\n" +/*
                    "SET FOREIGN_KEY_CHECKS = 1;"*/
                    "CREATE TABLE `user` ( `userID` VARCHAR(30) NOT NULL PRIMARY KEY, `passwordHash` TEXT NOT NULL , `salt` TEXT NOT NULL) ENGINE = InnoDB;" +
                    "CREATE TABLE `room` ( `roomID` INT NOT NULL AUTO_INCREMENT , `displayName` VARCHAR(200), PRIMARY KEY (`roomID`)) ENGINE = InnoDB;" +
                    "CREATE TABLE `user_room` ( `roomID` INT NOT NULL, `userID` VARCHAR(30), `lastMessageRead` INT, PRIMARY KEY (`roomID`, `userID`)) ENGINE = InnoDB;";

                _this.databaseConPool.getConnection(function (err, connection) {
                    if(err){
                        console.error(new Date() + err);
                        res.status(500).send("Failed to acquire database connection.\n" + JSON.stringify(err));
                        return;
                    }
                    connection.query(dropAllTable, function(err, result){
                        if(err){
                            console.error(new Date() + err);
                            res.status(500).send("Failed to perform query.\n" + JSON.stringify(err));
                            return;
                        }
                        console.log(new Date() + "Successfully reset database.");
                        res.status(200).send("Successfully performed query.\n" + JSON.stringify(result));
                    });
                });
            });
        }
    }
};