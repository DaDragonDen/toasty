import { Command } from "../commands.js";

// roleType: 0 (reaction), 1 (default), 2 (self)
async function setupRole(discordClient, interaction, collections, roleType) {

  const {options = [{}], name: action} = interaction.data.options.find(option => option.type === 1);
  const args = {
    channelId: (options.find(option => option.name === "channel") || {}).value,
    messageId: (options.find(option => option.name === "message_id") || {}).value,
    roleId: (options.find(option => option.name === "role") || {}).value,
    emoji: (options.find(option => option.name === "emoji") || {}).value,
    noExisting: options.find(option => option.name === "no_existing"),
    noBots: options.find(option => option.name === "no_bots")
  };
  let response;

  const emoji = args.emoji && args.emoji.includes("<") ? args.emoji.substring(1, args.emoji.length - 1) : args.emoji;
  let reactMessage;

  if (roleType === 0 && action !== "list") {

    // Now let's make sure that the bot can access the message and channel
    try {

      reactMessage = await discordClient.getMessage(args.channelId, args.messageId);

    } catch (err) {

      return await interaction.createFollowup(`Message ${args.messageId} doesn't exist in <#${args.channelId}>`);

    }

    // Let's make sure that we can use that emoji
    const msg = await discordClient.createMessage(interaction.channel_id, "Testing emoji accessibility...");
    try {

      await msg.addReaction(emoji);

    } catch (err) {

      await msg.delete();
      return await interaction.createFollowup("I couldn't add that emoji to your message! Do I have permission to react in this channel or are you just flexing your Nitro?");

    }

    // Check permission in the channel
    const ReactChannel = discordClient.getChannel(args.channelId);
    if (ReactChannel && !ReactChannel.permissionsOf(discordClient.user.id).has("addReactions")) {

      await msg.delete();
      return await interaction.createFollowup("I don't have permission to react in <#" + args.channelId + ">...");

    }

  }
  
  // Register this into the database
  const guild = discordClient.guilds.find(possibleGuild => possibleGuild.id === interaction.guildID);
  const member = guild.members.find(possibleMember => possibleMember.id === interaction.member.user.id);
  switch (action) {

    case "add":

      if (!member.permissions.has("manageRoles")) {

        return await interaction.createFollowup("Sorry, no can do! You don't have permission to manage roles. Did you mean `/selfroles get`?");

      }

      await collections.autoRoles.insertOne({
        messageId: args.messageId,
        channelId: args.channelId,
        emoji: emoji,
        type: roleType,
        roleId: args.roleId
      });
      break;

    case "get": {

      // Check if role exists
      const role = await collections.autoRoles.findOne({roleId: args.roleId, type: 2});
      if (guild.roles.find(possibleRole => possibleRole.id === args.roleId) && role) {

        await member.addRole(role.roleId, "Asked for it");
        return await interaction.createFollowup("It's yours, my friend.");

      }

      return await interaction.createFollowup("That role isn't on the table!");

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
      return await interaction.createFollowup(response);

    }

    case "delete": {

      // Verify that the user can manage roles.
      if (!member.permissions.has("manageRoles")) {

        return await interaction.createFollowup("Sorry, no can do! You don't have permission to manage roles. Did you mean `/selfroles get`?");

      }

      // Delete the role.
      await collections.autoRoles.deleteOne({type: roleType, roleId: args.roleId});

      // Tell the user that we're finished.
      return await interaction.createFollowup("Done!");

    }

    default:
      break;

  }
  
  let affectedMembers = 0;
  if (roleType === 0) {

    // Add the reaction
    await reactMessage.addReaction(emoji);

  } else if (roleType === 1 && !args.noExisting) {

    // Give this role to existing members
    const guildMembers = guild.members.map(possibleMember => possibleMember);
    for (let i = 0; guildMembers.length > i; i++) {

      if (!guildMembers[i].roles.find(roleId => args.roleId === roleId) && (!guildMembers[i].discordClient || !args.noBots)) {

        await guildMembers[i].addRole(args.roleId, "Adding default role to existing members");
        affectedMembers++;

      }

    }

  }
  
  // Everything is OK!
  return await interaction.createFollowup("Role added!" + (roleType === 1 ? " Gave the role to " + affectedMembers + " existing members too." : ""));

}

// Set up slash commands.
new Command({
  name: "reactionroles", 
  description: "Configures reaction roles", 
  action: async ({discordClient, collections, interaction}) => await setupRole(discordClient, interaction, collections, 0), 
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
          required: true
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
  action: async ({discordClient, collections, interaction}) => await setupRole(discordClient, interaction, collections, 1), 
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
  action: async ({discordClient, collections, interaction}) => await setupRole(discordClient, interaction, collections, 2), 
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
