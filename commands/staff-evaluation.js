const Command = require("../commands");

module.exports = (_, collections) => {

  new Command.new("staffeval", [], "dev", "Evaluate staff members", undefined, async (bot, args, msg, interaction) => {
    
    const collection = collections.staffFeedback;
    const voterData = await collection.find().toArray();
    const votes = {};
    let invalids = 0;
    
    for (let i = 0; voterData.length > i; i++) {

      if (voterData[i].invalid) {

        invalids++;
        continue;

      }

      const decisions = JSON.parse(voterData[i].decisions);
      for (const userId of Object.keys(decisions)) {

        votes[userId] = votes[userId] || {"-1": 0, "0": 0, "1": 0};
        votes[userId][decisions[userId][0].toString()]++;

      }

    }
    
    const guild = bot.guilds.find(possibleGuild => possibleGuild.id === "497607965080027136");
    let s = "";
    for (const staffId of Object.keys(votes)) {

      const staffMember = guild.members.find(possibleStaffMember => possibleStaffMember.id === staffId) || {username: "User left the guild (" + staffId + ")"};
      const staffVotes = votes[staffId];
      const sum = staffVotes["1"] - staffVotes["-1"];
      const crossout = sum < 1 ? "~~" : "";
      s = s + crossout + staffMember.username + ": **" + sum + "** (" + staffVotes["1"] + " / " + staffVotes["0"] + " / " + staffVotes["-1"] + ")" + crossout + "\n";

    }
    
    const msgText = s + "\nremoved " + invalids + " invalid votes";
    return interaction ? msgText : await msg.channel.createMessage(msgText);
    
  }, undefined, {});

};
