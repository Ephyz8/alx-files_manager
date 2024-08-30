import dbClient from '../utils/db';
import redisClient from '../utils/redis';
import { v4 as uuidv4 } from 'uuid';
import sha1 from 'sha1';
import { ObjectId }from 'mongodb';

class AuthController {
  static async getConnect(req, res) {
    const authHeader = req.header('Authorization');
    if (authHeader && authHeader.startsWith('Basic ')) {
        const token = authHeader.slice(6);
        const decodedCredentials = Buffer.from(token, 'base64').toString('utf-8');
        const userInfo = decodedCredentials.split(':');
        if (!userInfo || userInfo.length !== 2) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const [ email, password ] = userInfo;
        const user = await dbClient.db.collection('users').findOne({ email: email, password: sha1(password) });
        if (!user) return res.status(401).json({ error: 'Unauthorized' });
        else {
          const authToken = uuidv4();
          const authKey = `auth_${authToken}`;
          // set the key to expire in 24hrs
          await redisClient.set(authKey, user._id.toString(), 24 * 60 * 60);
          return res.status(200).json({ token: authToken });
        }
    }
  }

  static async getDisconnect(req, res) {
    const token = req.header('X-Token');
    const id = await redisClient.get(`auth_${token}`);
    if (id) {
      const user = await dbClient.db.collection('users').findOne({ _id: ObjectId(id) });
      if (user) {
        await redisClient.del(`auth_${token}`);
        return res.status(204).send();
      } else {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    } else {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }
}

export default AuthController;
