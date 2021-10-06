// Packages and services
const path = require("path");
const fs = require("fs");
const Eris = require("eris");

// Get environment variables
require("dotenv").config();

// Get ready to load the database
let database, dbClient, db, collections;
async function loadDB() {

  console.log("\x1b[36m%s\x1b[0m", "[Client] Updating database variables...");

  database = await require("./database");
  dbClient = database.mongoClient;
  db = dbClient.db("guilds");
  collections = {
    autoRoles: db.collection("AutoRoles"),
    staffFeedback: db.collection("StaffFeedback"),
    interactions: db.collection("Interactions"),
    questions: db.collection("Questions"),
    twitterAuthInfo: db.collection("TwitterAuthorizationInfo")
  };

  console.log("\x1b[32m%s\x1b[0m", "[Client] Database variables updated");
  
}

// Load Discord
const bot = new Eris(process.env.token, {requestTimeout: 30000});
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
    //await resetBumpTimeout();

  }

  // Load the database
  await loadDB();
  
  // Load all commands
  commands = require("./commands");
  await commands.initialize(bot, collections);
  const folders = ["commands"];
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

      // Check if it's a bot
      if (msg.author.bot) {

        // Check if it's the bump bot
        if (msg.author.id === "302050872383242240" && msg.embeds[0].description.includes("Bump done")) {

          await resetBumpTimeout();
          
        }
        return;

      }

      // Check if it's a Twitter post
      const tweets = [...msg.content.matchAll(/twitter\.com\/[^/]+\/[^/]+\/(?<tweetId>\d+)/gm)];
      if (tweets && msg.channel.id === "550486587562131458") {

        // Iterate through each Tweet
        for (let x = 0; tweets.length > x; x++) {

          // Retweet the Tweet
          await require("./modules/twitter-transmitter").retweet(msg, tweets[x].groups.tweetId);

        }

      }

      const ServerPrefix = commands.getPrefix(msg.channel.id);
      
      // Check if they just want the bot prefix
      const AuthorPing = "<@" + msg.author.id + ">";
      if (msg.content === "<@" + bot.user.id + ">" || msg.content === "<@!" + bot.user.id + ">") {

        msg.channel.createMessage(AuthorPing + " My prefix is **`" + ServerPrefix + "`**!");
        return;

      }
      
      // Check if it's a staff evaluation
      const guild = bot.guilds.find(possibleGuild => possibleGuild.id === "497607965080027136");
      const member = guild.members.find(possibleMember => possibleMember.id === msg.author.id);
      if (msg.channel.type === 1 && (msg.content.toLowerCase() === "start staff evaluation" || msg.messageReference)) {

        if (!dbClient) {

          console.log("Getting database; it didn't load on ready apparently");
          await loadDB();
  
        }
        
        await require("./modules/staff-evaluation")(member, dbClient, msg, bot, guild);
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

    // Tell the admins
    await bot.createMessage("497607965080027138", "<@" + member.id + "> joined the server!");

  });

  bot.on("guildMemberRemove", async (guild, member) => {

    // Tell the admins
    if (guild.id === "497607965080027136") await bot.createMessage("497607965080027138", member.username + "#" + member.discriminator + " (<@" + member.id + "> / " + member.id + ") left the server.");

  });

  bot.on("messageReactionAdd", async (msg, emoji, reactor) => {
    
    // Prevent us from reacting to ourselves
    const uid = reactor.id;
    if (uid === bot.user.id) return;
    
    msg = await bot.getMessage(msg.channel.id, msg.id);
    const guild = msg.guildID && msg.channel.guild;
    const members = guild && guild.members;
    const userMember = members.find(m => m.id === uid);
    const botMember = members && members.find(m => m.id === bot.user.id);
    if (msg.guildID) {
      
      await require("./modules/reaction-roles")(collections.autoRoles, botMember, userMember, msg, emoji, true);
      
    } else {
    
      await require("./modules/staff-evaluation")(userMember, collections.staffFeedback, msg, bot, emoji);

    }

  });

  bot.on("messageReactionRemove", async (msg, emoji, userId) => {

    msg = await bot.getMessage(msg.channel.id, msg.id);
    const guild = msg.guildID && msg.channel.guild;
    const members = guild && guild.members;
    const userMember = members && members.find(m => m.id === userId);
    const botMember = members && members.find(m => m.id === bot.user.id);
    await require("./modules/reaction-roles")(collections.autoRoles, botMember, userMember, msg, emoji, false);

  });

  bot.on("error", (err) => {

    console.log("\x1b[33m%s\x1b[0m", "[Eris]: " + err);

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

  bot.on("messageDelete", async msg => {

    const guildConfig = msg.channel.guild && await getGuildConfig(msg.channel.guild.id);
    await require("./modules/logs")(bot, msg, guildConfig, true);

  });
  
  bot.on("messageUpdate", async (newMessage, oldMessage) => {
    
    try {
      
      newMessage = await bot.getMessage(newMessage.channel.id, newMessage.id);

    } catch (err) {

      console.log("\x1b[33m%s\x1b[0m", "[messageUpdate] Couldn't get message: " + err);

    }

    const guildConfig = newMessage.channel.guild && await getGuildConfig(newMessage.channel.guild.id);
    if (guildConfig) await require("./modules/logs")(bot, newMessage, guildConfig, false, oldMessage);

  });

  // Load Twitter module
  await require("./modules/twitter-transmitter").setupAppClient(bot);
  await require("./modules/twitter-transmitter").setCollections(collections);
  
  // Load the web server
  require("./server")();

  console.log("\x1b[32m%s\x1b[0m", "[Client] Ready to roll! It took " + (new Date().getTime() - startTime) / 1000 + " seconds");

});

// Connect to Discord
console.log("\x1b[36m%s\x1b[0m", "[Client] Connecting to Discord...");
bot.connect();
