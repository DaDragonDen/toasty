const processing = {};
const responses = {"👍": 1, "🙊": 0, "👎": -1};
module.exports = async (member, dbClient, msg, bot, emoji) => {

  // Make sure they're allowed to vote
  if (!member.roles.find(id => id === "498493188357750814")) {

    await msg.channel.createMessage("You're not an artisan, so you can't vote in this evaluation yet. Sorry about that!");
    return;

  }

  // Make sure they can't speed past this and break stuff
  const uid = member.id;
  if (processing[uid]) return;
  processing[uid] = true;
  
  // Check if they explained a negative vote, or if they just voted
  const guild = bot.guilds.find(possibleGuild => possibleGuild.id === "497607965080027136");
  const collection = dbClient.staffFeedback;
  const progress = await collection.findOne({userId: uid});
  const decisions = progress && progress.decisions ? JSON.parse(progress.decisions) : {};
  const reference = msg.messageReaction;
  const refMsg = await bot.getMessage(msg.channel.id, reference.messageID);
  const reactions = refMsg && await refMsg.getReaction("👎");
  const response = emoji && responses[emoji.name];
  if (reference && progress && progress.lastMessageId === reference.messageID && reactions && reactions.find(reactor => reactor.id === uid)) {

    // Update their vote
    const staffId = refMsg.embeds[0].footer.text;
    const staffMember = guild.members.find(possibleMember => possibleMember.id === staffId);

    decisions[staffId] = [-1, refMsg.id, msg.content];
    await collection.updateOne(
      {userId: uid}, 
      {$set: {decisions: JSON.stringify(decisions)}},
      {upsert: true}
    );

    // Update the message
    await refMsg.edit({
      content: "You said that **" + staffMember.username + "** __is not__ a good fit for Da Dragon Den. Thank you for explaining!",
      embed: {
        color: 15551811,
        author: {
          name: (staffMember.roles.includes("862071715441803285") ? "President " : (
            staffMember.roles.includes("862071540521369661") ? "Vice President " : (
              staffMember.roles.includes("549312685255294976") ? "Governor " : "Draconic Guard "
            )
          )) + staffMember.username
        },
        fields: [{
          name: "Your explanation",
          value: msg.content
        }],
        description: "if you change your mind, shoot a msg to christian",
        thumbnail: {
          url: staffMember.avatarURL
        }, 
        footer: {
          text: staffMember.id
        }
      }
    });

  } else if (progress && progress.lastMessageId === msg.id && response !== undefined) {

    progress.decisions = JSON.parse(progress.decisions);

    // Save the vote
    msg = msg.embeds ? msg : await bot.getMessage(msg.channel.id, msg.id);
    const staffId = msg.embeds[0].footer.text;
    const staffMember = guild.members.find(possibleStaffMember => possibleStaffMember.id === staffId);
    progress.decisions[staffId] = [response, msg.id];
    if (response !== -1) {

      await collection.updateOne(
        {userId: uid}, 
        {$set: {decisions: JSON.stringify(progress.decisions)}},
        {upsert: true}
      );

    }
    
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

  }

  if (response !== -1) {

    // Check if there's any staff to vote for
    const staff = {};
    staff[guild.id] = guild.members.filter(possibleStaffmember => possibleStaffmember.roles.includes("862071715441803285") || possibleStaffmember.roles.includes("862071540521369661") || possibleStaffmember.roles.includes("549312685255294976") || possibleStaffmember.roles.includes("753661816999116911"));
    const crew = staff[guild.id];
    const roles = ["862071715441803285", "862071540521369661", "549312685255294976"];
    crew.sort((member1, member2) => {

      let priority = 0;
      for (let i = 0; roles.length > i; i++) {
        
        const member1HasRole = member1.roles.includes(roles[i]);
        const member2HasRole = member2.roles.includes(roles[i]);
        priority = member1HasRole && !member2HasRole ? -1 : (member2HasRole && !member1HasRole ? 1 : 0);
        if (priority !== 0) break;

      }
      return priority;

    });
    
    let nextUp;
    for (let i = 0; crew.length > i; i++) {

      if (!progress.decisions[crew[i].id]) {

        nextUp = crew[i];
        break;
        
      }

    }

    // Check if they already started
    if (msg.content.toLowerCase() === "start staff evaluation" && nextUp && progress && progress.lastMessageId) {

      await msg.channel.createMessage(nextUp ? "This is where you left off: https://discord.com/channels/@me/" + msg.channel.id + "/" + progress.lastMessageId : "You already voted. Thank you!");
      return;

    }

    // Start the evaluation
    const channel = await bot.getDMChannel(uid);
    if (nextUp) {

      const evalMsg = await channel.createMessage({
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

      // Make sure they're not able to vote again
      await collection.updateOne(
        {userId: uid}, 
        {$set: {lastMessageId: ""}},
        {upsert: true}
      );

      await channel.createMessage("And that's everyone! Thanks for your input.");

    }

  }

  // Let them act again, if they need to
  processing[uid] = false;

};
