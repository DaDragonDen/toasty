const {TwitterApi} = require("twitter-api-v2");
const express = require("express");
const path = require("path");
const fetch = require("node-fetch");

const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

module.exports = (bot, collections) => {

  const secrets = {};
  app.get("/login", async (req, res) => {

    switch (req.query.reason) {

      case "twitter": {

        // Generate auth link
        const twitterClient = new TwitterApi({
          appKey: process.env.twitterAPIKey,
          appSecret: process.env.twitterAPIKeySecret
        });
        const authLink = await twitterClient.generateAuthLink("http://127.0.0.1:3000/auth/twitter", {linkMode: "authorize"});
        secrets[authLink.oauth_token] = authLink.oauth_token_secret;

        // Let the user log in
        res.render("twitter-auth", {twitterAuthLink: authLink});
        break;

      }

      default:
        break;

    }

  });

  app.get("/auth/discord", async (req, res) => {

    // Make sure we have the code
    const {code} = req.query;
    if (!code) return res.status(400).json({error: "No code provided"});

    // Convert the code to a token
    const params = new URLSearchParams();
    params.append("code", code);
    params.append("client_id", process.env.discordClientId);
    params.append("client_secret", process.env.discordClientSecret);
    params.append("grant_type", "authorization_code");
    params.append("redirect_uri", "http://127.0.0.1:3000/auth/discord");
    const response = await fetch("https://discord.com/api/oauth2/token", {method: "POST", body: params});
    const json = await response.json();

    // Let the client handle the rest
    return res.render("auth-handler", {sender: "discord", response: json});

  });

  app.get("/auth/twitter", (req, res) => {

    // Make sure we have the auth token, verifier, and secret
    const {oauth_token, oauth_verifier} = req.query;
    const oauth_token_secret = secrets[oauth_token];
    if (!oauth_token || !oauth_verifier || !oauth_token_secret) {

      return res.status(400).json({error: "Missing oauth_token, oauth_verifier, or oauth_token_secret"});

    }

    // Create a temporary Twitter client
    const client = new TwitterApi({
      appKey: process.env.twitterAPIKey,
      appSecret: process.env.twitterAPIKeySecret,
      accessToken: oauth_token,
      accessSecret: oauth_token_secret,
    });
    client.login(oauth_verifier).then(({client: accessToken, accessSecret}) => {

      // Return the values to the client
      res.render("auth-handler", {sender: "twitter", response: {accessToken: accessToken._accessToken, accessSecret: accessSecret}});

    });

  });

  async function getAuthorizedGuilds(token, guildId) {

    // Get the user's info
    const fetchOptions = {
      headers: {
        Authorization: `Bearer ${token}`
      }
    };
    const userResponse = await fetch("https://discord.com/api/users/@me", fetchOptions);
    const userInfo = await userResponse.json();

    // Check if we're returning a specific guild
    if (guildId) {

      const guild = bot.guilds.find(possibleGuild => guildId === possibleGuild.id);
      const member = guild && guild.members.find(possibleMember => possibleMember.id === userInfo.id);
      return member;

    }

    // Get the user's guilds+
    const response = await fetch("https://discord.com/api/users/@me/guilds", fetchOptions);
    const guilds = await response.json();

    // Check which guilds they can manage
    const authorizedGuilds = [];
    for (let x = 0; guilds.length > x; x++) {

      // Check if we're in the guild and if they can manage it
      const guild = bot.guilds.find(possibleGuild => guilds[x].id === possibleGuild.id);
      const member = guild && guild.members.find(possibleMember => possibleMember.id === userInfo.id);
      if (member && member.permissions.has("manageGuild")) authorizedGuilds.push(guilds[x]);

    }

    // Return the guilds they can manage
    return authorizedGuilds;

  }

  app.post("/api/set-twitter-auth", async (req, res) => {

    // Make sure we have everything we need
    const {guild_id} = req.query;
    const {discord_token, access_token, access_secret} = req.headers;
    if (!guild_id || !access_token || !access_secret) return res.status(400).json({error: `No ${guild_id ? (`access ${access_token ? "secret" : "token"}`) : "guild ID"} provided`});

    // Verify that the user has permission to manage the guild
    if (!getAuthorizedGuilds(discord_token, guild_id)) return res.status(403).json({error: "You can't manage that guild"});

    // Save the Twitter keys
    await collections.twitterAuthInfo.updateOne(
      {guildId: guild_id},
      {$set: {
        access_token: access_token,
        access_secret: access_secret
      }},
      {upsert: true}
    );

    // And we're done!
    res.sendStatus(200);
  
  });

  app.get("/api/get-managable-guilds", async (req, res) => {

    // Make sure we have the access token
    const {token} = req.headers;
    if (!token) return res.status(400).json({error: "No token provided"});

    // Return the authorized guilds
    return res.json(await getAuthorizedGuilds(token));

  });

  app.get("*", (req, res) => res.sendStatus(200));

  app.listen(3000, () => console.log("\x1b[32m%s\x1b[0m", "[Web Server] Listening on port 3000"))

};