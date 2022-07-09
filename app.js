import { fileURLToPath } from "url";
import path, { dirname } from "path";
import fs from "fs";
import Eris from "eris";
import generateDBClient from "./database.js";
import { storeClientAndCollections, listCommands } from "./commands.js";
import "dotenv/config";

(async () => {

  // Load the database.
  console.log("\x1b[36m%s\x1b[0m", "[Client] Updating database variables...");

  const dbClient = await generateDBClient();
  const db = dbClient.db("guilds");
  const collections = {
    autoRoles: db.collection("AutoRoles"),
    interactions: db.collection("Interactions"),
    questions: db.collection("Questions")
  };

  console.log("\x1b[32m%s\x1b[0m", "[Client] Database variables updated");

  // Load Discord
  const bot = new Eris(process.env.token, {
    intents: ["allNonPrivileged", "guildMessages", "guildMembers"]
  });
  let bumpTimeout;

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

  bot.once("ready", async () => {

    // Time how long it takes for the bot to really start
    const startTime = new Date().getTime();
    console.log("\x1b[32m%s\x1b[0m", "[Client] Logged in!");

    // Check for the last bump time
    if (!bumpTimeout) {

      // Look for the last bump message
      //const messages = await bot.getMessages("509403818031710208");
      //await resetBumpTimeout();

    }

    // Initialize the client.
    await storeClientAndCollections(bot, collections);
    
    const files = fs.readdirSync(path.join(dirname(fileURLToPath(import.meta.url)), "commands"));

    for (let x = 0; files.length > x; x++) {

      const { default: module } = await import(`./commands/${files[x]}`);

      if (typeof module === "function") {
        
        await module();

      }

    }

    // Upsert/delete slash commands where necessary
    const commandList = listCommands();
    const commandListNames = Object.keys(commandList);

    for (let i = 0; commandListNames.length > i; i++) {

      await commandList[commandListNames[i]].verifyInteraction();

    }

    console.log("\x1b[36m%s\x1b[0m", "[Client] Initializing events...");
    bot.on("messageCreate", async (msg) => {

      // Check if it's a bot
      if (msg.author.bot) {

        // Check if it's the bump bot
        if (msg.author.id === "302050872383242240" && msg.embeds[0].description.includes("Bump done")) {

          await resetBumpTimeout();
          
        }

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
      const userId = reactor.id;
      const botId = bot.user.id;
      if (userId === botId) return;
      
      msg = await bot.getMessage(msg.channel.id, msg.id);
      const guild = msg.guildID && msg.channel.guild;
      const members = guild && await guild.fetchMembers({
        limit: 2, 
        userIDs: [userId, botId]
      });
      const userMember = members && members.find(m => m.id === userId);
      const botMember = members && members.find(m => m.id === botId);
      if (msg.guildID) {
        
        (await import("./modules/reaction-roles.js")).default(collections.autoRoles, botMember, userMember, msg, emoji, true);
        
      }

    });

    bot.on("messageReactionRemove", async (msg, emoji, userId) => {

      msg = await bot.getMessage(msg.channel.id, msg.id);
      const guild = msg.guildID && msg.channel.guild;
      const members = guild && await guild.fetchMembers({
        limit: 2, 
        userIDs: [userId, bot.user.id]
      });
      const userMember = members && members.find(m => m.id === userId);
      const botMember = members && members.find(m => m.id === bot.user.id);
      (await import("./modules/reaction-roles.js")).default(collections.autoRoles, botMember, userMember, msg, emoji, false);

    });

    bot.on("error", (err) => {

      console.log("\x1b[33m%s\x1b[0m", "[Eris]: " + err);

    });

    console.log("\x1b[32m%s\x1b[0m", "[Client] Ready to roll! It took " + (new Date().getTime() - startTime) / 1000 + " seconds");

  });

  // Connect to Discord
  console.log("\x1b[36m%s\x1b[0m", "[Client] Connecting to Discord...");
  bot.connect();

})();
