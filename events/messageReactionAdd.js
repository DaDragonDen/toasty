var responses = {"👍": 1, "🙊": 0, "👎": -1};
var processing = {};

module.exports = async function (bot, collections) {
  
  bot.on("messageReactionAdd", async (msg, emoji, reactor) => {
    
    // Prevent us from reacting to ourselves
    var uid = reactor.id;
    if (uid === bot.user.id) return;
    
    try {
       
      if (msg.guildID) {
        
        var collection = collections.reactionRoles;
      
          var members = msg.channel.guild.members;
          const BotMember = members.find((m) => {
            return m.id === bot.user.id;
          });
          const UserMember = members.find((m) => {
            return m.id === reactor.id;
          });
          
          // Make sure they aren't a bot
          if (UserMember.bot) return;
          
          // Check if the message is a role message
          console.log(emoji.id) 
          var roleMessageInfo = await collection.findOne({roleMessageId: msg.id, emoji: emoji.id || emoji.name});
          if (roleMessageInfo) {
            // Check if we can add roles
            if (!BotMember.permissions.has("manageRoles")) {
              console.warn("Can't add roles");
              return;
            };
            
            // Add the role
            await UserMember.addRole(roleMessageInfo.roleId, "Reacted to message associated with the role");
            
          };
          
          /*
          // Check if it's a QOTD
          if (qotds[msg.id] && emoji.name === "🛑") {
            clearTimeout(qotds[msg.id]);
            qotds[msg.id] = undefined;
            await msg.edit("~~" + msg.content + "~~\n\nAlright, I won't send it.");
          };
          */
        
      } else if (!processing[uid]) {
      
        processing[uid] = true;
        // Check if it's an evaluation message
        var collection = collections.staffFeedback;
        var progress = await collection.findOne({userId: uid});
        var response = responses[emoji.name];
        if (progress && progress.lastMessageId === msg.id && response !== undefined) {
          progress.decisions = JSON.parse(progress.decisions);
          // Save the vote
          msg = msg.embeds ? msg : await bot.getMessage(msg.channel.id, msg.id);
          var staffId = msg.embeds[0].footer.text;
          var guild = bot.guilds.find(guild => guild.id === "497607965080027136");
          var staffMember = guild.members.find(member => member.id === staffId);
          progress.decisions[staffId] = [response, msg.id];
          if (response !== -1) {
            await collection.updateOne(
              {userId: uid}, 
              {$set: {decisions: JSON.stringify(progress.decisions)}},
              {upsert: true}
            );
          };
          
          // Update the message
          await msg.edit({
            content: "You " + (response === 0 ? "decided not to evaluate **" + staffMember.username + "**." : 
              "said that **" + staffMember.username + "** __is" + (response === 1 ? "" : " not") + "__ a good fit for Da Dragon Den. " + (response === -1 ? "Can you tell us why you voted this way?" : "Thank you for voting!")),
            embed: {
              color: response === 1 ? 10941264 : (response === -1 ? 15551811 : 13290186),
              author: {
                name: (staffMember.roles.includes("862071715441803285") ? "President " : (staffMember.roles.includes("862071540521369661") ? "Vice President " : (staffMember.roles.includes("549312685255294976") ? "Governor " : "Draconic Guard "))) + staffMember.username
              },
              description: response === -1 ? "an explanation is needed for negative votes. just **reply** (right-click or hold down this message and press reply) with an explanation. to cancel, press another reaction" : "if you change your mind, shoot a msg to christian",
              thumbnail: {
                url: staffMember.avatarURL
              }, 
              footer: {
                text: staffMember.id
              }
            }
          });
          
          if (response !== -1) {
            // Check if there's any more staff to vote for
            var staff = {};
            var guild = bot.guilds.find(guild => guild.id === "497607965080027136");
            staff[guild.id] = guild.members.filter(member => member.roles.includes("862071715441803285") || member.roles.includes("862071540521369661") || member.roles.includes("549312685255294976") || member.roles.includes("753661816999116911"));
            let crew = staff[guild.id];
            let roles = ["862071715441803285", "862071540521369661", "549312685255294976"];
            crew.sort((member1, member2) => {
              let priority = 0;
              for (var i = 0; roles.length > i; i++) {
                let member1HasRole = member1.roles.includes(roles[i]);
                let member2HasRole = member2.roles.includes(roles[i]);
                priority = member1HasRole && !member2HasRole ? -1 : (member2HasRole && !member1HasRole ? 1 : 0);
                if (priority !== 0) break;
              };
              return priority;
            });
            
            var nextUp;
            for (var i = 0; crew.length > i; i++) {
              if (!progress.decisions[crew[i].id]) {
                nextUp = crew[i];
                break;
              };
            };
            var channel = await bot.getDMChannel(uid);
            if (nextUp) {
              var evalMsg = await channel.createMessage({
                content: "Do you think **" + nextUp.username + "** is still a good fit for the team?",
                embed: {
                  author: {
                    name: (nextUp.roles.includes("862071715441803285") ? "President " : (nextUp.roles.includes("862071540521369661") ? "Vice President " : (nextUp.roles.includes("549312685255294976") ? "Governor " : "Draconic Guard "))) + nextUp.username
                  },
                  description: "\n\n> 👍 No problems with them" + 
                    "\n\n> 🙊 I prefer not to say" + 
                    "\n\n> 👎 They're problematic, and I'll tell you why!",
                  thumbnail: {
                    url: nextUp.avatarURL
                  }, 
                  footer: {
                    text: nextUp.id
                  }
                }
              });
              
              // Remember this message 
              await collection.updateOne(
                {userId: uid}, 
                {$set: {lastMessageId: evalMsg.id}},
                {upsert: true}
              );
              
              // Add the reactions
              await evalMsg.addReaction("👍");
              await evalMsg.addReaction("🙊");
              await evalMsg.addReaction("👎");
            } else {
              await collection.updateOne(
                {userId: uid}, 
                {$set: {lastMessageId: ""}},
                {upsert: true}
              );
              await channel.createMessage("And that's everyone! Thanks for your input.");
            };
          };
        };
        
        processing[uid] = false;
      };
    } catch (err) {
      console.warn("[messageReactionAdd.js]: " + err);
    };
  });
};