import { fileURLToPath } from "url";
import path, { dirname } from "path";
import fs from "fs";
import { Client, EventListeners, Guild, Member, Message, PartialEmoji } from "eris";
import { storeClientAndCollections, listCommands } from "./commands.js";
import "dotenv/config";
import { MongoClient } from "mongodb";

declare global {
  // eslint-disable-next-line no-unused-vars
  namespace NodeJS {
    // eslint-disable-next-line no-unused-vars
    interface ProcessEnv {
      MONGO_DOMAIN: string;
      TOKEN: string;
    }
  }
}

(async () => {

  // Connect to MongoDB.
  console.log("\x1b[36m%s\x1b[0m", "[Client] Updating database variables...");
  const dbClient = new MongoClient(process.env.MONGO_DOMAIN);
  await dbClient.connect();

  // Save the collections for later.
  const db = dbClient.db("guilds");
  const collections = {
    autoRoles: db.collection("AutoRoles"),
    roleGroups: db.collection("roleGroups")
  };

  console.log("\x1b[32m%s\x1b[0m", "[Client] Database variables updated");

  // Load the Discord client.
  const bot = new Client(process.env.TOKEN, {
    intents: ["allNonPrivileged", "guildMessages", "guildMembers"]
  });
  let bumpTimeout: NodeJS.Timeout | undefined;

  async function resetBumpTimeout(remainingTime?: number): Promise<void> {

    bumpTimeout = setTimeout(async () => {

      bumpTimeout = undefined;
      await bot.createMessage("1020137279169232926", "bumping's back!");

    }, remainingTime || 7200000);

  }

  bot.once("ready", async () => {

    // Time how long it takes for the bot to really start
    const startTime = new Date().getTime();
    console.log("\x1b[32m%s\x1b[0m", "[Client] Successfully connected to Discord!");

    // Check for the last bump time
    if (!bumpTimeout) {

      // Look for the last bump message
      //const messages = await bot.getMessages("509403818031710208");
      //await resetBumpTimeout();

    }

    // Initialize the client.
    await storeClientAndCollections(bot, collections);
    
    const files = fs.readdirSync(path.join(dirname(fileURLToPath(import.meta.url)), "commands"));

    // Iterate through every command file.
    for (let x = 0; files.length > x; x++) {

      // Verify that the file is a JavaScript file.
      const fileName = files[x];
      if (fileName.slice(fileName.length - 3) === ".js") {

        const { default: module } = await import(`./commands/${fileName}`);

        if (typeof module === "function") {
          
          await module();

        }

      }

    }

    // Upsert/delete slash commands where necessary
    const commandList = listCommands();
    const commandListNames = Object.keys(commandList);

    for (let i = 0; commandListNames.length > i; i++) {

      await commandList[commandListNames[i]].verifyInteraction();

    }

    console.log("\x1b[36m%s\x1b[0m", "[Client] Initializing events...");
    bot.on("messageCreate", async (msg: EventListeners["messageCreate"][0]) => {

      // Check if it's a bot
      if (msg.author.bot) {

        // Check if it's the bump bot
        if (msg.author.id === "302050872383242240" && msg.embeds[0].description?.includes("Bump done")) {

          await resetBumpTimeout();
          
        }

      }

    });

    bot.on("guildMemberAdd", async (guild: EventListeners["guildMemberAdd"][0], member: EventListeners["guildMemberAdd"][1]) => {

      // Give the member the default roles
      const defaultRoles = await collections.autoRoles.find({type: 1}).toArray();
      for (let i = 0; defaultRoles.length > i; i++) {

        // Check if role exists
        if (guild.roles.find(possibleRole => possibleRole.id === defaultRoles[i].roleId)) {

          await member.addRole(defaultRoles[i].roleId, "Giving a default role");

        }

      }

    });

    bot.on("guildMemberUpdate", async (guild, member, oldMember) => {

      try {

        // Make sure we have the old member.
        if (!oldMember) return;

        // Check if the member obtained a new role.
        const newRoles = member.roles;
        for (let i = 0; newRoles.length > i; i++) {

          const roleId = newRoles[i];
          if (!oldMember.roles.find((possibleRoleId) => possibleRoleId === roleId)) {

            // Check if the new role is the base of a role group.
            const roleGroup = await collections.roleGroups.findOne({baseRoleId: roleId});
            if (roleGroup) {

              // Give the member some more roles.
              const {attachedRoleIds} = roleGroup;
              for (let i = 0; attachedRoleIds.length > i; i++) {

                await member.addRole(attachedRoleIds[i], "Following a role group rule");

              }

            }

          }

        }

      } catch (err: any) {

        console.log(err);

      }

    });

    const botId = bot.user.id;
    async function getUserMemberAndBotMember(guild: Guild, userId: string): Promise<{userMember?: Member, botMember?: Member}> {

      // Now get the members.
      const members = await guild.fetchMembers({
        limit: 2, 
        userIDs: [userId, botId]
      });

      // Return the user and the bot.
      return {
        userMember: members.find(m => m.id === userId),
        botMember: members.find(m => m.id === botId)
      };

    }

    bot.on("messageReactionAdd", async (msgObj: EventListeners["messageReactionAdd"][0], emoji: EventListeners["messageReactionAdd"][1], reactor: EventListeners["messageReactionAdd"][2]) => {
      
      // Prevent the bot from reacting to itself.
      const userId = reactor.id;
      if (userId === botId) return;
      
      // msgObj could be minimal, so let's get the full message from the channel ID and message ID.
      const msg = await bot.getMessage(msgObj.channel.id, msgObj.id);
      const guild = "guild" in msg.channel ? msg.channel.guild : undefined;
      if (!guild) return;

      // Now get the guild, if there is one.
      const {userMember, botMember} = await getUserMemberAndBotMember(guild, userId);
      if (!userMember || !botMember) return;

      // Finally, send this information to the reaction roles module.
      (await import("./modules/reaction-roles.js")).default(collections.autoRoles, botMember, userMember, msg, emoji, true);

    });

    bot.on("messageReactionRemove", async (msgObj: Message, emoji: PartialEmoji, userId: string) => {

      // msgObj could be minimal, so let's get the full message from the channel ID and message ID.
      const msg = await bot.getMessage(msgObj.channel.id, msgObj.id);
      const guild = "guild" in msg.channel ? msg.channel.guild : undefined;
      if (!guild) return;

      // Now get the guild, if there is one.
      const {userMember, botMember} = await getUserMemberAndBotMember(guild, userId);
      if (!userMember || !botMember) return;

      // Let the reaction roles module handle the rest.
      (await import("./modules/reaction-roles.js")).default(collections.autoRoles, botMember, userMember, msg, emoji, false);

    });

    bot.on("error", (err: Error) => {

      console.log("\x1b[33m%s\x1b[0m", "[Eris]: " + err);

    });

    console.log("\x1b[32m%s\x1b[0m", "[Client] Ready to roll! It took " + (new Date().getTime() - startTime) / 1000 + " seconds");

  });

  // Connect to Discord
  console.log("\x1b[36m%s\x1b[0m", "[Client] Connecting to Discord...");
  bot.connect();

})();
