/* eslint-disable no-underscore-dangle */
/* eslint-disable no-console */

import { ObjectId } from 'mongodb';
import fs from 'fs';
import Queue from 'bull';
import { v4 as uuidv4 } from 'uuid';
import mime from 'mime-types';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class FileController {
  static async postUpload(req, res) {
    const queue = new Queue('fileQueue');
    const token = req.header('X-Token');
    const id = await redisClient.get(`auth_${token}`);
    if (!id) return res.status(401).json({ error: 'Unauthorized' });
    const user = await dbClient.db.collection('users').findOne({ _id: ObjectId(id) });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const {
      name, type, data, parentId, isPublic,
    } = req.body;
    const userId = user._id;
    const acceptedType = ['folder', 'file', 'image'];

    if (!name) return res.status(400).json({ error: 'Missing name' });
    if (!type || !acceptedType.includes(type)) return res.status(400).json({ error: 'Missing type' });
    if (!data && type !== 'folder') return res.status(400).json({ error: 'Missing data' });
    if (parentId) {
      const file = await dbClient.db.collection('files').findOne({ _id: ObjectId(parentId), userId });
      if (!file) return res.status(400).json({ error: 'Parent not found' });
      if (file && file.type !== 'folder') return res.status(400).json({ error: 'Parent is not a folder' });
    }
    const fileData = {
      userId,
      name,
      type,
      isPublic: isPublic || false,
      parentId: parentId ? ObjectId(parentId) : 0,
    };
    if (type === 'folder') {
      const newFile = await dbClient.db.collection('files').insertOne({ ...fileData });
      return res.status(201).json({ id: newFile.insertedId, ...fileData });
    }

    const relativePath = process.env.FOLDER_PATH || '/tmp/files_manager';
    if (!fs.existsSync(relativePath)) {
      fs.mkdirSync((relativePath));
    }
    const identity = uuidv4();
    const localPath = `${relativePath}/${identity}`;
    fs.writeFile(localPath, data, 'base64', (err) => {
      if (err) console.log(err);
    });
    const newFile = await dbClient.db.collection('files').insertOne({
      ...fileData,
      localPath,
    });
    res.status(201).json({ id: newFile.insertedId, ...fileData });
    if (type === 'image') {
      queue.add({ userId, fileId: newFile.insertedId });
    }
    return null; // Ensure consistent return
  }

  static async getShow(req, res) {
    const token = req.header('X-Token');
    const id = await redisClient.get(`auth_${token}`);
    if (!id) return res.status(401).json({ error: 'Unauthorized' });
    const user = await dbClient.db.collection('users').findOne({ _id: ObjectId(id) });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const fileId = req.params.id;
    const file = await dbClient.db.collection('files').findOne(
      {
        _id: ObjectId(fileId),
        userId: user._id,
      },
      {
        projection: {
          id: '$_id', _id: 0, name: 1, type: 1, isPublic: 1, parentId: 1, userId: 1,
        },
      },
    );
    if (file) return res.status(200).json(file);
    return res.status(404).json({ error: 'Not found' });
  }

  static async getIndex(req, res) {
    const token = req.header('X-Token');
    const id = await redisClient.get(`auth_${token}`);
    if (!id) return res.status(401).json({ error: 'Unauthorized' });
    const user = await dbClient.db.collection('users').findOne({ _id: ObjectId(id) });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { parentId } = req.query;
    const page = req.query.page || 0;
    let filter;

    if (parentId) {
      filter = { _id: ObjectId(parentId), userId: user._id };
    } else {
      filter = { userId: user._id };
    }
    const fileCollection = await dbClient.db.collection('files');
    const result = fileCollection.aggregate([
      { $match: filter },
      { $skip: parseInt(page, 10) * 20 }, // Specify radix 10
      { $limit: 20 },
      {
        $project: {
          id: '$_id', _id: 0, userId: 1, name: 1, type: 1, isPublic: 1, parentId: 1,
        },
      },
    ]);
    const resultArray = await result.toArray();
    return res.status(200).json(resultArray);
  }

  static async putPublish(req, res) {
    const token = req.header('X-Token');
    const id = await redisClient.get(`auth_${token}`);
    if (!id) return res.status(401).json({ error: 'Unauthorized' });
    const user = await dbClient.db.collection('users').findOne({ _id: ObjectId(id) });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const fileCollection = await dbClient.db.collection('files');
    const fileId = req.params.id;
    const file = await fileCollection.findOne({ _id: ObjectId(fileId), userId: user._id });

    if (!file) return res.status(404).json({ error: 'Not found' });

    const query = { _id: ObjectId(fileId), userId: user._id };
    const update = { $set: { isPublic: true } };
    const options = { projection: { _id: 0, localPath: 0 } };
    const updatedFile = await fileCollection.findOneAndUpdate(query, update, options);

    return res.status(200).json({ id: file._id, ...updatedFile.value });
  }

  static async putUnpublish(req, res) {
    const token = req.header('X-Token');
    const id = await redisClient.get(`auth_${token}`);
    if (!id) return res.status(401).json({ error: 'Unauthorized' });
    const user = await dbClient.db.collection('users').findOne({ _id: ObjectId(id) });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const fileCollection = await dbClient.db.collection('files');
    const fileId = req.params.id;
    const file = await fileCollection.findOne({ _id: ObjectId(fileId), userId: user._id });
    if (!file) return res.status(404).json({ error: 'Not found' });

    const query = { _id: ObjectId(fileId), userId: user._id };
    const update = { $set: { isPublic: false } };
    const options = { projection: { _id: 0, localPath: 0 } };
    const updatedFile = await fileCollection.findOneAndUpdate(query, update, options);

    return res.status(200).json({ id: file._id, ...updatedFile.value });
  }

  static async getFile(req, res) {
    const fileId = req.params.id;
    const fileCollection = dbClient.db.collection('files');
    const file = await fileCollection.findOne({ _id: ObjectId(fileId) });

    if (!file) return res.status(404).json({ error: 'Not found' });

    const { isPublic, localPath, name } = file;

    if (isPublic) {
      res.setHeader('Content-Type', mime.lookup(name));
      const fileContent = fs.readFileSync(localPath);
      return res.send(fileContent);
    }

    const token = req.header('X-Token');
    const id = await redisClient.get(`auth_${token}`);
    if (!id) return res.status(404).json({ error: 'Not found' });

    const user = await dbClient.db.collection('users').findOne({ _id: ObjectId(id) });

    if (!user) return res.status(404).json({ error: 'Not found' });
    if (user._id.toString() !== file.userId.toString()) return res.status(404).json({ error: 'Not found' });

    res.setHeader('Content-Type', mime.lookup(file.name));
    const fileContent = fs.readFileSync(localPath);
    return res.send(fileContent);
  }
}

export default FileController;
