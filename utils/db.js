import { MongoClient } from 'mongodb';
// import { MongoClient } from 'mongodb/lib/mongo_client';

class DBClient {
  // A class with basic connection to a mongodb server
  constructor() {
    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT || 27017;
    const database = process.env.DB_DATABASE || 'files_manager';

    const url = `mongodb://${host}:${port}/${database}`;
    const client = new MongoClient(url, { useNewUrlParser: true, useUnifiedTopology: true });
    this.client = client;
    this.client.connect();
    this.db = client.db(database);
  }

  // Check if the mongoddb is alive
  isAlive() {
    return this.client.topology.isConnected();
  }

  async nbUsers() {
    try {
      const users = await this.db.collection('users').countDocuments();
      return users;
    } catch (err) {
      throw new Error(`Unable to get number of users ${err.message}`);
    }
  }

  async nbFiles() {
    try {
      const files = await this.db.collection('files').countDocuments();
      return files;
    } catch (err) {
      throw new Error(`Unable to get number of files ${err.message}`);
    }
  }
}

const dbClient = new DBClient();
export default dbClient;
