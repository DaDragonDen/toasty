import { Role } from "eris";
import { Command } from "../commands.js";

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

    // Make sure they have permission to manage roles.
    if (!member.permissions.has("manageRoles")) {

      await interaction.createFollowup("Unfortunately, I can't do that. You don't have permission to manage roles.");
      return;

    }

    // Present the list of server roles to them.
    const selectedRoles: Role[] = [];
    while (!selectedRoles[0]) {

    }
    const {roles} = guild;


  }
});