const Commands = require("../commands");

module.exports = function() {
  new Commands.new("help", ["commands", "cmds"], "about", "Lists commands of the bot.", [
    {
      args: "",
      description: "List available commands"
    }, {
      args: "<command>",
      description: "Get info about a specific command"
    }
  ], (bot, args, msg) => {
    
    const AuthorPing = "<@" + msg.author.id + ">";

    // Check if they want to know more about a specific command
    if (args) {
      
      const Prefix = Commands.getPrefix();
      const CommandName = args.includes(" ") ? args.substring(0, args.indexOf(" ")) : args;
      const Command = Commands.get(CommandName);

      if (!Command) {
        msg.channel.createMessage("<@" + msg.author.id + "> Command `" + CommandName + "` doesn't exist.");
        return;
      };
      
      var fields = Command.examples ? [] : undefined;

      for (var i = 0; fields ? Command.examples.length > i : 0; i++) {
        const Example = Command.examples[i];
        const Field = {
          name: Example.description,
          value: "`" + Prefix + CommandName + " " + Example.args + "`",
          inline: true
        };
        fields.push(Field);
      };

      msg.channel.createMessage({
        content: AuthorPing + " Information about `" + Prefix + CommandName + "`:", 
        embed: {
          title: Prefix + CommandName,
          description: Command.description || "That's odd. There's no description available.",
          fields: fields,
          footer: Command.aliases && Command.aliases.length > 0 ? {
            text: "Aliases: " + Command.aliases.join(", ")
          } : undefined
        }
      });
      return;

    };

    // Prepare the help fields
    var helpFields = {}
    
    class HelpCategory {
      
      addCommand(commandName) {
        this.commands.push(commandName);
      };
      
      convertToField() {
        return this.commands.length > 0 ? {
          name: this.title,
          value: this.commands.map((commandName) => {
            return "`" + commandName + "` ";
          }).join("")
        } : undefined;
      };
      
      constructor(categoryName, title) {
        this.name = categoryName;
        this.title = title;
        this.commands = [];
        helpFields[categoryName] = this;
      };
      
    };
    
    new HelpCategory("logging", "📜 Log messages");
    new HelpCategory("archive", "🗂 Archive messages");
    new HelpCategory("config", "🐲 Edit Toasty's config");
    new HelpCategory("about", "<:msdragon:556981917430317058> Get support and learn a thing or two");
    
    const CommandsList = Commands.list;
    const CommandNames = Object.keys(CommandsList);
    for (var i = 0; CommandNames.length > i; i++) {
      
      const CommandName = CommandNames[i];
      const Category = CommandsList[CommandName].category;
      if (!Category || !helpFields[Category]) {
        continue;
      };
      
      helpFields[Category].addCommand(CommandName);
      
    };
    
    // Convert to valid embed fields
    var fields = [];
    const CategoryNames = Object.keys(helpFields);
    for (var i = 0; CategoryNames.length > i; i++) {
      const CategoryName = CategoryNames[i];
      const ConvertedField = helpFields[CategoryName].convertToField();
      
      ConvertedField ? fields.push(ConvertedField) : undefined;
    };
    
    // Show the fields
    msg.channel.createMessage({
      content: AuthorPing + " Here are the list of commands you can run!",
      embed: {
        author: {
          name: "Toasty commands",
          icon_url: bot.user.avatarURL,
          url: "https://toasty.makuwro.com/commands"
        },
        description: fields.length < 1 ? "Huh, I guess you can't run any commands right now. Sorry about that!" : undefined,
        fields: fields.length > 0 ? fields : undefined
      }
    });
    
  });
};