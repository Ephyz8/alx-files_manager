/* eslint-disable */
import chai, { expect } from 'chai';
import chaiHttp from 'chai-http';
import server from '../server';
import dbClient from '../utils/db';

chai.use(chaiHttp);
const should = chai.should();

describe('app users', () => {
  beforeEach(function (done) {
    this.timeout(5000);
    setTimeout(function() {
      const usersCollection = dbClient.db.collection('users');
      const filesCollection = dbClient.db.collection('files');
      Promise.all([usersCollection.deleteMany({}), filesCollection.deleteMany({})])
      .then(() => done())
      .catch((err) => done(err));
    }, 4500)
  });

  it('tests POST/user with complete details', (done) => {
    const data = { "email": "bob@dylan.com", "password": "toto1234!" };
    chai.request(server).post('/users').send(data).end((err, res) => {
      should.not.exist(err);
      res.body.should.be.a('object');
      res.body.should.have.property('id');
      res.body.should.have.property('email');
      res.body.should.have.property('email').eql(data.email);
      expect(res.statusCode).to.equal(201);
      dbClient.nbUsers().then((data) => {
        expect(data).to.be.equal(1);
        done();
      })
    });
  })

  it('tests POST/user with no email', (done) => {
    const data = { "password": "toto1234!" };
    chai.request(server).post('/users').send(data).end((err, res) => {
      res.body.should.be.a('object');
      res.body.should.have.property('error');
      res.body.should.have.property('error').eql('Missing email');
      expect(res.statusCode).to.equal(400);
      dbClient.nbUsers().then((data) => {
        expect(data).to.be.equal(0);
        done();
      })
    });
  })

  it('tests POST/user with no password', (done) => {
    const data = { "email": "bob@dylan.com" };
    chai.request(server).post('/users').send(data).end((err, res) => {
      res.body.should.be.a('object');
      res.body.should.have.property('error');
      res.body.should.have.property('error').eql('Missing password');
      expect(res.statusCode).to.equal(400);
      dbClient.nbUsers().then((data) => {
        expect(data).to.be.equal(0);
        done();
      })
    });
  })

  it('tests POST/user with duplicate data', (done) => {
    const data = { "email": "bob@dylan.com", "password": "toto1234!" };
    chai.request(server).post('/users').send(data).end((err, res) => {
      should.not.exist(err);
      res.body.should.be.a('object');
      res.body.should.have.property('id');
      res.body.should.have.property('email');
      res.body.should.have.property('email').eql(data.email);
      expect(res.statusCode).to.equal(201);
      dbClient.nbUsers().then((users) => {
        expect(users).to.be.equal(1);
        chai.request(server).post('/users').send(data).end((err, res) => {
          res.body.should.have.property('error');
          res.body.should.have.property('error').eql('Already exist');
          expect(res.statusCode).to.equal(400);
          dbClient.nbUsers().then((users) => {
            expect(users).to.be.equal(1);
            done();
          })
        })
      })
    });
  });
});
