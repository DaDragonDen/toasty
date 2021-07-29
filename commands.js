const DefaultPrefix = ":";
const commands = {};
let bot;
const cooledUsers = {};

require("dotenv").config();
const fetch = require("node-fetch");

let collections = {};

class Command {

  async execute(args, msg, interaction) {

    // Check if the user is under cooldown
    const AuthorId = interaction ? interaction.member.id : msg.author.id;
    const ExecuteTime = new Date().getTime();
    const RemainingCooldown = cooledUsers[AuthorId] ? (cooledUsers[AuthorId][this.name] + this.cooldown) - ExecuteTime : 0;
    if (cooledUsers[AuthorId] && RemainingCooldown > 0) {

      await bot.createMessage(interaction ? interaction.channel_id : msg.channel.id, "<@" + AuthorId + "> You're moving too fast...even for me! Give me " + RemainingCooldown / 1000 + " more seconds.");
      return;

    }

    // Put the user under cooldown
    this.applyCooldown(AuthorId);

    // Execute the command
    try {

      return await this.action(bot, args, msg, interaction);

    } catch (err) {

      console.log(err);

      return interaction ? {content: "Uh oh. Something real bad happened. Let's try that again."} : await msg.channel.createMessage({
        content: "Something bad happened!",
        embed: {
          description: err
        }
      });

    }

  }

  applyCooldown(userId, milliseconds) {

    const ExecuteTime = new Date().getTime();

    if (!cooledUsers[userId]) {

      cooledUsers[userId] = {};

    }

    cooledUsers[userId][this.name] = milliseconds ? ExecuteTime + milliseconds : ExecuteTime;

  }

  setAction(action) {

    this.action = action;

  }

  async verifyInteraction() {

    const interactionId = !this.slashOptions && await collections.interactions.findOne({name: this.name}); 

    if (interactionId || this.slashOptions) {

      try {

        console.log("\x1b[36m%s\x1b[0m", "[Commands] " + (this.slashOptions ? "Creating" : "Deleting") + " interaction for command \"" + this.name + "\"...");

        // eslint-disable-next-line no-constant-condition
        while (true) {

          const res = await fetch("https://discord.com/api/v8/applications/" + process.env.applicationId + "/guilds/497607965080027136/commands" + (this.slashOptions ? "" : "/"), {
            method: this.slashOptions ? "POST" : "DELETE",
            body: JSON.stringify({
              name: this.name,
              description: this.description,
              options: this.slashOptions
            }),
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bot " + process.env.token
            }
          });

          const jsonRes = await res.json();
          if (jsonRes.retry_after) {

            const waitTime = jsonRes.retry_after * 1000;
            console.log("\x1b[33m%s\x1b[0m", "[Commands] Rate-limited! Waiting " + (waitTime / 1000) + " seconds before trying again");
            await new Promise(resolve => setTimeout(resolve, waitTime));

          } else {

            break;

          }

        }

        console.log("\x1b[32m%s\x1b[0m", "[Commands] Successfully " + (this.slashOptions ? "created" : "deleted") + " interaction for command \"" + this.name + "\"!");

      } catch (err) {

        console.warn();

      }

    } else if (!this.slashOptions) {

      console.log("\x1b[33m%s\x1b[0m", "[Commands] Couldn't find interaction ID for command \"" + this.name + "\" in the database. Waiting for command execution to delete the interaction...");
      this.deleteInteraction = true;

    }

  }
  
  constructor(name, aliases, category, description, examples, action, cooldown, slashOptions) {

    console.log("\x1b[36m%s\x1b[0m", "[Commands] Adding " + name + " command...");

    // Check if the command already exists
    if (commands[name]) {

      throw new Error("Command " + name + " already exists");

    }
    
    // Create the command
    this.name = name;
    this.category = category;
    this.aliases = aliases || [];
    this.action = action;
    this.description = description;
    this.examples = examples;
    this.cooldown = cooldown === false ? 0 : cooldown || 0;
    this.slashOptions = slashOptions;
    commands[name] = this;
    
    console.log("\x1b[32m%s\x1b[0m", "[Commands] Finished adding " + name + " command");

    return commands[name];

  }

}

// Functions for other scripts to use
function listCommands() {

  return commands;

}

function getCommand(commandName) {

  if (!commandName) {

    throw new Error("No command name provided");

  }
  
  let command = commands[commandName];
  
  // Find the command by alias
  if (!command) {
    
    for (const possibleCommand in commands) {

      if (commands.hasOwnProperty(possibleCommand)) {

        if (commands[possibleCommand].aliases.find(alias => alias === commandName)) {

          command = commands[possibleCommand];
          break;

        }

      }

    }
    
  }
  
  return command;

}

function initialize(client, cols) {
  
  collections = cols;
  client.on("rawWS", async (packet) => {

    try {

      if (packet.t === "INTERACTION_CREATE") {

        const command = commands[packet.d.data.name];
        if (command) {

          // Send initial response
          let response = command.deleteInteraction && {content: "Fwoosh! And just like that, no more slash commands."};
          await fetch("https://discord.com/api/v8/interactions/" + packet.d.id + "/" + packet.d.token + "/callback", {
            method: "POST",
            body: JSON.stringify({
              type: 5
            }),
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bot " + process.env.token
            }
          });

          if (!command.deleteInteraction) {
            
            try {

              response = await command.execute(undefined, undefined, packet.d) || {content: "That's done."};

            } catch (err) {

              console.warn("[Commands] Couldn't execute slash command \"" + command.name + "\": " + err);

            }
          
          }

          await fetch("https://discord.com/api/v8/" + (command.deleteInteraction ? "applications/" + packet.d.application_id + "/guilds/497607965080027136/commands/" + packet.d.data.id : 
            "webhooks/" + process.env.applicationId + "/" + packet.d.token + "/messages/@original"
          ), {
            method: command.deleteInteraction ? "DELETE" : "PATCH",
            body: commands.deleteInteraction ? undefined : JSON.stringify(response),
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bot " + process.env.token
            }
          });

          if (command.deleteInteraction) {

            console.log("[Commands] Successfully deleted interaction for the \"" + command.name + "\" command");

          }

        }

      }

    } catch (err) {
      
      console.warn("[Commands] Couldn't handle rawWS: " + err);

    }

  });

  bot = client;

}

function getPrefix() {

  return DefaultPrefix;

}

// Send the exports!
exports.initialize = initialize;
exports.get = getCommand;
exports.list = listCommands();
exports.new = Command;
exports.getPrefix = getPrefix;
