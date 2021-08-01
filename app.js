// Packages and services
const path = require("path");
const fs = require("fs");
const Eris = require("eris");

// Get environment variables
require("dotenv").config();

// Load Discord
const bot = new Eris(process.env.token, {requestTimeout: 30000});

async function loadDB() {

  console.log("\x1b[36m%s\x1b[0m", "[Client] Updating database variables...");

  database = await require("./database");
  dbClient = database.mongoClient;
  db = dbClient.db("guilds");
  collections = {
    autoRoles: db.collection("AutoRoles"),
    staffFeedback: db.collection("StaffFeedback"),
    interactions: db.collection("Interactions"),
    questions: db.collection("Questions")
  };

  console.log("\x1b[32m%s\x1b[0m", "[Client] Database variables updated");
  
}

let commands;
let bumpTimeout;
bot.once("ready", async () => {

  // Time how long it takes for the bot to really start
  const startTime = new Date().getTime();
  console.log("\x1b[32m%s\x1b[0m", "[Client] Logged in!");

  // Check for the last bump time
  async function resetBumpTimeout(remainingTime) {

    bumpTimeout = setTimeout(async () => {

      bumpTimeout = undefined;
      await bot.createMessage("509403818031710208", {
        allowedMentions: {
          roles: true
        },
        content: "<@&851865112972886027> bumping's back!"
      });

    }, remainingTime || 7200000);

  }
  if (!bumpTimeout) {

    // Look for the last bump message
    //const messages = await bot.getMessages("509403818031710208");
    await resetBumpTimeout();

  }

  // Load the database
  await loadDB();
  
  // Load all commands
  commands = require("./commands");
  await commands.initialize(bot, collections);
  const folders = ["commands", "events"];
  for (let i = 0; folders.length > i; i++) {

    const files = fs.readdirSync(path.join(__dirname, folders[i]));
    for (let x = 0; files.length > x; x++) {

      const file = require("./" + folders[i] + "/" + files[x]);
      if (typeof(file) === "function") await file(bot, collections);

    }

  }

  // Upsert/delete slash commands where necessary
  const commandList = Object.keys(commands.list);
  for (let i = 0; commandList.length > i; i++) {

    await commands.list[commandList[i]].verifyInteraction();

  }
  
  console.log("\x1b[36m%s\x1b[0m", "[Client] Initializing events...");
  bot.on("messageCreate", async (msg) => {

    try {

      const ServerPrefix = commands.getPrefix(msg.channel.id);
      
      // Check if they just want the bot prefix
      const AuthorPing = "<@" + msg.author.id + ">";
      if (msg.content === "<@" + bot.user.id + ">" || msg.content === "<@!" + bot.user.id + ">") {

        msg.channel.createMessage(AuthorPing + " My prefix is **`" + ServerPrefix + "`**!");
        return;

      }
      
      if (msg.author.bot) {

        // Check if it's the bump bot
        if (msg.author.id === "302050872383242240" && msg.embeds[0].description.includes("Bump done")) {

          await resetBumpTimeout();
          
        }
        return;

      }
      
      // Check if it's a staff evaluation
      const reference = msg.messageReference;
      const guild = bot.guilds.find(possibleGuild => possibleGuild.id === "497607965080027136");
      const member = guild.members.find(possibleMember => possibleMember.id === msg.author.id);
      if (msg.channel.type === 1 && (msg.content.toLowerCase() === "start staff evaluation" || reference)) {

        if (member.roles.find(id => id === "498493188357750814")) {

          await msg.channel.sendTyping();
          
          // Get database if we don't have it
          if (!dbClient) {

            console.log("Getting database; it didn't load on ready apparently");
            await loadDB();

          }
          
          // Check if it's a response
          const collection = collections.staffFeedback;
          const uid = msg.author.id;
          const progress = await collection.findOne({userId: uid});
          let decisions = {};
          if (progress) {

            decisions = progress.decisions ? JSON.parse(progress.decisions) : {};
            if (reference && progress.lastMessageId === reference.messageID) {

              // Get the message
              const refMsg = await bot.getMessage(msg.channel.id, reference.messageID);
              const reactions = refMsg ? await refMsg.getReaction("👎") : undefined;
              if (reactions && reactions.find(reactor => reactor.id === uid)) {

                // Update their vote
                const staffId = refMsg.embeds[0].footer.text;
                const staffMember = guild.members.find(possibleMember => possibleMember.id === staffId);

                decisions[staffId] = [-1, refMsg.id, msg.content];
                await collection.updateOne(
                  {userId: uid}, 
                  {$set: {decisions: JSON.stringify(decisions)}},
                  {upsert: true}
                );

                // Update the message
                await refMsg.edit({
                  content: "You said that **" + staffMember.username + "** __is not__ a good fit for Da Dragon Den. Thank you for explaining!",
                  embed: {
                    color: 15551811,
                    author: {
                      name: (staffMember.roles.includes("862071715441803285") ? "President " : (
                        staffMember.roles.includes("862071540521369661") ? "Vice President " : (
                          staffMember.roles.includes("549312685255294976") ? "Governor " : "Draconic Guard "
                        )
                      )) + staffMember.username
                    },
                    fields: [{
                      name: "Your explanation",
                      value: msg.content
                    }],
                    description: "if you change your mind, shoot a msg to christian",
                    thumbnail: {
                      url: staffMember.avatarURL
                    }, 
                    footer: {
                      text: staffMember.id
                    }
                  }
                });

              }

            }

          }
          
          // Get all of the staff
          staff[guild.id] = guild.members.filter(possibleStaffMember => 
            possibleStaffMember.roles.includes("862071715441803285") || 
            possibleStaffMember.roles.includes("862071540521369661") || 
            possibleStaffMember.roles.includes("549312685255294976") || 
            member.roles.includes("753661816999116911"));
          const crew = staff[guild.id];
          const roles = ["862071715441803285", "862071540521369661", "549312685255294976"];
          crew.sort((member1, member2) => {

            let priority = 0;
            for (let i = 0; roles.length > i; i++) {

              const member1HasRole = member1.roles.includes(roles[i]);
              const member2HasRole = member2.roles.includes(roles[i]);
              priority = member1HasRole && !member2HasRole ? -1 : (member2HasRole && !member1HasRole ? 1 : 0);
              if (priority !== 0) break;

            }
            return priority;

          });
          
          // Check if they already voted
          let nextUp;
          if (decisions) {

            for (let i = 0; crew.length > i; i++) {

              if (!decisions[crew[i].id]) {

                nextUp = crew[i];
                break;

              }

            }

          }
          
          if (msg.content.toLowerCase() === "start staff evaluation" && nextUp && progress && progress.lastMessageId) {

            await msg.channel.createMessage(nextUp ? "This is where you left off: https://discord.com/channels/@me/" + msg.channel.id + "/" + progress.lastMessageId : "You already voted. Thank you!");
            return;

          }
          
          // Let's start 
          const evalMsg = await msg.channel.createMessage(nextUp ? {
            content: "Do you think **" + nextUp.username + "** is still a good fit for the team?",
            embed: {
              author: {
                name: (nextUp.roles.includes("862071715441803285") ? "President " : (nextUp.roles.includes("862071540521369661") ? "Vice President " : (nextUp.roles.includes("549312685255294976") ? "Governor " : "Draconic Guard "))) + nextUp.username
              },
              description: "\n\n> 👍 No problems with them" + 
                "\n\n> 🤫 I prefer not to say" + 
                "\n\n> 👎 They're problematic, and I'll tell you why!",
              thumbnail: {
                url: nextUp.avatarURL
              }, 
              footer: {
                text: nextUp.id
              }
            }
          } : "And that's everyone! Thanks for your input.");
          
          // Remember this message 
          await collection.updateOne(
            {userId: uid}, 
            {$set: progress ? {lastMessageId: evalMsg.id} : {
              lastMessageId: evalMsg.id, 
              decisions: "{}"
            }},
            {upsert: true}
          );
          
          // Add the reactions
          if (nextUp) {

            await evalMsg.addReaction("👍");
            await evalMsg.addReaction("🤫");
            await evalMsg.addReaction("👎");

          }

        } else {

          await msg.channel.createMessage("You're not an artisan, so you can't vote in this evaluation yet. Sorry about that!");

        }
        
        return;

      }
      
      // Check if it's a command
      let cmd, commandName, args;
      if (!msg.author.bot && msg.author.id !== bot.user.id && msg.content.substring(0, ServerPrefix.length) === ServerPrefix) {

        commandName = msg.content.indexOf(" ") !== -1 ? msg.content.substring(1, msg.content.indexOf(" ")) : msg.content.substring(1);
        args = msg.content.indexOf(" ") !== -1 && msg.content.substring(msg.content.indexOf(" ") + 1);
        
        if (commandName) {

          try {

            cmd = commands.get(commandName);
            if (cmd) cmd.execute(args, msg);

          } catch (err) {

            msg.channel.createMessage({
              content: AuthorPing + " Something bad happened! Please try again."
            });

          }

        }

      }
      
    } catch (err) {

      await msg.channel.createMessage("Sorry, I can't help you right now. If you see Christian, be a pal and show him this: \n```js\n" + err.stack + "\n```");
        
    }

  });
          
  bot.on("guildMemberAdd", async (guild, member) => {
            
    // Give the member the default roles
    const defaultRoles = await collections.autoRoles.find({type: 1}).toArray();
    for (let i = 0; defaultRoles.length > i; i++) {
            
      // Check if role exists
      if (guild.roles.find(possibleRole => possibleRole.id === defaultRoles[i].roleId)) {

        await member.addRole(defaultRoles[i].roleId, "Giving a default role");

                }

              }

  });
            
  bot.on("messageReactionAdd", async (msg, emoji, reactor) => {

    // Prevent us from reacting to ourselves
    const uid = reactor.id;
    if (uid === bot.user.id) return;

    try {
            
      const {members} = msg.channel.guild;
      const member = members.find(m => m.id === uid);
      if (msg.guildID) {

        await require("./modules/reaction-roles")(collections.reactionRoles, members.find(m => m.id === bot.user.id), member, msg, emoji);

      } else {

        await require("./modules/staff-evaluation")(member, collections.staffFeedback, msg, bot, emoji);
        
      }
    
    } catch (err) {

      console.warn("Something bad happened when running the MessageReactionAdd function: " + err);

    }

  });

  async function getGuildConfig(guildId) {
    
    // Look for data in cache
    const collection = db.collection("GuildLogInfo");
    let guildConfig = database.cache.get(guildId + "logs");
    
    if (!guildConfig) {

      // Check if we have the DB client 
      if (!database.mongoClient) {

        throw new Error("Database not defined");

      }
      
      // Get data from server
      guildConfig = await collection.findOne({guildId: guildId});
      
      // Update cache
      database.cache.set(guildId + "logs", guildConfig);

    }
    
    // Return data
    return guildConfig;
    
  }
  
  bot.on("messageUpdate", async (newMessage, oldMessage) => {
    
    try {

      // Make sure the message is different
      if (oldMessage && newMessage.content === oldMessage.content) {

        return;

      }
      
      const GuildConfig = await getGuildConfig(newMessage.channel.guild.id);
      const LogChannelsString = GuildConfig ? GuildConfig.logChannelIds : undefined;
      const LogChannels = LogChannelsString ? JSON.parse(LogChannelsString) : [];
      
      if (!LogChannels || LogChannels.length === 0) {

        console.log("Guild " + newMessage.channel.guild.id + " doesn't have a log channel.");
        return;

      }

      for (let i = 0; LogChannels.length > i; i++) {
        
        // Check if we have access to the channel
        const LogChannel = bot.getChannel(LogChannels[i]);
        if (!LogChannel) {

          continue;

        }
        
        // Check if we have the old message
        if (oldMessage) {

          await LogChannel.createMessage({
            content: "**" + newMessage.author.username + "** edited their message.",
            embed: {
              author: {
                name: newMessage.author.username + "#" + newMessage.author.discriminator,
                icon_url: newMessage.author.avatarURL
              },
              color: 14994184,
              fields: [
                {
                  name: "Old message",
                  value: oldMessage.content
                }, {
                  name: "New message",
                  value: newMessage.content
                }, {
                  name: "Channel",
                  value: "<#" + newMessage.channel.id + ">"
                }
              ],
              footer: {
                text: newMessage.id
              }
            }
          });

        } else {

          await LogChannel.createMessage({
            content: "**" + newMessage.author.username + "** edited their message, but Discord blocked me from getting the message before its inevitable destruction.",
            embed: {
              author: {
                name: newMessage.author.username + "#" + newMessage.author.discriminator,
                icon_url: newMessage.author.avatarURL
              }, 
              color: 14994184,
              fields: [
                {
                  name: "New message",
                  value: newMessage.content
                }, {
                  name: "Channel",
                  value: "<#" + newMessage.channel.id + ">"
                }
              ], 
              footer: {
                text: newMessage.id
              }
            }
          });

        }

      }

    } catch (err) {

      console.warn("Couldn't log edited message: " + err);

    }

  });
  
  bot.editStatus("online");

  console.log("\x1b[32m%s\x1b[0m", "[Client] Ready to roll! It took " + (new Date().getTime() - startTime) / 1000 + " seconds");

});

console.log("\x1b[36m%s\x1b[0m", "[Client] Connecting to Discord...");
bot.connect();
