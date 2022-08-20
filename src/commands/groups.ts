import { Guild, InteractionDataOptionsSubCommand, Member, Message, Role, SelectMenuOptions } from "eris";
import { Command } from "../commands.js";

interface ActiveInteractions {
  [messageId: string]: {
    selectedRoleIds: string[];
    latestActionTime: number;
  }
}

const activeInteractions: ActiveInteractions = {};

new Command({
  name: "groups",
  description: "Configure role groups",
  cooldown: 0,
  slashOptions: [
    {
      name: "create",
      description: "Creates a role group",
      type: 1,
      options: [
        {
          name: "base",
          description: "If this role is given...",
          type: 8,
          required: true
        }
      ]
    },
    {
      name: "delete",
      description: "Deletes a role group",
      type: 1,
      options: [
        {
          name: "base",
          description: "If this role is given...",
          type: 8,
          required: true
        }
      ]
    }
  ],
  action: async ({discordClient, collections, interaction}) => {

    // Verify that we're in a text channel.
    if (!("guild" in interaction.channel)) {
        
      await interaction.createFollowup("You can only run this command in a guild!");
      return;
      
    }

    // Verify the guild member.
    const {guild}: {guild: Guild} = interaction.channel;
    const member: Member | undefined = guild.members.find(possibleMember => possibleMember.id === interaction.member?.user.id);
    if (!member) {
      
      await interaction.createFollowup("I can't find you in the guild member list!");
      return;

    }

    // Make sure they have permission to manage roles.
    if (!member.permissions.has("manageRoles")) {

      await interaction.createFollowup("Unfortunately, I can't do that. You don't have permission to manage roles.");
      return;

    }

    // Make sure the bot is in the server.
    const botMember: Member | undefined = guild.members.find(possibleMember => possibleMember.id === discordClient.user.id);
    if (!botMember) {
      
      await interaction.createFollowup("I can't find myself on the guild member list!");
      return;

    }

    // Get the bot's highest role position.
    let highestRolePosition: number = 0;
    for (let i = 0; botMember.roles.length > i; i++) {

      // Get the role position from the guild.
      const roleId = botMember.roles[i];
      const role = guild.roles.find((possibleRole) => possibleRole.id === roleId);
      if (!role) continue;
      if (highestRolePosition < role.position) highestRolePosition = role.position;

    }

    // Make sure there is at least one role in the guild, excluding managed roles.
    // The bot can't give managed roles to members.
    let roles: Role[] = guild.roles.filter((role: Role) => !role.managed && role.position < highestRolePosition);
    if (roles.length === 0) {

      await interaction.createFollowup("There aren't any non-managed roles in this server!");
      return;

    }

    // Order the roles by their current position.
    roles = roles.sort((roleA: Role, roleB: Role) => roleB.position - roleA.position);

    // Find out if the member already has a menu open.
    if (interaction.type === 2) {

      // This is a command interaction, so the menu hasn't been created.
      // Verify that we have a base role.
      const subCommand: InteractionDataOptionsSubCommand = interaction.data.options?.find((option) => option.type === 1) as InteractionDataOptionsSubCommand;
      if (!subCommand) {

        await interaction.createFollowup("Couldn't find sub-command.");
        return;

      }

      const baseRole: string | number | boolean | undefined = subCommand.options?.find((option) => option.name === "base")?.value;
      if (!baseRole) {
        
        await interaction.createFollowup("You didn't give me a role to work with!");
        return;

      }

      // Check if we're adding or removing a base role to the database.
      switch (subCommand.name) {

        case "add": {

          // Present the roles to the user.
          let selectMenuOptions: SelectMenuOptions[] = [];
          let canGoForward = false;
          for (let i = 0; roles.length >= i; i++) {

            if (selectMenuOptions.length === 25) {

              canGoForward = true;
              break;

            }

            const {name, id}: {name: string, id: string} = roles[i];
            selectMenuOptions.push({
              label: name,
              value: id
            });

          }

          const followup: Message = await interaction.createFollowup({
            content: `What roles do you want to associate with <@&${baseRole}>?`,
            components: [
              {
                type: 1, 
                components: [
                  {
                    type: 3,
                    custom_id: "menu",
                    options: selectMenuOptions,
                    min_values: 0,
                    max_values: selectMenuOptions.length
                  }
                ]
              },
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    label: "Previous page",
                    style: 2,
                    custom_id: "previous",
                    disabled: true
                  },
                  {
                    type: 2,
                    label: "Page 1",
                    style: 2,
                    custom_id: "page",
                    disabled: true
                  },
                  {
                    type: 2,
                    label: "Next page",
                    style: 2,
                    custom_id: "next",
                    disabled: !canGoForward
                  }
                ]
              },
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    label: "Create role group",
                    style: 3,
                    custom_id: "submit",
                    disabled: true
                  }
                ]
              }
            ]
          });

          activeInteractions[followup.id] = {
            latestActionTime: new Date().getTime(),
            selectedRoleIds: []
          };
          break;

        }

        case "delete": {

          // Try to delete the base from the database.
          const {deletedCount} = await collections.roleGroups.deleteOne({baseRoleId: baseRole});
          
          // Tell the member.
          await interaction.createFollowup(deletedCount > 0 ? "Done." : "I don't have that base role in my records.");
          break;

        }

        default:
          break;

      }

    } else if (interaction.type === 3) {

      // This is a component interaction, so the menu is open.
      const originalMessage: Message = interaction.message;

      // Check if the member wants to change the page or submit.
      const {custom_id}: {custom_id: string} = interaction.data;
      switch (custom_id) {

        case "previous":
        case "next": {
          
          // Calculate the new page number.
          const pageComponent = originalMessage.components?.[1].components?.[1];
          const currentPageNumber = pageComponent?.type === 2 && pageComponent.label ? parseInt(pageComponent.label.slice(5), 10) : 1;
          const newPageNumber = currentPageNumber + (custom_id === "next" ? 1 : -1);

          // Iterate through the roles, and start on the new page number.
          let selectMenuOptions: SelectMenuOptions[] = [];
          let canGoForward: boolean = false;
          const {selectedRoleIds} = activeInteractions[originalMessage.id];
          for (let i = (newPageNumber - 1) * 24; roles.length > i; i++) {

            if (selectMenuOptions.length === 25) {

              canGoForward = true;
              break;

            }

            const {name, id} = roles[i];
            selectMenuOptions.push({
              label: name,
              value: id,
              default: selectedRoleIds.find((possibleId) => possibleId === id) ? true : false
            });

          }

          // Check if there are roles not shown.
          let embed: Message["embeds"][0] | undefined;
          for (let i = 0; selectedRoleIds.length > i; i++) {

            const id = selectedRoleIds[i];
            if (!selectMenuOptions.find((possibleId) => possibleId.value === id)) {

              const roleMentionString = `<@&${id}>`;
              if (embed) {

                embed.description += `, ${roleMentionString}`;

              } else {

                embed = {
                  type: "rich",
                  title: "Roles that you selected, but aren't listed:",
                  description: roleMentionString
                };

              }

            }

          }

          // Update the original followup.
          await originalMessage.edit({
            content: interaction.message.content,
            embeds: embed ? [embed] : [],
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 3,
                    custom_id: "menu",
                    options: selectMenuOptions,
                    min_values: 0,
                    max_values: selectMenuOptions.length
                  }
                ]
              },
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    label: "Previous page",
                    style: 2,
                    custom_id: "previous",
                    disabled: newPageNumber === 1
                  },
                  {
                    type: 2,
                    label: `Page ${newPageNumber}`,
                    style: 2,
                    custom_id: "page",
                    disabled: true
                  },
                  {
                    type: 2,
                    label: "Next page",
                    style: 2,
                    custom_id: "next",
                    disabled: !canGoForward
                  },
                ]
              },      
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    label: "Create role group",
                    style: 3,
                    custom_id: "submit",
                    disabled: activeInteractions[originalMessage.id].selectedRoleIds[0] ? false : true
                  }
                ]
              }
            ]
          });

          break;

        }

        case "submit": {

          // Save the list of roles to the database.
          const {selectedRoleIds} = activeInteractions[originalMessage.id];
          const baseRoleId = originalMessage.content.match(/<@&\d+>/gm)?.[0].match(/\d+/gm)?.[0];
          if (!baseRoleId) return;
          await collections.roleGroups.updateOne(
            {baseRoleId}, 
            {
              $set: {
                baseRoleId,
                attachedRoleIds: selectedRoleIds
              }
            }, 
            {upsert: true}
          );

          // And we're done!
          await originalMessage.edit({
            content: `Attached the following roles to <@&${baseRoleId}>: <@&${selectedRoleIds.join(">, <@&")}>`,
            embeds: [],
            components: []
          });

          break;

        }

        case "menu": {

          const endInteractionWithError: () => Promise<void> = async () => {

            await interaction.message.delete();
            return;

          };

          // Make sure we have options.
          const selectMenu = originalMessage.components?.[0].components?.[0];
          const options = selectMenu && "options" in selectMenu ? selectMenu.options : undefined;
          if (!selectMenu || !options) return await endInteractionWithError();

          // Make sure we have values.
          const rolesInSelectMenu = "values" in interaction.data ? interaction.data.values : undefined;
          if (!rolesInSelectMenu) return endInteractionWithError();

          // Make sure the interaction was recorded.
          if (!activeInteractions[originalMessage.id]) return await endInteractionWithError();

          // Iterate through the options shown in the select menu.
          for (let i = 0; options.length > i; i++) {

            const currentRoleId = options[i].value;
            const possibleIdChecker = (possibleId: string): boolean => possibleId === currentRoleId;

            // Check if the member wants to add or remove a role from the role group.
            const isRoleInSelectMenu = rolesInSelectMenu.find(possibleIdChecker);
            if (isRoleInSelectMenu) {

              // Add the role ID to the selected role list.
              activeInteractions[originalMessage.id].selectedRoleIds.push(currentRoleId);
              options[i].default = true;

            } else if (activeInteractions[originalMessage.id].selectedRoleIds.find(possibleIdChecker)) {

              // Remove the role ID from the selected role list.
              activeInteractions[originalMessage.id].selectedRoleIds = activeInteractions[originalMessage.id].selectedRoleIds.filter((possibleId) => !possibleIdChecker(possibleId));
              options[i].default = false;

            } 

          }

          // Check if the submit button status needs to changed.
          const submitButtonDisabled = originalMessage?.components?.[2].components?.[0].disabled;
          const isSelectingAtLeastOne = activeInteractions[originalMessage.id].selectedRoleIds[0] ? true : false;
          const shouldBeDisabled = !submitButtonDisabled && !isSelectingAtLeastOne;
          if ((submitButtonDisabled && isSelectingAtLeastOne) || shouldBeDisabled) {

            await originalMessage.edit({
              content: originalMessage.content,
              components: [
                {
                  type: 1,
                  components: [
                    {
                      type: 3,
                      custom_id: "menu",
                      options,
                      min_values: 0,
                      max_values: options.length
                    }
                  ]
                },
                originalMessage.components![1],
                {
                  type: 1,
                  components: [
                    {
                      ...originalMessage.components![2].components[0],
                      disabled: shouldBeDisabled
                    }
                  ]
                }
              ]
            });

          }
          break;

        }

        default:
          break;

      }

    }

  },
  customIds: ["menu", "previous", "next", "submit"]
});