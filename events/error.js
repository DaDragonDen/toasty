module.exports = function(bot) {
  bot.on("error", (err) => {
    console.warn("Error: " + err);
  });
};