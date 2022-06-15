import MongoDB from "mongodb";

export default async () => {

  const MDBC = new MongoDB.MongoClient(
    process.env.mongoDomain, 
    { useNewUrlParser: true, useUnifiedTopology: true }
  );
  
  await MDBC.connect();

  return MDBC;

};
