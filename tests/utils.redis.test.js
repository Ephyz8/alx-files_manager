/* eslint-disable */
import { expect } from 'chai';
import redisClient from '../utils/redis';

describe('redis app storage', () => {
  it('tests the redis isAlive method', () => {
    expect(redisClient.isAlive()).to.be.true;
  });

  it('tests the redis get and set method', function (done) {
    redisClient.set('myKey', 12, 5).then(() => {
      redisClient.get('myKey').then((data) => {
        expect(data).to.equal('12');
      });
      done();
    });
  });
  it('tests for the redis client set expiration', function(done) {
    this.timeout(3000);
    redisClient.set('key', 10, 2).then(() => {
      setTimeout(function() {
        redisClient.get('key').then(function(data) {
          expect(data).to.equal(null);
          done();
        });
      }, 2500);
    });
  });
});
