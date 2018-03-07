

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

    query:function(databaseConnection, sqlQuery, data){
        return new Promise(function(accept, reject){
            databaseConnection.query(sqlQuery, data?data:[], function(err, result){
                if(err){
                    reject(err);
                    return;
                }
                accept(result);
            });
        );
    }
};
