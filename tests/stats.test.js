/* eslint-disable */
import chai, { expect } from 'chai';
import chaiHttp from 'chai-http';
import server from '../server';
import dbClient from '../utils/db';

chai.use(chaiHttp);
const should = chai.should();

describe('app status', () => {
  before(function (done) {
    this.timeout(5000);
    setTimeout(function() {
      const usersCollection = dbClient.db.collection('users');
      const filesCollection = dbClient.db.collection('files');
      Promise.all([usersCollection.deleteMany({}), filesCollection.deleteMany({})])
      .then(() => done())
      .catch((err) => done(err));
    }, 4500)
  });

  it('tests GET/status', (done) => {
    chai.request(server).get('/status').end((err, res) => {
      should.not.exist(err);
      res.body.should.be.a('object');
      res.body.should.have.property('db');
      res.body.should.have.property('redis');
      expect(res.statusCode).to.equal(200);
      expect(res.body).to.deep.equal({ db: true, redis: true });
      done();
    });
  });

  it('tests GET/stats', (done) => {
    chai.request(server).get('/stats').end((err, res) => {
      should.not.exist(err);
      res.body.should.be.a('object');
      res.body.should.have.property('users');
      res.body.should.have.property('files');
      expect(res.statusCode).to.equal(200);
      expect(res.body).to.deep.equal({ users: 0, files: 0 });
      done();
    });
  });
});
