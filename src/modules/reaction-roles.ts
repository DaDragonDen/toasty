import { Member, Message, PartialEmoji, TextableChannel } from "eris";
import { Collection } from "mongodb";

export default async (collection: Collection, botMember: Member, userMember: Member, msg: Message<TextableChannel>, emoji: PartialEmoji, add: boolean) => {

  try {

    // Make sure they aren't a bot
    const {channel} = msg;
    if (userMember.bot || !("guild" in channel)) return;
      
    // Check if the message is a role message
    const query = {
      messageId: msg.id, 
      emoji: emoji.id ? ":" + emoji.name + ":" + emoji.id : emoji.name,
      type: 0
    };
    const roleMessageInfo = await collection.findOne(query);
    if (roleMessageInfo) {

      // Check if we can manage roles
      if (!botMember.permissions.has("manageRoles")) {

        console.log("\x1b[33m%s\x1b[0m", "[Reaction Roles]: I don't have permission to add roles in Guild " + channel.guild.id);
        return;

      }

      // Check if the role exists
      if (!channel.guild.roles.find((role) => role.id === roleMessageInfo.roleId)) {

        // Delete the auto role.
        await collection.deleteOne(query);
        return;

      }
        
      // Add or remove the role
      try {

        if (add) {

          userMember.addRole(roleMessageInfo.roleId, "Reacted to message associated with the role");

        } else {

          userMember.removeRole(roleMessageInfo.roleId, "Removed reaction of message associated with the role");

        }

      } catch (err) {

        console.warn(`Couldn't ${add ? "add" : "remove"} role: ${err}`);

      }
      
    }

  } catch (err) {

    console.log("\x1b[33m%s\x1b[0m", "[Reaction Roles]: Something bad happened when handling reaction roles: " + err);

  }

};
