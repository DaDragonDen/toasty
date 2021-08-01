module.exports = async (collection, botMember, userMember, msg, emoji) => {

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
      
    // Add the role
    await userMember.addRole(roleMessageInfo.roleId, "Reacted to message associated with the role");
    
  }

};
