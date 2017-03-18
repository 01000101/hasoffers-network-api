var assert = require('assert');
// HTTP mock library
var nock = require('nock');
// File reading support
var fs = require("fs");
// HasOffers API library
var HasOffers = new require('../');

// Get a handle to the HasOffers API
var hasoffers = new HasOffers('mock-id', 'mock-token');


describe('Report', function() {
  describe('#getStats()', function() {
    it('should return 3 stats', function(done) {
      var resp = JSON.parse(fs.readFileSync(__dirname + '/responses/report/getstats.good.json'));
      nock('https://api.hasoffers.com/Apiv3/json')
        .get('').query(true).reply(200, resp);
      hasoffers.report.getStats({}, function(data, err) {
        if( !err ) {
          assert(data);
          assert.equal(3, data.length);
          assert(data[0].hasOwnProperty('Stat'));
          assert(data[0].Stat.hasOwnProperty('clicks'));
          assert(parseInt(data[0].Stat.clicks) >= 0);
        }
        done(err);
      });
    });
  });
});
