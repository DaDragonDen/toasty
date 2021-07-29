module.exports = async function (bot) {
  const Database = await require("../database");
  const dbClient = Database.mongoClient;
  const db = dbClient.db("guilds");
  const collection = db.collection("ReactionRoles");
  
  bot.on("messageReactionRemove", async (msg, emoji, userId) => {
    
    try {
      var members = msg.channel.guild.members;
      const BotMember = members.find((m) => {
        return m.id === bot.user.id;
      });
      const UserMember = members.find((m) => {
        return m.id === userId;
      });
      
      // Make sure they aren't a bot
      if (UserMember.bot) return;
      
      // Check if the message is a role message
      var roleMessageInfo = await collection.findOne({roleMessageId: msg.id, emoji: emoji.id || emoji.name});
      if (roleMessageInfo) {
      
        // Check if we can remove roles
        if (!BotMember.permissions.has("manageRoles")) {
          console.warn("Can't add roles");
          return;
        };
        
        // Remove the role
        await UserMember.removeRole(roleMessageInfo.roleId, "Removed reaction of message associated with the role");
        
      };
    } catch (err) {
      console.warn("[messageReactionRemove.js]: " + err);
    };
  });
};