const commands = {};
let bot;
const cooledUsers = {};

require("dotenv").config();

let configuredCommands = [];
class Command {

  async execute(interaction) {

    // Acknowledge the interaction
    await interaction.acknowledge();

    // Check if the user is under cooldown
    const AuthorId = (interaction.member || interaction.user).id;
    const ExecuteTime = new Date().getTime();
    const RemainingCooldown = cooledUsers[AuthorId] ? (cooledUsers[AuthorId][this.name] + this.cooldown) - ExecuteTime : 0;
    if (cooledUsers[AuthorId] && RemainingCooldown > 0) {

      await bot.createMessage(interaction.channel_id, "<@" + AuthorId + "> You're moving too fast...even for me! Give me " + RemainingCooldown / 1000 + " more seconds.");
      return;

    }

    // Put the user under cooldown
    this.applyCooldown(AuthorId);

    // Execute the command
    try {

      return await this.action(bot, interaction);

    } catch (err) {

      console.log(err);

      return await interaction.createFollowup(interaction.id, interaction.token, {content: "Uh oh. Something real bad happened. Let's try that again."});

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

    const interactionCmdInfo = configuredCommands.find(c => c.name === this.name);
    if (this.slashOptions && !interactionCmdInfo) {

      try {

        console.log("\x1b[36m%s\x1b[0m", "[Commands] " + (this.slashOptions ? "Creating" : "Deleting") + " interaction for command \"" + this.name + "\"...");

        await bot.createCommand({
          name: this.name,
          description: this.description,
          options: this.slashOptions
        });

        console.log("\x1b[32m%s\x1b[0m", "[Commands] Successfully created interaction for command \"" + this.name + "\"!");

      } catch (err) {

        console.log(err);
        console.log("\x1b[33m%s\x1b[0m", "[Commands] Couldn't add interaction for command \"" + this.name + "\"...");

      }

    } else if (!this.slashOptions && interactionCmdInfo) {
      
      console.log("\x1b[36m%s\x1b[0m", "[Commands] Removing interaction for command \"" + this.name + "\"...");
      this.deleteInteraction = true;
      console.log("\x1b[32m%s\x1b[0m", "[Commands] Removed interaction for command \"" + this.name + "\"...");

    }

  }
  
  constructor(name, description, action, cooldown, slashOptions) {

    console.log("\x1b[36m%s\x1b[0m", "[Commands] Adding " + name + " command...");

    // Check if the command already exists
    if (commands[name]) {

      throw new Error("Command " + name + " already exists");

    }
    
    // Create the command
    this.name = name;
    this.action = action;
    this.description = description;
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

async function initialize(client) {

  // Get the already configured commands
  try {
    
    configuredCommands = await client.getCommands();

  } catch (err) {

    console.log("[Commands] Couldn't get existing slash commands from Discord: " + err);

  }

  // Listen to interactions
  client.on("interactionCreate", async (interaction) => {
    
    let interactionName, command, response;

    // Make sure it's a command
    if (interaction.type !== 2) return;

    // Check if the command exists
    interactionName = interaction.data.name;
    command = commands[interactionName];
    
    if (command) {

      await command.execute(interaction);

    } else {

      await bot.deleteCommand(interaction.data.id);

    }


  });

  bot = client;

}

// Send the exports!
exports.initialize = initialize;
exports.get = getCommand;
exports.list = listCommands();
exports.new = Command;