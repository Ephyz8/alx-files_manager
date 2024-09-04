import sha1 from 'sha1';
import { ObjectId } from 'mongodb';
import Queue from 'bull';
import dbClient from '../utils/db';
import { redisClient } from '../utils/redis';

class UsersController {
  // eslint-disable-next-line consistent-return
  static async postNew(req, res) {
    const queue = new Queue('userQueue');
    const { email, password } = req.body;
    // Check if email is provided
    if (!email) return res.status(400).json({ error: 'Missing email' });
    // Check if password is provided
    if (!password) return res.status(400).json({ error: 'Missing password' });

    const users = await dbClient.db.collection('users');
    users.findOne({ email }, async (err, result) => {
      if (result) {
        return res.status(400).json({ error: 'Already exist' });
      }
      const hashedPassword = sha1(password);
      const { insertedId } = await users.insertOne({ email, password: hashedPassword });
      const user = { id: insertedId, email };
      queue.add({ userId: insertedId });
      return res.status(201).json(user);
    });
  }

  static async getMe(req, res) {
    const token = req.header('X-Token');
    const id = await redisClient.get(`auth_${token}`);
    if (id) {
      const user = await dbClient.db.collection('users').findOne({ n_id: ObjectId(id) });
      if (user) {
        return res.status(200).json({ id: user.n_id, email: user.email });
      }
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

export default UsersController;
