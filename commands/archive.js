module.exports = async function() {
  const fetch = require("node-fetch");
  const Commands = require("../commands");
  const Database = await require("../database"); 
  const dbClient = Database.mongoClient;
  const db = dbClient.db("guilds");
  const collection = db.collection("GuildArchiveInfo");

  async function getGuildConfig(guildId) {
    
    // Look for data in cache
    var guildConfig = Database.cache.get(guildId + "archive");
    
    if (!guildConfig) {
      // Check if we have the DB client 
      if (!Database.mongoClient) {
        throw new Error("Database not defined");
      };
      
      // Get data from server
      guildConfig = await collection.findOne({guildId: guildId});
      
      // Update cache
      Database.cache.set(guildId + "archive", guildConfig);
    };
    
    // Return data
    return guildConfig;
    
  };
 
  const ArchiveCommand = new Commands.new("archive", ["archives"], "archive", "Archives a channel.", [
    {
      args: "",
      description: "Copy this channel's messages, and then send them to the default archive guild"
    }, {
      args: "set <guild id>",
      description: "Set the default archive guild"
    }, {
      args: "--json",
      description: "Copy this channel's messages, send them to the default archive guild, and turn them into a machine-readable JSON file"
    }, {
      args: "--no-channel --json", 
      description: "Copy this channel's messages, but only create a machine-readable JSON file"
    }
  ]);
  ArchiveCommand.setAction(async (bot, args, msg) => {

    const GuildId = msg.channel.guild.id;
    const AuthorId = msg.author.id;
    var guildConfig = await getGuildConfig(GuildId);

    if (args && args.toLowerCase().substring(0, 3) === "set") {

      // Get archive guild ID
      const LocationRegex = /(\d+)/gi;
      const ArchiveGuildMatch = [...args.matchAll(LocationRegex)];
      const ArchiveGuildId = ArchiveGuildMatch[0][1];
    
      if (!ArchiveGuildId) {
        msg.channel.createMessage({
          content: "<@" + msg.author.id + "> You didn't tell me a guild to send archives to!",
          embed: {
            description: "**Valid usage:**\narchive set **guildId**"
          }
        });

        return;
      };
      
      // Check if guild exists
      function botIsInGuild(possibleGuild, actualGuildId) {
        if (possibleGuild.id === ArchiveGuildId) {
          return possibleGuild;
        };
      };
      
      if (!bot.guilds.find(botIsInGuild)) {
        msg.channel.createMessage({
          content: "<@" + AuthorId + "> Either guild " + ArchiveGuildId + " doesn't exist, or I just wasn't invited to the party. :("
        });

        return;
      };

      // Check if there's already a row for the archive
      try {
        await collection.updateOne(
          {guildId: GuildId}, 
          {$set: {archiveGuildId: ArchiveGuildId}},
          {upsert: true}
        );
        
        // Update cache
        Database.cache.set(GuildId + "archive", await collection.findOne({guildId: GuildId}));
        
        // Tell them we're finished
        msg.channel.createMessage("<@" + AuthorId + "> Updated default archive guild ID to `" + ArchiveGuildId + "`!");

        // Set the cooldown
        this.applyCooldown(AuthorId, 5000);
      } catch (err) {
        
      };
      
      return;

    };

    // Make sure the user is a server manager
    if (!msg.member.permission.has("manageGuild")) {
      return;
    };
    
    // Check if guild exists
    const ArchiveGuildId = guildConfig.archiveGuildId;
    function botIsInGuild(possibleGuild) {
      if (possibleGuild.id === ArchiveGuildId) {
        return possibleGuild;
      };
    };
    
    if (!bot.guilds.find(botIsInGuild)) {
      msg.channel.createMessage({
        content: "<@" + AuthorId + "> I don't have access to guild " + ArchiveGuildId + "! Please invite me to the guild, or set a new guild ID."
      });

      return;
    };

    const ConvertToJSON = args ? args.includes("--json") : false;
    const SendToChannel = args ? !args.includes("--no-channel") : true;

    // Make sure we're archiving for a reason
    if (!SendToChannel && !ConvertToJSON) {
      msg.channel.createMessage("<@"+ AuthorId +"> You've used the `--no-channel` flag, but didn't use the `--json` flag.");
      return;
    };

    // Tell the user that this may take a long time
    var phaseTwoMessage = await msg.channel.createMessage("<@"+ AuthorId +"> Getting **all** messages in this channel before this one I just sent. This may take a long time if there are a lot of messages. Please wait!");

    var lastMessageId = msg.id;
    var messages = [];
    var currentMessageList;

    try {

      async function keepGoing() {
        currentMessageList = await msg.channel.getMessages(100, lastMessageId);

        if (currentMessageList[0]) {
          
          // Send signal that the bot is still active
          await msg.channel.sendTyping();

          // Add messages to message pool
          messages = messages.concat(currentMessageList);

          // Mark old message
          lastMessageId = currentMessageList[currentMessageList.length - 1].id;
          
          // Keep searching
          await keepGoing();

        } else {

          messages = messages.reverse();

          // Create archive channel
          const archiveChannel = SendToChannel ? await bot.createChannel(guildConfig.archiveGuildId, msg.channel.name, 0) : undefined;

          // Tell them we're almost finished
          await msg.channel.createMessage("<@" + msg.author.id + "> Almost finished! I just got all of this channel's messages. " + (SendToChannel ? "I'll be saving them in <#" + archiveChannel.id + ">" : "") + (SendToChannel && !ConvertToJSON ? "." : SendToChannel ? " and " : "I'll be ") + (ConvertToJSON ? "turning it into JSON now." : ""));

          if (SendToChannel) {
            var userIcons = {};
            async function getUserIconFromUser(user) {

              if (!userIcons[user.id]) {

                // Get user avatar URL
                const avatarResponse = await fetch(user.avatarURL),
                      avatarBuffer = await avatarResponse.buffer();

                const botMessage = await archiveChannel.createMessage(
                  user.username + "#" + user.discriminator + "'s avatar: ", {
                    file: avatarBuffer,
                    name: "AVI_" + user.id + ".png"
                  }
                );

                userIcons[user.id] = botMessage.attachments[0].url;

              };

              return userIcons[user.id];

            };

            // Create webhook in the channel
            const webhook = await archiveChannel.createWebhook({
              name: "Toasty's User Impersonator"
            }, "Fufilling an archive request");

            // Store pinned messages
            const pinnedMessages = await msg.channel.getPins();

            for (var i = 0; messages.length > i; i++) {

              // This might take a bit
              await msg.channel.sendTyping();
            
              // Check if message has an attachment
              var file = [];
              if (messages[i].attachments.length > 0) {

                // Download the attachments
                for (var attachment = 0; messages[i].attachments.length > attachment; attachment++) {

                  const attachmentResponse = await fetch(messages[i].attachments[attachment].url);
                  file.push({
                    file: await attachmentResponse.buffer(),
                    name: messages[i].attachments[attachment].filename
                  });

                };

              };

              // Send the message
              const webhookMessage = await bot.executeWebhook(webhook.id, webhook.token, {
                auth: true,
                content: messages[i].content,
                allowedMentions: {
                    users: false
                },
                username: messages[i].author.username,
                avatarURL: await getUserIconFromUser(messages[i].author),
                wait: true,
                embeds: [
                  {
                    footer: {
                      text: "Message ID: " + messages[i].id + " • User ID: " + messages[i].author.id
                    },
                    timestamp: new Date(messages[i].timestamp)
                  }
                ],
                file: file

              });

              // Check if message is pinned
              if (pinnedMessages.find((pinnedMessage) => {
                if (pinnedMessage.id === messages[i].id) {
                  return pinnedMessage;
                };
              })) {
                await webhookMessage.pin();
              };

            };
            
            // Delete the webhook
            await bot.deleteWebhook(webhook.id, undefined, "Cleaning up archive webhook");
          };

          var jsonURL;
          if (ConvertToJSON) {

            // Send JSON to the server
            const JSONMessages = JSON.stringify(messages);

            try {
              const Response = await fetch("http://127.0.0.1:" + process.env.PORT + "/archives/" + msg.channel.guild.id + "/" + msg.channel.id, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json"
                },
                body: JSONMessages
              });
              const JSONResponse = await Response.json();
              var jsonURL = JSONResponse.url;
            } catch (err) {
              console.log(err)
            };

          };

          // Tell them we're finished!
          await msg.channel.createMessage("<@" + AuthorId + "> Finished! " + (SendToChannel ? "All of your messages can be found in <#" + archiveChannel.id + ">." : "") + (ConvertToJSON && jsonURL ? "The JSON file can be found here: " + jsonURL : ConvertToJSON && !jsonURL ? "I had a problem turning the messages into a JSON file." : ""));
          
          // Set the cooldown
          ArchiveCommand.applyCooldown(AuthorId, 10000);

        };

      };

      await keepGoing();
    } catch (err) {
      await msg.channel.createMessage("Couldn't archive the channel: " + err.message);
    };
  }, 3000);
  
};