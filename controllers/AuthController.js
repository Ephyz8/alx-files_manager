import { v4 as uuidv4 } from 'uuid';
import sha1 from 'sha1';
import { ObjectId } from 'mongodb';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

class AuthController {
  static async getConnect(req, res) {
    try {
      const authHeader = req.header('Authorization');
      // Check if the Authorization header starts with 'Basic '
      if (authHeader && authHeader.startsWith('Basic ')) {
        const token = authHeader.slice(6);
        const decodedCredentials = Buffer.from(token, 'base64').toString('utf-8');
        const userInfo = decodedCredentials.split(':');

        if (userInfo.length !== 2) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const [email, password] = userInfo;
        // Query the database for user with the provided email and password
        const user = await dbClient.db.collection('users').findOne({ email, password: sha1(password) });

        if (!user) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const authToken = uuidv4();
        const authKey = `auth_${authToken}`;
        // Set the key in Redis with an expiration time of 24 hours
        await redisClient.set(authKey, user.n_id.toString(), 24 * 60 * 60);

        return res.status(200).json({ message: 'Authenticated successfully', token: authToken });
      }

      // Handle case where Authorization header is missing or does not start with 'Basic '
      return res.status(401).json({ error: 'Unauthorized' });
    } catch (error) {
      // Handle unexpected errors
      console.error('Error in authentication:', error.message || error.toString());
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async getDisconnect(req, res) {
    try {
      const token = req.header('X-Token');
      if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const authKey = `auth_${token}`;
      const id = await redisClient.get(authKey);

      if (id) {
        const user = await dbClient.db.collection('users').findOne({ n_id: ObjectId(id) });

        if (user) {
          await redisClient.del(authKey);
          return res.status(204).send();
        }
        return res.status(401).json({ error: 'Unauthorized' });
      }

      return res.status(401).json({ error: 'Unauthorized' });
    } catch (error) {
      // Handle unexpected errors
      console.error('Error in disconnect:', error.message || error.toString());
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

export default AuthController;
