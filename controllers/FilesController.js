import redisClient from '../utils/redis';
import dbClient from '../utils/db';
import { ObjectId } from 'mongodb';
import fs from 'fs';
import Queue from 'bull';
import { v4 as uuidv4 } from 'uuid';
import mime from 'mime-types';

class FileController {
  static async postUpload(req, res) {
    // Gets the user based on the token
    const queue = new Queue('fileQueue');
    const token = req.header('X-Token');
    const id = await redisClient.get(`auth_${token}`);
    if (!id) res.status(401).json({ error: 'Unauthorized' })
    const user = await dbClient.db.collection('users').findOne({ _id: ObjectId(id) });
    if (!user) res.status(401).json({ error: 'Unauthorized' });

    const { name, type, data, parentId, isPublic } = req.body
    const userId = user._id;
    const acceptedType = ['folder', 'file', 'image'];

    if (!name) res.status(400).json({ error: 'Missing name' });
    if (!type || !acceptedType.includes(type)) res.status(400).json({ error: 'Missing type' });
    if (!data && type != 'folder') res.status(400).json({ error: 'Missing data' });
    if (parentId) {
      const file = await dbClient.db.collection('files').findOne({
         _id: ObjectId(parentId), userId }
        );
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
      res.status(201).json({ id: newFile.insertedId, ...fileData });
      return;
    }

    const relativePath = process.env.FOLDER_PATH || '/tmp/files_manager';
    if (!fs.existsSync(relativePath)) {
      fs.mkdirSync((relativePath));
    }
    const identity = uuidv4()
    const localPath = `${relativePath}/${identity}`;
    fs.writeFile(localPath, data, 'base64', (err) => {
      if (err) console.log(err);
    });
    const newFile = await dbClient.db.collection('files').insertOne({
      ...fileData,
      localPath: localPath,
    });
    res.status(201).json({ id: newFile.insertedId, ...fileData });
    if (type === 'image') {
      queue.add({ userId, fileId: newFile.insertedId });
    }
  }

  static async getShow(req, res) {
    const token = req.header('X-Token');
    const id = await redisClient.get(`auth_${token}`);
    if (!id) return res.status(401).json({ error: 'Unauthorized' })
    const user = await dbClient.db.collection('users').findOne({ _id: ObjectId(id) });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const fileId = req.params.id;
    const file = await dbClient.db.collection('files').findOne({
      _id: ObjectId(fileId),
      userId: user._id },
      { 
        projection: {
          id: '$_id', _id: 0, name: 1, type: 1, isPublic: 1, parentId: 1, userId: 1,
        },
      });
    if (file) return res.status(200).json(file);
    else return res.status(404).json({ error: 'Not found' });
  }

  static async getIndex(req, res) {
    const token = req.header('X-Token');
    const id = await redisClient.get(`auth_${token}`);
    if (!id) res.status(401).json({ error: 'Unauthorized' })
    const user = await dbClient.db.collection('users').findOne({ _id: ObjectId(id) });
    if (!user) res.status(401).json({ error: 'Unauthorized' });

    const { parentId } = req.query;
    const page = req.query.page || 0;
    let filter;

    if (parentId) {
      filter = { _id: ObjectId(parentId), userId: user._id };
    } else {
      filter = { userId: user._id };
    }
    const fileCollection = await dbClient.db.collection('files');
    // Pagination with mongodb aggregrate
    const result = fileCollection.aggregate([
      { $match: filter },
      { $skip: parseInt(page) * 20 }, // starts to fetch from page(default=0) by amount per-page
      { $limit: 20 },
      {
        // specifies parts to display and hide, 0=exclude, 1=include
        $project: {
          id: '$_id', _id: 0, userId: 1, name: 1, type: 1, isPublic: 1, parentId: 1
        },
      },
    ]);
    const resultArray = await result.toArray();
    res.status(200).json(resultArray);
    return;
  }

  static async putPublish(req, res) {
    const token = req.header('X-Token');
    const id = await redisClient.get(`auth_${token}`);
    if (!id) res.status(401).json({ error: 'Unauthorized' })
    const user = await dbClient.db.collection('users').findOne({ _id: ObjectId(id) });
    if (!user) res.status(401).json({ error: 'Unauthorized' });

    const fileCollection = await dbClient.db.collection('files');
    const fileId = req.params.id;
    const file = await fileCollection.findOne({ _id: ObjectId(fileId), userId: user._id });

    if (!file) return res.status(404).json({ error: 'Not found' });

    const query = { _id: ObjectId(fileId), userId: user._id };
    const update = { $set: { isPublic: true } };
    const options = { projection: { _id: 0, localPath: 0 } };
    const updatedFile = await fileCollection.findOneAndUpdate(query, update, options);

    /**  The value property is a sub-property of the UpdateResult object
    and it represents the updated document. if it exists. If the document was not updated
    (e.g., because it did not meet the update criteria), value will be null.
    */
    return res.status(200).json({ id: file._id, ...updatedFile.value });
  }

  static async putUnpublish(req, res) {
    const token = req.header('X-Token');
    const id = await redisClient.get(`auth_${token}`);
    if (!id) res.status(401).json({ error: 'Unauthorized' })
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
    const file = await fileCollection.findOne({ _id: ObjectId(fileId) })

    if (!file) return res.status(404).json({ error: 'Not found' });

    const token = req.header('X-Token');
    const id = await redisClient.get(`auth_${token}`);
    const user = await dbClient.db.collection('users').findOne({ _id: ObjectId(id) });
    if ((!id || !user || file.userId.toString() !== id) && !file.isPublic) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    if (file.type === 'folder') {
      res.status(400).json({ error: `A folder doesn't have a content` });
      return;
    }

    const { size } = req.query;
    let fileLocalPath = file.localPath;
    if (size) {
      fileLocalPath = `${file.localPath}_${size}`;
    }

    if (!fs.existsSync(fileLocalPath)) return res.status(404).json({ error: 'Not found' });

    const data = await fs.promises.readFile(fileLocalPath);
    const headerContentType = mime.contentType(file.name);
    res.header('Content-Type', headerContentType).status(200).send(data);
  }
}

export default FileController;
