/* eslint-disable no-underscore-dangle */
/* eslint-disable no-console */

const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const mime = require('mime-types');
const Queue = require('bull').Queue;
const { ObjectId } = require('mongodb');
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

class FileController {
  static async postUpload(req, res) {
    try {
      const queue = new Queue('fileQueue');
      const token = req.header('X-Token');
      const id = await redisClient.get(`auth_${token}`);
      if (!id) return res.status(401).json({ error: 'Unauthorized' });

      const user = await dbClient.db.collection('users').findOne({ _id: ObjectId(id) });
      if (!user) return res.status(401).json({ error: 'Unauthorized' });

      const { name, type, data, parentId, isPublic } = req.body;
      const userId = user._id;
      const acceptedTypes = ['folder', 'file', 'image'];

      if (!name) return res.status(400).json({ error: 'Missing name' });
      if (!type || !acceptedTypes.includes(type)) return res.status(400).json({ error: 'Invalid type' });
      if (!data && type !== 'folder') return res.status(400).json({ error: 'Missing data' });

      if (parentId) {
        const parentFile = await dbClient.db.collection('files').findOne({ _id: ObjectId(parentId), userId });
        if (!parentFile) return res.status(400).json({ error: 'Parent not found' });
        if (parentFile.type !== 'folder') return res.status(400).json({ error: 'Parent is not a folder' });
      }

      const fileData = {
        userId,
        name,
        type,
        isPublic: isPublic || false,
        parentId: parentId ? ObjectId(parentId) : 0,
      };

      if (type === 'folder') {
        const newFile = await dbClient.db.collection('files').insertOne(fileData);
        return res.status(201).json({ id: newFile.insertedId, ...fileData });
      }

      const relativePath = process.env.FOLDER_PATH || '/tmp/files_manager';
      if (!fs.existsSync(relativePath)) {
        fs.mkdirSync(relativePath);
      }

      const identity = uuidv4();
      const localPath = `${relativePath}/${identity}`;

      await fs.promises.writeFile(localPath, data, 'base64');

      const newFile = await dbClient.db.collection('files').insertOne({
        ...fileData,
        localPath,
      });

      res.status(201).json({ id: newFile.insertedId, ...fileData });

      if (type === 'image') {
        queue.add({ userId, fileId: newFile.insertedId });
      }
    } catch (error) {
      console.error('Error in postUpload:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async getShow(req, res) {
    try {
      const token = req.header('X-Token');
      const id = await redisClient.get(`auth_${token}`);
      if (!id) return res.status(401).json({ error: 'Unauthorized' });

      const user = await dbClient.db.collection('users').findOne({ _id: ObjectId(id) });
      if (!user) return res.status(401).json({ error: 'Unauthorized' });

      const fileId = req.params.id;
      if (!ObjectId.isValid(fileId)) return res.status(404).json({ error: 'Not found' });

      const file = await dbClient.db.collection('files').findOne({ _id: ObjectId(fileId), userId: user._id });
      if (!file) return res.status(404).json({ error: 'Not found' });

      res.json(file);
    } catch (error) {
      console.error('Error in getShow:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async getIndex(req, res) {
    try {
      const token = req.header('X-Token');
      const id = await redisClient.get(`auth_${token}`);
      if (!id) return res.status(401).json({ error: 'Unauthorized' });

      const user = await dbClient.db.collection('users').findOne({ _id: ObjectId(id) });
      if (!user) return res.status(401).json({ error: 'Unauthorized' });

      const parentId = req.query.parentId || 0;
      const page = req.query.page || 0;
      const pageSize = 20;

      const query = {
        userId: user._id,
        parentId: parentId === '0' ? 0 : ObjectId(parentId),
      };

      const files = await dbClient.db.collection('files')
        .find(query)
        .skip(page * pageSize)
        .limit(pageSize)
        .toArray();

      res.json(files);
    } catch (error) {
      console.error('Error in getIndex:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async putPublish(req, res) {
    try {
      const token = req.header('X-Token');
      const id = await redisClient.get(`auth_${token}`);
      if (!id) return res.status(401).json({ error: 'Unauthorized' });

      const user = await dbClient.db.collection('users').findOne({ _id: ObjectId(id) });
      if (!user) return res.status(401).json({ error: 'Unauthorized' });

      const fileId = req.params.id;
      if (!ObjectId.isValid(fileId)) return res.status(404).json({ error: 'Not found' });

      const file = await dbClient.db.collection('files').findOne({ _id: ObjectId(fileId), userId: user._id });
      if (!file) return res.status(404).json({ error: 'Not found' });

      await dbClient.db.collection('files').updateOne({ _id: ObjectId(fileId) }, { $set: { isPublic: true } });

      res.json({ ...file, isPublic: true });
    } catch (error) {
      console.error('Error in putPublish:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async putUnpublish(req, res) {
    try {
      const token = req.header('X-Token');
      const id = await redisClient.get(`auth_${token}`);
      if (!id) return res.status(401).json({ error: 'Unauthorized' });

      const user = await dbClient.db.collection('users').findOne({ _id: ObjectId(id) });
      if (!user) return res.status(401).json({ error: 'Unauthorized' });

      const fileId = req.params.id;
      if (!ObjectId.isValid(fileId)) return res.status(404).json({ error: 'Not found' });

      const file = await dbClient.db.collection('files').findOne({ _id: ObjectId(fileId), userId: user._id });
      if (!file) return res.status(404).json({ error: 'Not found' });

      await dbClient.db.collection('files').updateOne({ _id: ObjectId(fileId) }, { $set: { isPublic: false } });

      res.json({ ...file, isPublic: false });
    } catch (error) {
      console.error('Error in putUnpublish:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  static async getFile(req, res) {
    try {
      const token = req.header('X-Token');
      const id = await redisClient.get(`auth_${token}`);
      const userId = id ? ObjectId(id) : null;

      const fileId = req.params.id;
      if (!ObjectId.isValid(fileId)) return res.status(404).json({ error: 'Not found' });

      const file = await dbClient.db.collection('files').findOne({ _id: ObjectId(fileId) });
      if (!file) return res.status(404).json({ error: 'Not found' });

      if (!file.isPublic && (!userId || file.userId.toString() !== userId.toString())) {
        return res.status(404).json({ error: 'Not found' });
      }

      if (file.type === 'folder') {
        return res.status(400).json({ error: 'A folder doesn\'t have content' });
      }

      if (!fs.existsSync(file.localPath)) {
        return res.status(404).json({ error: 'Not found' });
      }

      const mimeType = mime.lookup(file.name);
      res.setHeader('Content-Type', mimeType);
      const fileStream = fs.createReadStream(file.localPath);
      fileStream.pipe(res);
    } catch (error) {
      console.error('Error in getFile:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}

module.exports = FileController;
