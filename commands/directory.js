const commands = require("../commands");

module.exports = (_, collections) => {

  new commands.new("directory", "List all members", async (bot, interaction) => {

    await interaction.createFollowup("I have to buy a new phonebook. Try again later!");

  }, 0, [
    {
      name: "exclude",
      type: 5,
      description: "Do you want me to exclude the people who have these roles?"
    },
    {
      name: "role1",
      type: 8,
      description: "I will list all members who have this role."
    },
    {
      name: "role2",
      type: 8,
      description: "...and this role."
    },
    {
      name: "role3",
      type: 8,
      description: "Heck, even this role too!"
    }
  ])

}