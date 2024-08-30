import Queue from 'bull';
import dbClient from './utils/db';
import imageThumbnail from 'image-thumbnail';
import { ObjectId } from 'mongodb';
import fs from 'fs';

const queue = new Queue('fileQueue');
const userQueue = new Queue('userQueue');

queue.process( async (job, done) => {
  const { userId, fileId } = job.data
  if (!fileId) done(new Error('Missing fileId'));
  if (!userId) done(new Error('Missing userId'));

  const file = await dbClient.db.collection('files').findOne({
    _id: ObjectId(fileId),
    userId: ObjectId(userId),
  });
  
  if (!file) done(new Error('File not found'));
  // Creating thumbnails of different sizes
  const thumbnail500 = await imageThumbnail(file.localPath, { width: 500 } );
  const thumbnail250 = await imageThumbnail(file.localPath, { width: 250 } );
  const thumbnail100 = await imageThumbnail(file.localPath, { width: 100 } );

  console.log('Saved thumbnails to filepath')
  await fs.promises.writeFile(`${file.localPath}_500`, thumbnail500);
  await fs.promises.writeFile(`${file.localPath}_250`, thumbnail250);
  await fs.promises.writeFile(`${file.localPath}_100`, thumbnail100);
  done();
});

userQueue.process(async (job, done) => {
  const { userId } = job.data;
  if (!userId) done(new Error('Missing userId'));
  const user = await dbClient.db.collection('users').findOne({ _id: ObjectId(userId) });
  if (!user) done(new Error('User not found'));
  console.log(`Welcome ${user.email}`);
  done();
});
