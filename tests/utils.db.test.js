/* eslint-disable */

import { expect } from 'chai';
import dbClient from '../utils/db';


describe('mongodb app storage', () => {
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

  it('tests the db isAlive method', function() {
    expect(dbClient.isAlive()).to.be.true;
  });
  it('tests the the db nbUsers method', (done) => {
    dbClient.nbUsers().then((data) => {
      expect(data).to.be.equal(0);
      done();
    });
  });
  it('tests the the db nbFiles method', (done) => {
    dbClient.nbFiles().then((data) => {
      expect(data).to.be.equal(0);
      done();
    });
  });
});
