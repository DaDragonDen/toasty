const {TwitterApi} = require("twitter-api-v2");
const express = require("express");
const path = require("path");
const fetch = require("node-fetch");

const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

module.exports = collections => {

  app.get("/login", async (req, res) => {

    switch (req.query.reason) {

      case "twitter": {

        // Generate auth link
        const twitterClient = new TwitterApi({
          appKey: process.env.twitterAPIKey,
          appSecret: process.env.twitterAPIKeySecret
        });
        const authLink = await twitterClient.generateAuthLink("http://127.0.0.1:3000/auth/twitter", {linkMode: "authorize"});

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
    const {oauth_token_secret} = req.session;
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
      res.json({accessToken: accessToken, accessSecret: accessSecret});

    });

  });

  app.get("*", (req, res) => res.sendStatus(200));

  app.listen(3000, () => console.log("\x1b[32m%s\x1b[0m", "[Web Server] Listening on port 3000"))

};