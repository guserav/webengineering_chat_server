const config = require('./config.js');
const bodyParser = require('body-parser');
const token = require('./tokens.js');
const scrypt = require('js-scrypt');
const randomNumber = require("random-number-csprng");
const mysql = require('./mysql.js');

function setCORSHeader(req, res, next){
    res.set("Access-Control-Allow-Origin", config.http.corsAllowOrigin);
    res.set("Access-Control-Allow-Methods", "DELETE, HEAD, GET, OPTIONS, POST, PUT");
    res.set("Access-Control-Allow-Headers", "Content-Type, Content-Range, Content-Disposition, Content-Description");
    res.set("Access-Control-Max-Age", "60");
    next();
}

function writeObjectToWebpage(res, obj){
    res.write("<pre>" + JSON.stringify(obj, null, 2) + "</pre>");
}

module.exports = {
    setDatabaseConnectionPool: function(pool){
        if(!pool) console.error(new Date() + " Database connection not valid");
        this.databaseConPool = pool;
    },

    initialiseApp: function(app){
        const _this = this;

        app.use(bodyParser.json());
        app.use(setCORSHeader); //Set CORS header for every request
        app.post("/user/newToken",async function(req, res){
            const password = req.body.password;
            const user = req.body.user;
            try{
                const results = await mysql.query(
                    _this.databaseConPool,
                    'SELECT * FROM `user` WHERE `user`.`userID` = ?',
                    [user]
                );

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
            } catch (err){
                console.error(new Date() + err);
                res.sendStatus(500);
            }
        });

        app.post("/user/create",async function(req, res){
            try {
                const password = req.body.password;
                const user = req.body.user;

                if (password === undefined || user === undefined) {
                    res.sendStatus(403);
                    return;
                }

                let saltArray = [];
                for (let i = 0; i < 32; i++) {
                    let randomInt = await randomNumber(-Math.pow(2, 8 * 2), Math.pow(2, 8 * 2));
                    saltArray.push(randomInt);
                }

                const salt = Buffer.from(saltArray).toString('base64');
                const hash = scrypt.hashSync(password, salt).toString('base64');

                await mysql.query(
                    _this.databaseConPool,
                    'INSERT INTO `user`(`userID`, `passwordHash`, `salt`) VALUES (? , ?, ?)',
                    [user, hash, salt]
                );

                res.sendStatus(200);
            } catch (err){
                console.error(new Date() + err);
                res.sendStatus(403);
            }
        });

        if(config.debug === true){
            app.get("/debug", function(req, res){//Return links for easy access of debug enpoints
                res.send(
                    "<a href='/displayTable'>display Tables</a><br/>" +
                    "<a href='/displayTable?table=room'>room</a><br/>" +
                    "<a href='/displayTable?table=user_room'>user_room</a><br/>" +
                    "<a href='/displayTable?table=user'>user</a><br/>"
                );
            });

            app.get("/resetDatabase", function(req, res){
                mysql.resetDatabase(_this.databaseConPool, function(err, result){
                    if(err){
                        console.error(new Date() + err);
                        res.status(500).send("Failed to perform query.\n" + JSON.stringify(err));
                        return;
                    }
                    console.log(new Date() + "Successfully reset database.");
                    res.status(200);
                    writeObjectToWebpage(res, result);
                    res.end();
                });
            });

            app.get("/displayTable", async function(req, res) {
                try {
                    if (req.query.table){
                        writeObjectToWebpage(res, await mysql.query(_this.databaseConPool, "SELECT * FROM ??;", [req.query.table]));
                    }else{
                        writeObjectToWebpage(res, await mysql.query(_this.databaseConPool, "SELECT table_name FROM information_schema.tables WHERE table_schema = (SELECT DATABASE());"));
                    }
                    res.write("<a href='/displayTable?table='>/displayTable?table=</a>");
                    res.end();
                } catch (err){
                    res.sendStatus(500);
                }
            });
        }
    }
};