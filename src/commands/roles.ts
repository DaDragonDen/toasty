import { Client, CommandInteraction, ComponentInteraction, InteractionDataOptionsSubCommand } from "eris";
import { Collection } from "mongodb";
import { Command, CommandActionProperties } from "../commands.js";

// roleType: 0 (reaction), 1 (default), 2 (self)
async function setupRole(discordClient: Client, interaction: CommandInteraction | ComponentInteraction, collections: {[name: string]: Collection}, roleType: number): Promise<void> {

  if (interaction.type === 2) {

    // Verify that we're in a text channel.
    if (!("guild" in interaction.channel)) {
      
      await interaction.createFollowup("You can only run this command in a guild!");
      return;

    }

    // Verify the guild member.
    const {guild} = interaction.channel;
    const member = guild.members.find(possibleMember => possibleMember.id === interaction.member?.user.id);
    if (!member) {
      
      await interaction.createFollowup("I can't find you in the guild member list!");
      return;

    }

    // Verify the sub-command.
    const subCommand = interaction.data.options?.find(option => option.type === 1) as InteractionDataOptionsSubCommand;
    if (!subCommand) {
      
      await interaction.createFollowup("Couldn't find sub-command.");
      return;

    }

    // Verify the sub-command options.
    const {options, name: action} = subCommand;
    if (!options) {
      
      await interaction.createFollowup("Couldn't find sub-command options.");
      return;

    }

    // Save the sub-command options for later.
    const noExisting = options.find(option => option.name === "no_existing")?.value;
    const noBots = options.find(option => option.name === "no_bots")?.value;
    const roleId = options.find(option => option.name === "role")?.value;
    const roleIdInvalid = typeof roleId !== "string";
    let response;
    
    switch (action) {

      case "add": {

        // Verify the member's permissions.
        if (!member.permissions.has("manageRoles")) {
          
          await interaction.createFollowup("Sorry, no can do! You don't have permission to manage roles. Did you mean `/selfroles get`?");
          return;

        }

        // Verify the input values.
        if (roleIdInvalid) {
          
          await interaction.createFollowup("You didn't give me a role ID to work with.");
          return;

        }

        // Start up keeping track of the data we're going to insert.
        let document: {roleId: string, type: number, channelId?: string, messageId?: string, emoji?: string} = {roleId, type: roleType};

        if (roleType === 0) {
          
          const channelId = options.find(option => option.name === "channel")?.value;
          const channelIdInvalid = typeof channelId !== "string";
          const messageId = options.find(option => option.name === "message_id")?.value;
          const messageIdInvalid = typeof messageId !== "string";
          const emoji = options.find(option => option.name === "emoji")?.value;
          if (channelIdInvalid || messageIdInvalid || typeof emoji !== "string") {

            await interaction.createFollowup("You didn't give me an emoji to work with.");
            return;

          }

          // Now let's make sure that the bot can access the message and channel.
          let reactMessage;
          try {
      
            reactMessage = await discordClient.getMessage(channelId, messageId);

          } catch (err) {
      
            await interaction.createFollowup(`Message ${messageId} doesn't exist in <#${channelId}>`);
            return;

          }
          
          // Keep track of the channel and message IDs.
          document.channelId = channelId;
          document.messageId = messageId;
      
          // Let's make sure that we can use that emoji.
          const msg = await discordClient.createMessage(interaction.channel.id, "Testing emoji accessibility...");
          document.emoji = emoji.includes("<") ? emoji.substring(1, emoji.length - 1) : emoji;
      
          try {
            
            await reactMessage.addReaction(document.emoji);
            await msg.delete();
      
          } catch (err) {
      
            await msg.delete();
            await interaction.createFollowup("I couldn't add that emoji to your message! Do I have permission to react in that channel or are you just flexing your Nitro?");
            return;
            
          }

        }

        // Update the collection.
        await collections.autoRoles.insertOne(document);
        
        // Check if we're adding this role to existing members.
        let affectedMembers = 0;
        if (roleType === 1 && !noExisting) {

          // Iterate through the existing members.
          const guildMembers = guild.members.map(possibleMember => possibleMember);
          for (let i = 0; guildMembers.length > i; i++) {

            // Check if the current member doesn't have the role already, and if they're a bot.
            const guildMember = guildMembers[i];
            if (!guildMember.roles.find(possibleMatch => roleId === possibleMatch) && (!guildMember.bot || !noBots)) {

              // Add the role.
              await guildMember.addRole(roleId, "Adding default role to existing members");
              
              // Keep track of the affected member count.
              affectedMembers++;

            }

          }

        }

        // Everything is OK!
        await interaction.createFollowup(`Role added! ${roleType === 1 && affectedMembers > 0 ? ` Gave the role to ${affectedMembers} existing members too.` : ""}`);
        return;

      }

      case "get": {

        // Check if role exists
        const role = await collections.autoRoles.findOne({roleId, type: 2});
        if (guild.roles.find(possibleRole => possibleRole.id === roleId) && role) {

          await member.addRole(role.roleId, "Asked for it");
          await interaction.createFollowup("It's yours, my friend.");
          return;

        }

        await interaction.createFollowup("That role isn't on the table!");
        return;

      }
      
      case "list": {

        const roles = await collections.autoRoles.find({type: roleType}).toArray();
        let descRoles = "";

        for (let i = 0; roles.length > i; i++) {
            
          // Check if role exists
          const guildRole = guild.roles.find(possibleRole => possibleRole.id === roles[i].roleId);

          if (guildRole) {

            const roleIcon = roles[i].emoji && roles[i].emoji.includes(":") ? "<" + roles[i].emoji + ">" : roles[i].emoji || "🔖";
            descRoles = descRoles + (i !== 0 ? "\n" : "") + roleIcon + " **<@&" + guildRole.id + ">**" + (roleType === 0 ? " [[Attachment]](https://discord.com/channels/" + guild.id + "/" + roles[i].channelId + "/" + roles[i].messageId + ")" : "");

          } else {

            // Remove the role from the collection.
            await collections.autoRoles.deleteOne({type: roleType, roleId: roles[i].roleId});

          }
          
        }

        response = {
          content: descRoles !== "" ? (roleType === 2 ? "All members can get these roles at the moment:" : (
            roleType === 1 ? "Here are the roles I'm giving the new members now:" : (
              roleType === 0 ? "Here are the current reaction roles:" : "If returning members had these roles before they left, I'll give them back:"
            )
          )) : "There aren't any roles I'm giving at the moment.",
          embeds: descRoles !== "" ? [{
            description: descRoles
          }] : undefined
        };
        await interaction.createFollowup(response);
        return;

      }

      case "delete": {

        // Verify that the user can manage roles.
        if (!member.permissions.has("manageRoles")) {

          await interaction.createFollowup("Sorry, no can do! You don't have permission to manage roles. Did you mean `/selfroles get`?");
          return;

        }

        // Delete the role.
        await collections.autoRoles.deleteOne({type: roleType, roleId});

        // Tell the user that we're finished.
        await interaction.createFollowup("Done!");
        return;

      }

      default:
        break;

    }

  }

}

