module.exports = async (bot, msg, guildConfig, deleted, oldMessage) => {

  try {

    // Make sure we have a channel
    const LogChannelsString = guildConfig ? guildConfig.logChannelIds : undefined;
    const LogChannels = LogChannelsString ? JSON.parse(LogChannelsString) : [];
    if (!LogChannels || LogChannels.length === 0) {

      console.log("Guild " + msg.channel.guild.id + " doesn't have a log channel.");
      return;

    }

    // Check if the message was deleted or edited
    if (!deleted && (!oldMessage || oldMessage.content === msg.content)) return;

    // Send the message to the log channel
    for (let i = 0; LogChannels.length > i; i++) {
      
      const LogChannel = bot.getChannel(LogChannels[i]);
      
      // Check if we have access to the channel
      if (!LogChannel) {

        continue;

      }
      
      // Sort out the fields
      const author = msg.author ? {
        name: msg.author.username + "#" + msg.author.discriminator,
        icon_url: msg.author.avatarURL
      } : undefined;
      const fields = [{
        name: "Channel",
        value: "<#" + msg.channel.id + ">"
      }];
      
      if (msg.content) {

        fields.push({
          name: (deleted ? "C" : "New c") + "ontent",
          value: msg.content
        });

        if (oldMessage) {
          
          fields.push({
            name: "Old content",
            value: oldMessage.content
          });

        }

      }
      
      // Send the log
      await LogChannel.createMessage({
        content: deleted ? "A message sent by **" + (msg.author ? msg.author.username : "an unknown sender") + "** was deleted." : "**" + msg.author.username + "** edited their message.",
        embed: {
          author: author, 
          color: deleted ? 16715278 : 14994184,
          fields: fields,
          footer: {
            text: msg.id
          }
        }
      });

    }

  } catch (err) {

    console.log("\x1b[33m%s\x1b[0m", "[Logging] Couldn't log message: " + err);

  }

};
