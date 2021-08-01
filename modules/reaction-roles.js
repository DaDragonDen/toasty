module.exports = async (collection, botMember, userMember, msg, emoji, add) => {

  try {

    // Make sure they aren't a bot
    if (userMember.bot) return;
      
    // Check if the message is a role message
  const roleMessageInfo = await collection.findOne({roleMessageId: msg.id, emoji: emoji.id || emoji.name});
  if (roleMessageInfo) {

    // Check if we can add roles
    if (!botMember.permissions.has("manageRoles")) {

      console.log("\x1b[33m%s\x1b[0m", "[Reaction Roles]: I don't have permission to add roles in Guild " + msg.channel.guild.id);
      return;

      }
        
      // Add or remove the role
      if (add) {

        userMember.addRole(roleMessageInfo.roleId, "Reacted to message associated with the role");

      } else {

        userMember.removeRole(roleMessageInfo.roleId, "Removed reaction of message associated with the role");

      }
      
    }

  } catch (err) {

    console.log("\x1b[33m%s\x1b[0m", "[Reaction Roles]: Something bad happened when handling reaction roles: " + err);

  }

};