// Set up slash commands.
new Command({
  name: "reactionroles", 
  description: "Configures reaction roles", 
  action: async ({discordClient, collections, interaction}: CommandActionProperties) => await setupRole(discordClient, interaction, collections, 0), 
  cooldown: 0, 
  slashOptions: [
    {
      name: "add",
      description: "Give a member a role when they react to a message",
      type: 1,
      options: [
        {
          name: "channel",
          description: "The channel of the message you want to add the reaction role to",
          type: 7,
          required: true,
          channel_types: [0]
        }, {
          name: "message_id",
          description: "The ID of the message you want to add the reaction role to",
          type: 3,
          required: true
        }, {
          name: "role",
          description: "The role I should give when a user presses a reaction",
          type: 8,
          required: true
        }, {
          name: "emoji",
          description: "The emoji that users should react to get the role",
          type: 3,
          required: true
        }
      ]
    }, {
      name: "detach",
      description: "Detach a reaction role from a message",
      type: 1,
      options: [
        {
          name: "channel",
          description: "The channel of the message you want to remove the reaction role from",
          type: 7,
          required: true
        }, {
          name: "message_id",
          description: "The ID of the message you want to remove the reaction role from",
          type: 3,
          required: true
        }, {
          name: "role",
          description: "The role you want to remove from the message",
          type: 8,
          required: true
        },
      ]
    }, {
      name: "list",
      description: "Shows the list of reaction roles, their channels, and their assigned message IDs",
      type: 1
    }
  ]
});

new Command({
  name: "defaultroles", 
  description: "Configure roles given when people join", 
  action: async ({discordClient, collections, interaction}: CommandActionProperties) => await setupRole(discordClient, interaction, collections, 1), 
  cooldown: 0, 
  slashOptions: [
    {
      name: "add",
      description: "Add a role for me to give when new members join",
      type: 1,
      options: [
        {
          name: "role",
          description: "The role I should give when a member when they join",
          type: 8,
          required: true
        }, {
          name: "no_existing",
          description: "Put anything here if you don't want me to give the role to all members in the server now.",
          type: 3
        }, {
          name: "no_bots",
          description: "Put anything here if you don't want me to give the role to bots",
          type: 3
        }
      ]
    }, {
      name: "delete",
      description: "Delete a default role that you don't want me to give new members anymore",
      type: 1,
      options: [
        {
          name: "role",
          description: "The role I shouldn't give when new members join",
          type: 8,
          required: true
        }
      ]
    }, {
      name: "list",
      description: "List the roles I give when new members join",
      type: 1
    }
  ]
});

new Command({
  name: "selfroles", 
  description: "Configure obtainable roles", 
  action: async ({discordClient, collections, interaction}: CommandActionProperties) => await setupRole(discordClient, interaction, collections, 2), 
  cooldown: 0, 
  slashOptions: [
    {
      name: "add",
      description: "Add a role that can be obtained by anyone in the server",
      type: 1,
      options: [
        {
          name: "role",
          description: "The role I should give when a member when they ask",
          type: 8,
          required: true
        }
      ]
    }, {
      name: "get",
      description: "Get an obtainable role",
      type: 1,
      options: [
        {
          name: "role",
          description: "The role you want",
          type: 8,
          required: true
        }
      ]
    }, {
      name: "delete",
      description: "Prevent members from getting a self-role",
      type: 1,
      options: [
        {
          name: "role",
          description: "The role that shouldn't be obtainable anymore",
          type: 8,
          required: true
        }
      ]
    }, {
      name: "list",
      description: "List all obtainable self-roles",
      type: 1
    }
  ]
});
