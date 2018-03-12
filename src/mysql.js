

module.exports = {
    resetDatabase:function(databaseConPool, callback){
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

        databaseConPool.query(dropAllTable, callback);
    },

    /**
     * Query the specified query on the given connection or pool.
     *
     * On error the connection will be released to the pool if it was generated from a pool.
     *
     * @param databaseConnection a pool or database Connection generated from the pool
     * @param sqlQuery The query to perform can have ? to be filled with data
     * @param data The data array to fill in the escaped query
     * @param isPoolConnection must be true if the connection is from a pool and should be destroyed / released on failure
     * @returns {Promise}
     */
    query:function(databaseConnection, sqlQuery, data, isPoolConnection){
        return new Promise(function(accept, reject){
            databaseConnection.query(sqlQuery, data?data:[], function(err, result){
                if(err){
                    if(err.fatal){ // connection terminated
                        if(isPoolConnection) databaseConnection.destroy();
                        console.error(new Date() + " Database connection terminated before performing query", err);
                    } else {
                        if(isPoolConnection) databaseConnection.release();
                        console.log(new Date() + " Error while performing query.", err);
                    }
                    reject(err);
                    return;
                }
                accept(result);
            });
        });
    },

    /**
     * Returns a Promise that resolves into a database connection or an error if the acquiring fails.
     * @param pool The Database pool to fetch a connection from.
     * @returns {Promise}
     */
    getConnection:function(pool){
        return new Promise(function(accept, reject){
            pool.getConnection(function(err, connection){
                if(err){
                    console.error(new Date() + " Failed to acquire a connection from the pool", err);
                    reject(err);
                }else if(!connection){
                    console.error(new Date() + " No Connection object received and no error");
                    reject(new Error("No connection aquired"));
                }else{
                    accept(connection);
                }
            });
        });
    }
};
