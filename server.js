module.exports = () => {

  const express = require("express");
  const app = express();

  app.get("*", (req, res) => res.sendStatus(200));

  app.listen(3000, () => console.log("\x1b[32m%s\x1b[0m", "[Web Server] Listening on port 3000"))

};