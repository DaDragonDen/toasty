const Command = require("../commands");

// eslint-disable-next-line no-unused-vars
module.exports = (_, collections) => {
  
  new Command.new("eval", "A command for debugging the bot", async (bot, interaction) => {

    // Make sure they're allowed to eval
    if ((interaction.member || interaction.user).id !== "419881371004174338") return await interaction.createFollowup("I don't think I want to do that.");
    
    // Run the command
    try {

      eval(interaction.data.options.find(option => option.name === "code").value );
      return await interaction.createFollowup("Done!");

    } catch (err) {

      return await interaction.createFollowup(err.message);

    }

  }, 0, [{
    name: "code",
    description: "The code you want to run",
    type: 3,
    required: true
  }]);

};
