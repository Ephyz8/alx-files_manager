/* eslint-disable */
import chai, { expect } from 'chai';
import chaiHttp from 'chai-http';
import server from '../server';
import dbClient from '../utils/db';

chai.use(chaiHttp);
const should = chai.should();

describe('tests user authentication', () => {
  const user = { "email": "bob@dylan.com", "password": "toto1234!" };
  const file = { "name": "myText.txt", "type": "file", "data": "SGVsbG8gV2Vic3RhY2shCg==" };
  const folder = { "name": "documents", "type": "folder" };
  let encoded_data = Buffer.from(`${user.email}:${user.password}`).toString('base64');
  let userId;
  let token;
  let fileId;
  let folderId;

  before(function (done) {
    this.timeout(5000);
    setTimeout(function() {
      const usersCollection = dbClient.db.collection('users');
      const filesCollection = dbClient.db.collection('files');
      Promise.all([usersCollection.deleteMany({}), filesCollection.deleteMany({})])
      .then(() => {
        chai.request(server).post('/users').send(user).end((err, res) => {
          userId = res.body.id;
          chai.request(server).get('/connect')
          .set('Authorization', `Basic ${encoded_data}`)
          .end((err, res) => {
            token = res.body.token;
            done();
          });
        });
      })
      .catch((err) => done(err));
    }, 4500)
  });

  it('tests POST /files - add folder', function(done) {
    chai.request(server).post('/files').set('X-Token', `${token}`)
    .send(folder)
    .end((err, res) => {
      should.not.exist(err);
      res.body.should.be.a('object');
      res.body.should.have.property('name').equal(folder.name);
      res.body.should.have.property('type').equal(folder.type);
      res.body.should.have.property('userId').equal(userId);
      res.body.should.have.property('isPublic').equal(false);
      res.body.should.have.property('parentId').equal(0);
      expect(res.statusCode).to.equal(201);
      folderId = res.body.id;
      done();
    });
  });

  it('tests POST /files - add file', function(done) {
    chai.request(server).post('/files').set('X-Token', `${token}`)
    .send({...file, parentId: folderId})
    .end((err, res) => {
      should.not.exist(err);
      res.body.should.be.a('object');
      res.body.should.have.property('name').equal(file.name);
      res.body.should.have.property('type').equal(file.type);
      res.body.should.have.property('userId').equal(userId);
      res.body.should.have.property('isPublic').equal(false);
      res.body.should.have.property('parentId').equal(folderId);
      expect(res.statusCode).to.equal(201);
      fileId = res.body.id;
      done();
    });
  });

  it('tests GET /files/:id', function(done) {
    chai.request(server).get(`/files/${fileId}`).set('X-Token', `${token}`)
    .end((err, res) => {
      should.not.exist(err);
      res.body.should.be.a('object');
      res.body.should.have.property('name').equal(file.name);
      res.body.should.have.property('type').equal(file.type);
      res.body.should.have.property('userId').equal(userId);
      res.body.should.have.property('isPublic').equal(false);
      res.body.should.have.property('parentId').equal(folderId);
      expect(res.statusCode).to.equal(200);
      done();
    });
  });

  it('tests GET /files without page query', function(done) {
    chai.request(server).get('/files').set('X-Token', `${token}`)
    .end((err, res) => {
      should.not.exist(err);
      res.body.should.be.a('array');
      expect(res.body.length).to.equal(2);
      expect(res.statusCode).to.equal(200);
      done();
    });
  });

  it('tests GET /files with page query - page 0', function(done) {
    chai.request(server).get('/files?page=0').set('X-Token', `${token}`)
    .end((err, res) => {
      should.not.exist(err);
      res.body.should.be.a('array');
      expect(res.body.length).to.equal(2);
      expect(res.body.length).to.be.at.most(20);
      expect(res.statusCode).to.equal(200);
      done();
    });
  });

  it('tests GET /files with page query - page 1', function(done) {
    chai.request(server).get('/files?page=1').set('X-Token', `${token}`)
    .end((err, res) => {
      should.not.exist(err);
      res.body.should.be.a('array');
      expect(res.body.length).to.equal(0);
      expect(res.body).to.be.an('array').that.is.empty;
      expect(res.body.length).to.be.at.most(20);
      expect(res.statusCode).to.equal(200);
      done();
    });
  });

  it('tests PUT /files/:id/publish', function(done) {
    chai.request(server).put(`/files/${fileId}/publish`).set('X-Token', `${token}`)
    .end((err, res) => {
      should.not.exist(err);
      res.body.should.be.a('object');
      res.body.should.have.property('name').equal(file.name);
      res.body.should.have.property('type').equal(file.type);
      res.body.should.have.property('userId').equal(userId);
      res.body.should.have.property('isPublic').equal(true);
      expect(res.statusCode).to.equal(200);
      done();
    });
  });

  it('tests GET /files/:id/data without a token when file is public', function(done) {
    chai.request(server).get(`/files/${fileId}/data`)
    .end((err, res) => {
      should.not.exist(err);
      const expectedData =  Buffer.from(file.data, 'base64').toString('ascii');
      expect(res.text).to.equal(expectedData);
      expect(res.statusCode).to.equal(200);
      done();
    });
  });

  it('tests PUT /files/:id/unpublish', function(done) {
    chai.request(server).put(`/files/${fileId}/unpublish`).set('X-Token', `${token}`)
    .end((err, res) => {
      should.not.exist(err);
      res.body.should.be.a('object');
      res.body.should.have.property('name').equal(file.name);
      res.body.should.have.property('type').equal(file.type);
      res.body.should.have.property('userId').equal(userId);
      res.body.should.have.property('isPublic').equal(false);
      expect(res.statusCode).to.equal(200);
      done();
    });
  });

  it('tests GET /files/:id/data', function(done) {
    chai.request(server).get(`/files/${fileId}/data`).set('X-Token', `${token}`)
    .end((err, res) => {
      should.not.exist(err);
      const expectedData =  Buffer.from(file.data, 'base64').toString('ascii');
      expect(res.text).to.equal(expectedData);
      expect(res.statusCode).to.equal(200);
      done();
    });
  });
});
