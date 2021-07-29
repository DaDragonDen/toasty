const Command = require("../commands");

// eslint-disable-next-line no-unused-vars
module.exports = (_, collections) => {
  
  new Command.new("qotd", ["questionoftheday"], "qotd", "Ask the community a super duper ULTRA important question", undefined, async (bot, args, msg, interaction) => {

    // Make sure they're allowed to do this
    const member = interaction ? bot.guilds.find(possibleGuild => possibleGuild.id === interaction.guild_id).members.find(possibleMember => possibleMember.id === interaction.member.user.id) : msg.member;
    if (!member.roles.find(roleId => roleId === "498493188357750814")) {

      return {content: "Sorry pal, you need to be an artisan to do that."};

    }

    const question = interaction ? interaction.data.options.find(option => option.name === "question").value : args;
    let response = "What's your question?";
    if (question) {

      // Check if there are any questions in the queue
      const questions = await collections.questions.find({}).toArray();
      const oldMessages = await bot.getMessages("517078514277679152");
      const today = new Date();

      if (questions[0] || oldMessages.find(message => today.getTime() - message.timestamp < 86400000 && message.roleMentions.find(possibleRoleId => possibleRoleId === "713445214932434944"))) {

        // Add the question to the queue
        await collections.questions.insertOne({
          content: question,
          askerId: member.id
        });

        // Tell them they'll see it later
        response = "Alright, look out for that one later!";

      } else {

        // Send the question directly to the QOTD channel
        const day = today.getDate() + 1;
        const month = today.getMonth() + 1;
        await bot.createMessage("517078514277679152", {
          content: "> ❓ **Question of the Day - " + (day.length > 1 ? "" : "0") + day + "." + (month.length > 1 ? "" : "0") + month + "." + today.getFullYear() + " (EST)**\n> \n> **<@&713445214932434944>** " + question,
          embed: {
            description: "Asked by <@" + member.id + ">"
          },
          allowedMentions: {
            roles: ["713445214932434944"]
          }
        });

        response = "It is done.";

      }

    }

    return interaction ? {content: response} : await bot.createMessage(msg.channel.id, response);

  }, undefined, [{
    name: "question",
    description: "The question you want to ask",
    type: 3,
    required: true
  }]);

};
