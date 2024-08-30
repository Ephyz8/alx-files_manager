/* eslint-disable */
import chai, { expect } from 'chai';
import chaiHttp from 'chai-http';
import server from '../server';
import dbClient from '../utils/db';

chai.use(chaiHttp);
const should = chai.should();

describe('tests user authentication', () => {
  const user = { "email": "bob@dylan.com", "password": "toto1234!" };
  let encoded_data = Buffer.from(`${user.email}:${user.password}`).toString('base64');
  let userId;
  let token;

  before(function(done) {
      this.timeout(5000);
      setTimeout(function() {
        const usersCollection = dbClient.db.collection('users');
        const filesCollection = dbClient.db.collection('files');
        Promise.all([usersCollection.deleteMany({}), filesCollection.deleteMany({})])
        .then(() => {
          chai.request(server).post('/users').send(user).end((err, res) => {
            userId = res.body.id;
            done();
          });
        })
        .catch((err) => done(err));
      }, 4500)
  });

  it('test GET /connect', (done) => {
   chai.request(server).get('/connect').set('Authorization', `Basic ${encoded_data}`).end((err, res) => {
    should.not.exist(err);
    res.body.should.have.property('token');
    token = res.body.token;
    expect(res.statusCode).to.equal(200);
    done();
   });
  });

  it('test GET /connect with wrong authorization', (done) => {
    chai.request(server).get('/connect').set('Authorization', `Basic encoding`).end((err, res) => {
      expect(res.statusCode).to.equal(401);
      res.body.should.have.property('error').equal('Unauthorized');
      done();
    });
  });

  it('test GET /users/me', (done) => {
    chai.request(server).get('/users/me').set('X-Token', `${token}`).end((err, res) => {
      should.not.exist(err);
      res.body.should.have.property('id');
      res.body.should.have.property('email');
      res.body.should.have.property('email').eql(user.email);
      res.body.should.have.property('id').eql(userId);
      expect(res.statusCode).to.equal(200);
      done();
    })
  })

  it('test GET /disconnect with wrong token', (done) => {
    chai.request(server).get('/disconnect').set('X-Token', `token`).end((err, res) => {
      expect(res.statusCode).to.equal(401);
      res.body.should.have.property('error').equal('Unauthorized');
      done();
    });
  });

  it('test GET /disconnect', (done) => {
    chai.request(server).get('/disconnect').set('X-Token', `${token}`).end((err, res) => {
     should.not.exist(err);
     expect(res.statusCode).to.equal(204);
     done();
    });
  });

});
