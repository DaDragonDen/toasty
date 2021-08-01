const fetch = require("node-fetch");
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
        const discordRes = await fetch("https://discord.com/api/v9/channels/517078514277679152/threads", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bot " + process.env.token
          },
          body: JSON.stringify({
            name: question,
            auto_archive_duration: 1440,
            type: 11
          })
        });
        const jsonRes = await discordRes.json();
        if (jsonRes.id) {

          await bot.createMessage(jsonRes.id, {
            content: "<@&713445214932434944> " + question,
            embed: {
              description: "Asked by <@" + member.id + ">"
            }
          });

          response = "It is done.";

        } else {

          response = "Oh no! Something really bad happened when I tried to do that... Let's try again.";

        }

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
