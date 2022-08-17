import { ApplicationCommandOptions, Client, CommandInteraction, EventListeners } from "eris";
import { Collection } from "mongodb";

const commands: {[name: string]: Command} = {};
let configuredCommands: any[] = [];
let _discordClient: Client;
let _collections: {[name: string]: Collection} = {};

export interface CommandActionProperties {
  discordClient: Client;
  interaction: CommandInteraction;
  collections: {[name: string]: Collection};
}

interface CommandProperties {
  name: string;
  description: string;
  action: Function;
  slashOptions?: ApplicationCommandOptions[];
  cooldown?: number;
  ephemeral?: boolean;
}

class Command {

  name: string;
  description: string;
  cooldown: number;
  action: Function;
  slashOptions?: ApplicationCommandOptions[];
  ephemeral: boolean;
  cooledUsers: {[userId: string]: number} = {};
  deleteInteractionOnFirstUsage?: boolean;

  constructor({name, description, action, cooldown = 0, slashOptions, ephemeral = false}: CommandProperties) {

    console.log("\x1b[36m%s\x1b[0m", "[Commands] Adding " + name + " command...");

    // Check if the command already exists
    if (commands[name]) {

      throw new Error("Command " + name + " already exists");

    }
    
    // Create the command
    this.name = name;
    this.action = action;
    this.description = description;
    this.cooldown = cooldown;
    if (slashOptions) this.slashOptions = slashOptions;
    this.ephemeral = ephemeral;
    commands[name] = this;
    
    console.log("\x1b[32m%s\x1b[0m", "[Commands] Finished adding " + name + " command");

  }
  
  async execute(interaction: CommandInteraction) {

    // Acknowledge the interaction
    await interaction.defer(this.ephemeral ? 64 : undefined);

    // Make sure we have an ID.
    const AuthorId = (interaction.member ?? interaction.user)?.id;
    if (!AuthorId) return;

    // Now check if the creator is under a cooldown.
    const ExecuteTime = new Date().getTime();
    const RemainingCooldown = this.cooledUsers[AuthorId] ? (this.cooledUsers[this.name] + this.cooldown) - ExecuteTime : 0;
    if (this.cooledUsers[AuthorId] && RemainingCooldown > 0) {

      await _discordClient.createMessage(interaction.channel.id, "<@" + AuthorId + "> You're moving too fast...even for me! Give me " + RemainingCooldown / 1000 + " more seconds.");
      return;

    }

    // Put the user under cooldown
    this.applyCooldown(AuthorId, this.cooldown);

    // Execute the command
    try {

      await this.action({discordClient: _discordClient, interaction, collections: _collections});

    } catch (err: any) {

      await interaction.createFollowup(err instanceof Error ? err.message : "Something bad happened. How about running that by me one more time?");

    }

  }

  applyCooldown(userId: string, milliseconds: number) {

    const ExecuteTime = new Date().getTime();
    this.cooledUsers[userId] = milliseconds ? ExecuteTime + milliseconds : ExecuteTime;

  }

  setAction(action: Function) {

    this.action = action;

  }

  async verifyInteraction() { 

    const interactionCmdInfo = configuredCommands.find(c => c.name === this.name);
    if (this.slashOptions && !interactionCmdInfo) {

      try {

        console.log("\x1b[36m%s\x1b[0m", "[Commands] " + (this.slashOptions ? "Creating" : "Deleting") + " interaction for command \"" + this.name + "\"...");

        await _discordClient.createCommand({
          name: this.name,
          description: this.description,
          options: this.slashOptions,
          type: 1
        });

        console.log("\x1b[32m%s\x1b[0m", "[Commands] Successfully created interaction for command \"" + this.name + "\"!");

      } catch (err) {

        console.log(err);
        console.log("\x1b[33m%s\x1b[0m", "[Commands] Couldn't add interaction for command \"" + this.name + "\"...");

      }

    } else if (!this.slashOptions && interactionCmdInfo) {
      
      console.log("\x1b[36m%s\x1b[0m", "[Commands] Removing interaction for command \"" + this.name + "\"...");
      this.deleteInteractionOnFirstUsage = true;
      console.log("\x1b[32m%s\x1b[0m", "[Commands] Removed interaction for command \"" + this.name + "\"...");

    }

  }

}

// Functions for other scripts to use
function listCommands(): {[name: string]: any} {

  return commands;

}

async function storeClientAndCollections(discordClient: Client, collections: {[name: string]: Collection}) {

  // Get the already configured commands
  try {
    
    configuredCommands = await discordClient.getCommands();

  } catch (err) {

    console.log("[Commands] Couldn't get existing slash commands from Discord: " + err);

  }

  // Listen to interactions
  discordClient.on("interactionCreate", async (interaction: EventListeners["interactionCreate"][0]) => {
    
    let interactionName, command;
    
    // Make sure it's a command
    if (interaction.type === 2) {

      // Check if the command exists
      interactionName = interaction.data.name;
      command = commands[interactionName];
      
      if (command) {
  
        await command.execute(interaction);
  
      } else {
  
        await discordClient.deleteCommand(interaction.data.id);
  
      }

    }

  });

  _discordClient = discordClient;
  _collections = collections;

}

export {storeClientAndCollections, listCommands, Command};
