module.exports = (async () => {
  
  // Create client
  const MongoDB = require("mongodb");
  const MDBC = new MongoDB.MongoClient(
    process.env.mongoDomain, 
    { useNewUrlParser: true, useUnifiedTopology: true }
  );
  await MDBC.connect();

  // Create cache
  const NCache = require("node-cache");
  const cache = new NCache();
  return {
    mongoClient: MDBC,
    cache: cache
  };

})();
