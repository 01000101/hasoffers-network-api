// Object merge helper
var objectMerge  = require('object-merge');
// REST client
var http = require('unirest');
// Constants
var API_ENDPOINT = 'https://api.hasoffers.com/Apiv3/json';

  /**
   * Has Offers API constructor
   *
   * @constructor
   * @param {String} networkToken - API network token.
   * @param {String} networkId - API network ID
   * @param {Object} options - Various options to configure how to
   *  interact with the API. Currently configurable keys are:
   *    "apiEndpoint" - API HTTP endpoint to use.
   *    "paging.limit" - Maximum number of results per returned page.
   *    "paging.delay" - Delay (in ms) between page requests.
   */
module.exports = function(networkToken, networkId, options) {
  options = options || {};
  this.networkToken = networkToken;
  this.networkId = networkId;
  this.apiEndpoint = options.apiEndpoint || API_ENDPOINT;
  this.paging = {
    limit: options.pagingLimit || 1000,
    delay: options.pagingDelay || 750
  };

  /**
   * Makes an API request.
   *
   * @access public
   * @param {String} target - Has Offers API call target (controller).
   * @param {String} method - Has Offers API call method (routine).
   * @param {Object} query - API query parameters.
   * @param {Function} callback - Request callback.
   */
  this.request = function(target, method, query, callback) {
    // Inject API credentials
    query.NetworkId = this.networkId;
    query.NetworkToken = this.networkToken;
    // Set up target
    query.Target = target;
    query.Method = method;
    query.Version = 2;
    // Make an API request
    http.get(this.apiEndpoint)
      .headers({'Accept': 'application/json'})
      .query(this._serialize(query))
      .end(function(response) {
        var data = null;
        if( response && !response.error &&
            response.hasOwnProperty('body') &&
            response.body.hasOwnProperty('response') &&
            response.body.response.hasOwnProperty('data') ) {
          data = response.body.response.data;
        }
        callback(data, response.error);
      });
  };

  /**
   * Makes an API request and handles results paging. Due to the way
   * Has Offers does API request limiting, it's advisable to use
   * an API delay here between page fetches (or set the limit veryhigh).
   *
   * @access public
   * @param {String} target - Has Offers API call target (controller).
   * @param {String} method - Has Offers API call method (routine).
   * @param {Object} query - API query parameters.
   * @param {Function} callback - Request callback.
   */
  this.paged_request = function(target, method, query, callback) {
    var self = this;
    var paged_data = null, paged_error = null;
    // Set the total return limit for all paged requests
    query.limit = this.paging.limit;
    // Begin iterating through pages
    this._async_loop(100, function(loop) {
      // Pages start at 1
      query.page = loop.iteration() + 1;
      // Make an API request
      self.request(target, method, query, function(data, err) {
        // Handle bad response / error
        if( !data || err ) {
          paged_error = err;
          return loop.break();
        }
        // Merge current page of data with already fetched data
        if( data.data instanceof Array ) {
          paged_data = paged_data || [];
          Array.prototype.push.apply(paged_data, data.data);
        } else if( data.data instanceof Object ) {
          paged_data = self._merge(paged_data || {}, data.data);
        } else {
          paged_error = 'Unexpected response data type';
          return loop.break();
        }
        // Stop the loop if we're out of pages
        var page_count = data.pageCount ? parseInt(data.pageCount) : 0;
        if( !data.pageCount || parseInt(data.pageCount) <= loop.iteration() + 1 )
          return loop.break();
        else
          // Load the next page (after delay)
          setTimeout(function() {
            loop.next();
          }, self.paging.delay);
      });
    }, function() {
      // Done fetching pages, return the results
      callback(paged_data, paged_error);
    });
  };

  /**
   * Helper method to synchronize asynchronous looping.
   *
   * @access private
   * @param {Integer} iterations - Number of iterations to perform.
   * @param {Function} func - Method to call every iteration. Passes in loop.
   * @param {Function} callback - Method to call when loop is done.
   */
  this._async_loop = function(iterations, func, callback) {
    var index = 0;
    var done = false;
    var loop = {
      // Start next iteration
      next: function() {
        if(done) return;
        if(index < iterations) {
          index++;
          func(loop);
        } else {
          done = true;
          callback();
        }
      },
      // Get the current interation index
      iteration: function() {
        return index - 1;
      },
      // Exit the loop
      break: function() {
        done = true;
        callback();
      }
    };
    loop.next();
    return loop;
  };

  /**
   * Serializes an Object to be used with the API.
   *
   * @access private
   * @param {Object} obj - Object to serialize.
   * @param {String} prefix - Parent key name (mostly used recursively).
   * @returns {String} A serialized string.
   */
  this._serialize = function(obj, prefix) {
    var str = [], p;
    for(p in obj)
      if (obj.hasOwnProperty(p)) {
        var k = prefix ? prefix + "[" + p + "]" : p, v = obj[p];
        str.push((v !== null && typeof v === "object") ?
          this._serialize(v, k) :
          encodeURIComponent(k) + "=" + encodeURIComponent(v));
      }
    return str.join("&");
  };

  /**
   * Merges two objects recursively.
   *
   * @access private
   * @param {Object} obj_dst - Object to merge to.
   * @param {Object} obj_src - Object to merge from.
   * @returns {Object} A merged object.
   */
  this._merge = objectMerge;

  /**
   * The API often returns data with top level keys
   * for each item being the ID of the item and the name
   * of the type of model the item is. For instance,
   * an item could look like {"150": {"Offer": {...}}} when
   * it's already obvious it's an Offer and the ID is part of
   * the actual data (unless the user did not request the ID, in
   * which case they don't deserve to have it).
   * This strips that out and only returns the item data.
   *
   * @access private
   * @param {Array} items - Raw API results / models.
   * @param {String} key - Model name to remove.
   * @returns {Array} An array of normalized API results.
   */
  this._stripIdAndType = function(items, key) {
    var data = [];
    for( var item in items || [] )
      if( items.hasOwnProperty(item) && items[item].hasOwnProperty(key) )
        data.push(items[item][key]);
    return data;
  };

  /**
   * Has Offers Affiliate controller interface.
   *
   * @access public
   */
  this.affiliate = (function(self, method) {
    return {
      findAll: function(query, callback) {
        self.paged_request(method, 'findAll', query, function(items, err) {
          callback(self._stripIdAndType(items, method), err);
        });
      }
    };
  })(this, 'Affiliate');

  /**
   * Has Offers Alert controller interface.
   *
   * @access public
   */
  this.alert = (function(self, method) {
    return {
      findAll: function(query, callback) {
        self.paged_request(method, 'findAll', query, function(items, err) {
          callback(self._stripIdAndType(items, method), err);
        });
      }
    };
  })(this, 'Alert');

  /**
   * Has Offers Offer controller interface.
   *
   * @access public
   */
  this.offer = (function(self, method) {
    return {
      findAll: function(query, callback) {
        self.paged_request(method, 'findAll', query, function(items, err) {
          callback(self._stripIdAndType(items, method), err);
        });
      },
      findAllByIds: function(ids, query, callback) {
        query = self._merge(query || {}, {ids: ids});
        self.paged_request(method, 'findAllByIds', query, function(items, err) {
          callback(self._stripIdAndType(items, method), err);
        });
      },
      findAllById: function(id, query, callback) {
        query = self._merge(query || {}, {id: id});
        self.paged_request(method, 'findAllById', query, function(items, err) {
          callback(self._stripIdAndType(items, method), err);
        });
      }
    };
  })(this, 'Offer');

  /**
   * Has Offers Report controller interface.
   *
   * @access public
   */
  this.report = (function(self, method) {
    return {
      getStats: function(query, callback) {
        self.paged_request(method, 'getStats', query, callback);
      }
    };
  })(this, 'Report');

  return this;
};
