module.exports = async function() {
  const Commands = require("../commands");
  const Database = await require("../database"); 
  const dbClient = Database.mongoClient;
  const db = dbClient.db("guilds");
  const collection = db.collection("GuildLogInfo");

  async function getGuildConfig(guildId) {
    
    // Look for data in cache
    var GuildConfig = Database.cache.get(guildId + "logs");
    
    if (GuildConfig) {
      return GuildConfig;
    };
    
    // Check if we have the DB client 
    if (!Database.mongoClient) {
      throw new Error("Database not defined");
    };
    
    // Get data from server
    var guildConfig = await collection.findOne({guildId: guildId}) || {loggingEnabled: 0};
    
    // Update cache
    Database.cache.set(guildId + "logs", guildConfig);
    
    // Return fresh data
    return guildConfig;
    
  };

  var command;
  command = new Commands.new("logs", ["log"], "logging", "Modify log settings", [
    {
      args: "",
      description: "Get logging status for this guild"
    }, {
      args: "set <#channel or channel ID>",
      description: "Send all longs to `<#channel>`"
    }, {
      args: "enable",
      description: "Enable logging for this server",
    }, {
      args: "disable",
      description: "Disable logging for this server"
    }
  ], async (bot, args, msg) => {

    // Check permissions
    if (!msg.member.permission.has("manageGuild")) {
      msg.channel.createMessage(AuthorPing + " You don't have permission to manage logs.");
      return;
    };
    
    const AuthorId = msg.author.id;
    const AuthorPing = "<@" + AuthorId + ">";
    const GuildId = msg.channel.guild.id;
    var guildConfig = await getGuildConfig(GuildId);
    
    function sendLogStatus() {
      const LogChannelsString = guildConfig.logChannelIds ? guildConfig.logChannelIds : "[]";
      const LogChannels = JSON.parse(LogChannelsString);
      var ValidChannels = [];
      var InvalidChannels = [];
      
      // Verify Toasty's access
      for (var i = 0; LogChannels.length > i; i++) {
        if (bot.getChannel(LogChannels[i])) {
          ValidChannels.push("<#" + LogChannels[i] + ">");
        } else {
          InvalidChannels.push(LogChannels[i]);
        };
      };
    
      ValidChannels[ValidChannels.length - 1] = (ValidChannels.length > 1 ? "and " : "") + ValidChannels[ValidChannels.length - 1];

      msg.channel.createMessage(
        AuthorPing + " Message logging is " + (
          guildConfig.loggingEnabled ? "**enabled**, " + (
            ValidChannels[0] ? "and logs are being broadcast to " + ValidChannels.join(", ") + "." : "however, the log broadcast channel doesn't exist."
          ) : "disabled."
        )
      );
    };

    // Check for arguments
    const ArgsMatch = (args || "").match(/toggle|disable|enable|set|status/);
    
    if (!ArgsMatch) {
      sendLogStatus();
      return;
    };
    
    switch (ArgsMatch[0]) {
      case "toggle":
      case "disable":
      case "enable":

        // Check if logs are enabled
        const LoggingEnabled = guildConfig.loggingEnabled;
        if (args !== "toggle" && ((LoggingEnabled && args === "enable") || (!LoggingEnabled && args === "disable"))) {
          msg.channel.createMessage(AuthorPing + " Already ahead of you! Logs are " + args + "d.");
          break;
        };

        // This might take a bit
        await msg.channel.sendTyping();
        
        // Enable logs
        var loggingSetting = args == "enable" ? 1 : 0;
        await collection.updateOne(
          {guildId: GuildId}, 
          {$set: {loggingEnabled: loggingSetting}},
          {upsert: true}
        );
        
        // Update cache
        Database.cache.set(GuildId + "logs", await collection.findOne({guildId: GuildId}));

        // Set cooldown
        command.applyCooldown(AuthorId, 5000);
        
        // Success.
        msg.channel.createMessage(AuthorPing + " Logging systems " + (LoggingEnabled ? "offline" : "online") + ".");
        break;
      
      case "set":
        
        const LocationRegex = /(<#(\d+)>|\d+)/g;
        const LogChannelMatches = [...args.matchAll(LocationRegex)];
        
        // Verify that the channels exist
        var LogChannels = [];
        if (!LogChannelMatches[0]) {
          msg.channel.createMessage(AuthorPing + " You didn't mention any channel or ID.");
          return;
        };

        for (var i = 0; LogChannelMatches.length > i; i++) {
          
          const LogChannelId = LogChannelMatches[i][1].includes("#") ? LogChannelMatches[i][2] : LogChannelMatches[i][1];
          const LogChannel = bot.getChannel(LogChannelId);
          
          if (!LogChannel) {
            msg.channel.createMessage(AuthorPing + " " + LogChannelId + " isn't a valid channel ID, or I can't access that channel.");
            return;
          };
          
          // Add it to the list
          LogChannels.push(LogChannelId);
          
        };
        
        const LogChannelsString = JSON.stringify(LogChannels);
        
        // Update the log channels
        await collection.updateOne(
          {guildId: GuildId}, 
          {$set: {logChannelIds: LogChannelsString}},
          {upsert: true}
        );
        
        // Update cache
        Database.cache.set(GuildId + "logs", await collection.findOne({guildId: GuildId}));
        
        // Set cooldown
        command.applyCooldown(AuthorId, 5000);
        
        // Tell the user
        for (var i = 0; LogChannels.length > i; i++) {
          LogChannels[i] = (LogChannels.length > 1 ? (i === 0 ? "" : ", " + (i + 1 === LogChannels.length ? "and " : "")) : "") + "<#" + LogChannels[i] + ">";
        };
        
        msg.channel.createMessage(AuthorPing + " I'll file this server's logs in " + LogChannels.join("") + "!");
        break;
        
      case "status":
        sendLogStatus();
        break;
        
      default:
        msg.channel.createMessage("Invalid");
        break;
    };
    
  }, 3000);
};