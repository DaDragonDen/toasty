const Commands = require("../commands");

module.exports = async function(bot) {
  const Database = await require("../database");
  const dbClient = Database.mongoClient;
  const db = dbClient.db("guilds");
  const collection = db.collection("GuildLogInfo");
  
  async function getGuildConfig(guildId) {
    
    // Look for data in cache
    var guildConfig = Database.cache.get(guildId + "logs");
    
    if (!guildConfig) {
      // Check if we have the DB client 
      if (!Database.mongoClient) {
        throw new Error("Database not defined");
      };
      
      // Get data from server
      guildConfig = await collection.findOne({guildId: guildId});
      
      // Update cache
      Database.cache.set(guildId + "logs", guildConfig);
    };
    
    // Return data
    return guildConfig;
    
  };
  
  bot.on("messageDelete", async (msg) => {
    
    try {
      const GuildConfig = await getGuildConfig(msg.channel.guild.id);
      const LogChannelsString = GuildConfig ? GuildConfig.logChannelIds : undefined;
      const LogChannels = LogChannelsString ? JSON.parse(LogChannelsString) : [];
      
      if (!LogChannels || LogChannels.length === 0) {
        console.log("Guild " + msg.channel.guild.id + " doesn't have a log channel.")
        return;
      };

      for (var i = 0; LogChannels.length > i; i++) {
        
        const LogChannel = bot.getChannel(LogChannels[i]);
        
        // Check if we have access to the channel
        if (!LogChannel) {
          continue;
        };
        
        // Sort out the fields
        var author = msg.author ? {
              name: msg.author.username + "#" + msg.author.discriminator,
              icon_url: msg.author.avatarURL
            } : undefined;
        var fields = [{
          name: "Channel",
          value: "<#" + msg.channel.id + ">"
        }];
        
        if (msg.content) {
          fields.push({
            name: "Content",
            value: msg.content
          });
        };
        
        // Send the log
        await LogChannel.createMessage({
          content: "A message sent by **" + (msg.author ? msg.author.username : "an unknown sender") + "** was deleted.",
          embed: {
            author: author, 
            color: 16715278,
            fields: fields,
            footer: {
              text: msg.id
            }
          }
        });
      };
    } catch (err) {
      console.warn("Couldn't log deleted message: " + err);
    };
    
  });
};