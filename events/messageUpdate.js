const Commands = require("../commands");

module.exports = async function(bot) {
  const Database = await require("../database");
  const dbClient = Database.mongoClient;
  const db = dbClient.db("guilds");
  const collection = db.collection("GuildLogInfo");
  
  
};