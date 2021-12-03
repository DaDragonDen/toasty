const Commands = require("../commands");

const NewRRRegex = /new( -(e|emoji) (?<emoji>\S+))?( -(c|cid|channel|channelid) (?<channelId>\S+))?( -(m|mid|message|messageId) (?<messageId>\S+))?( -(r|rid|role|roleid|) (?<roleId>\S+))?/mi;

module.exports = async (_, collections) => {

  // roleType: 0 (reaction), 1 (default), 2 (self)
  async function setupRole(bot, interaction, roleType) {

    if (interaction) {

      const options = interaction.data.options;
      const action = options.find(option => option.type === 1);
      const Input = {
        channelId: ((action.options || [{}]).find(option => option.name === "channel") || {}).value,
        messageId: ((action.options || [{}]).find(option => option.name === "message_id") || {}).value,
        roleId: ((action.options || [{}]).find(option => option.name === "role") || {}).value,
        emoji: ((action.options || [{}]).find(option => option.name === "emoji") || {}).value,
        noExisting: (action.options || [{}]).find(option => option.name === "no_existing"),
        noBots: (action.options || [{}]).find(option => option.name === "no_bots")
      };
      let emoji;
      let response;
      
      // Make sure every variable was supplied
      if (!action.name === "list" && (!Input.roleId || (roleType === 0 && (!Input.channelId || !Input.messageId || !Input.emoji)))) {

        response = "What's the " + (roleType !== 0 || Input.emoji ? (
          (
            roleType !== 0 || Input.channelId ? (
              roleType !== 0 || Input.messageId ? "role" : "message"
            ) : "channel"
          ) + " ID"
        ) : "emoji") + "?";

        return await interaction.createFollowup(response); 

      }

      emoji = Input.emoji && Input.emoji.includes("<") ? Input.emoji.substring(1, Input.emoji.length - 1) : Input.emoji;
      let reactMessage;
      if (roleType === 0 && action.name !== "list") {

        // Now let's make sure that the bot can access the message and channel
        try {

          reactMessage = await bot.getMessage(Input.channelId, Input.messageId);

        } catch (err) {

          return await interaction.createFollowup("Message " + Input.messageId + " doesn't exist in <#" + Input.channelId + ">");

        }

        // Let's make sure that we can use that emoji
        const msg = await bot.createMessage(interaction.channel_id, "Testing emoji accessibility...");
        try {

          await msg.addReaction(emoji);

        } catch (err) {

          await msg.delete();
          return await interaction.createFollowup("I couldn't add that emoji to your message! Do I have permission to react in this channel or are you flexing your Nitro?");

        }

        // Check permission in the channel
        const ReactChannel = bot.getChannel(Input.channelId);
        if (ReactChannel && !ReactChannel.permissionsOf(bot.user.id).has("addReactions")) {

          await msg.delete();
          return await interaction.createFollowup("I don't have permission to react in <#" + Input.channelId + ">...");

        }

      }
      
      // Register this into the database
      const guild = bot.guilds.find(possibleGuild => possibleGuild.id === interaction.guildID);
      const member = guild.members.find(possibleMember => possibleMember.id === interaction.member.user.id);
      if (action.name === "add") {

        if (!member.permissions.has("manageRoles")) {

          return await interaction.createFollowup("Sorry, no can do! You don't have permission to manage roles. Did you mean `/selfroles get`?");

        }

        await collections.autoRoles.insertOne({
          messageId: Input.messageId,
          channelId: Input.channelId,
          emoji: emoji,
          type: roleType,
          roleId: Input.roleId
        });

      } else if (action.name === "get") {

        // Check if role exists
        const role = await collections.autoRoles.findOne({roleId: Input.roleId, type: 2});
        if (guild.roles.find(possibleRole => possibleRole.id === Input.roleId) && role) {

          await member.addRole(role.roleId, "Asked for it");
          return await interaction.createFollowup("It's yours, my friend.")

        }

        return await interaction.createFollowup("That role isn't on the table!");

      } else if (action.name === "list") {

        const roles = await collections.autoRoles.find({type: roleType}).toArray();
        const rolesToDelete = [];
        let descRoles = "";

        for (let i = 0; roles.length > i; i++) {
            
          // Check if role exists
          const guildRole = guild.roles.find(possibleRole => possibleRole.id === roles[i].roleId);

          if (!guildRole) {

            rolesToDelete.push(roles[i].roleId);
            continue;

          }
          
          const roleIcon = roles[i].emoji && roles[i].emoji.includes(":") ? "<" + roles[i].emoji + ">" : roles[i].emoji || "🔖";
          descRoles = descRoles + (i !== 0 ? "\n" : "") + roleIcon + " **<@&" + guildRole.id + ">**" + (roleType === 0 ? " [[Attachment]](https://discord.com/channels/" + guild.id + "/" + roles[i].channelId + "/" + roles[i].messageId + ")" : "");
          
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
      
      let affectedMembers = 0;
      if (roleType === 0) {

        // Add the reaction
        await reactMessage.addReaction(emoji);
        if (msg) await msg.delete();

      } else if (roleType === 1 && !Input.noExisting) {

        // Give this role to existing members
        const guildMembers = guild.members.map(possibleMember => possibleMember);
        for (let i = 0; guildMembers.length > i; i++) {

          if (!guildMembers[i].roles.find(roleId => Input.roleId === roleId) && (!guildMembers[i].bot || !Input.noBots)) {

            await guildMembers[i].addRole(Input.roleId, "Adding default role to existing members");
            affectedMembers++;

          }

        }

      }
      
      // Everything is OK!
      return await interaction.createFollowup("Role added!" + (roleType === 1 ? " Gave the role to " + affectedMembers + " existing members too." : ""));

    }

  }

  new Commands.new("reactionroles", "Configures reaction roles", async (bot, interaction) => await setupRole(bot, interaction, 0), 0, [
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
  ]);

  new Commands.new("defaultroles", "Configure roles given when people join", async (bot, interaction) => await setupRole(bot,interaction, 1), 0, [
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
  ]);

  new Commands.new("selfroles", "Configure obtainable roles", async (bot, interaction) => await setupRole(bot, interaction, 2), 0, [
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
  ]);

};
