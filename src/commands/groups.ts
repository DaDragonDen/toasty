import { InteractionDataOptionsSubCommand, Role, SelectMenuOptions } from "eris";
import { Command } from "../commands.js";

interface MenuDataProperties {
  [guildId: string]: {
    page: number;
    selectedRoles: Role[];
  }
}

const menuData: MenuDataProperties = {};

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
    const {guild} = interaction.channel;
    const member = guild.members.find(possibleMember => possibleMember.id === interaction.member?.user.id);
    if (!member) {
      
      await interaction.createFollowup("I can't find you in the guild member list!");
      return;

    }

    // Verify that we have a base role.
    const subCommand = interaction.data.options?.find((option) => option.type === 1) as InteractionDataOptionsSubCommand;
    if (!subCommand) {

      await interaction.createFollowup("Couldn't find sub-command.");
      return;

    }

    const baseRole = subCommand.options?.find((option) => option.name === "base")?.value;
    if (!baseRole) {
      
      await interaction.createFollowup("You didn't give me a role to work with!");
      return;

    }

    // Make sure they have permission to manage roles.
    if (!member.permissions.has("manageRoles")) {

      await interaction.createFollowup("Unfortunately, I can't do that. You don't have permission to manage roles.");
      return;

    }

    // Make sure there is at least one role in the guild.
    let roles = guild.roles.filter(() => true);
    if (roles.length === 0) {

      await interaction.createFollowup("There aren't any roles in this server!");
      return;

    }

    // Present the roles to the user.
    let selectMenuOptions: SelectMenuOptions[] = [];
    for (let i = 0; roles.length >= i; i++) {

      const {name, id} = roles[i];
      selectMenuOptions[i] = {
        label: name,
        value: id
      };

      if (selectMenuOptions.length === 25) break;

    }

    await interaction.createFollowup({
      content: `What roles do you want to associate with <@&${baseRole}>?`,
      embeds: [
        {
          description: "As you select roles, I'll add them to this list!"
        }
      ],
      components: [
        {
          type: 1, 
          components: [
            {
              type: 3,
              custom_id: "menu-test",
              options: selectMenuOptions,
              min_values: 1,
              max_values: 25
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
              custom_id: "submit",
              disabled: true
            },
            {
              type: 2,
              label: "Next page",
              style: 2,
              custom_id: "next",
              disabled: true
            }
          ]
        },
        {
          type: 1,
          components: [
            {
              type: 2,
              label: "Create role group",
              style: 2,
              custom_id: "submit"
            }
          ]
        }
      ]
    });

  }
});