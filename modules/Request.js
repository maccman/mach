var d = require('d');
var Promise = require('bluebird');
var mergeProperties = require('./utils/mergeProperties');
var parseCookie = require('./utils/parseCookie');
var parseQuery = require('./utils/parseQuery');
var Message = require('./Message');
var Response = require('./Response');

var defaultErrorHandler;
if (typeof process !== 'undefined' && process.stderr) {
  defaultErrorHandler = function (errorMessage) {
    process.stderr.write(errorMessage + '\n');
  };
} else if (typeof console !== 'undefined' && typeof console.error === 'function') {
  defaultErrorHandler = function (errorMessage) {
    console.error(errorMessage);
  };
}

function defaultCloseHandler() {}

/**
 * An HTTP request.
 *
 * A new Request is created for each new client request. It serves as the
 * concurrency primitive for the duration of the request handling process.
 *
 * Options may be any of the following:
 *
 *   - headers            An object of HTTP headers and values
 *   - content            A readable stream containing the message content
 *   - onError            A handler function for error messages
 *   - onClose            A handler function for closed connections
 *   - protocol           The protocol being used (i.e. "http:" or "https:")
 *   - protocolVersion    The protocol version
 *   - method             The request method (e.g. "GET" or "POST")
 *   - remoteHost         The IP address of the client
 *   - remotePort         The port number being used on the client machine
 *   - serverName         The host name of the server
 *   - serverPort         The port the server is listening on
 *   - queryString        The query string used in the request
 *   - scriptName         The virtual location of the application on the server
 *   - pathInfo/path      The path used in the request
 */
function Request(options) {
  options = options || {};

  Message.call(this, options.content, options.headers);

  var errorHandler = options.onError || defaultErrorHandler;
  if (typeof errorHandler !== 'function')
    throw new Error('Request needs an error handler');

  var closeHandler = options.onClose || defaultCloseHandler;
  if (typeof closeHandler !== 'function')
    throw new Error('Request needs a close handler');

  this.onError = errorHandler;
  this.onClose = closeHandler;
  this._protocol = options.protocol || 'http:';
  this.protocolVersion = options.protocolVersion || '1.0';
  this.method = (options.method || 'GET').toUpperCase();
  this._remoteHost = options.remoteHost || '';
  this.remotePort = String(options.remotePort || 0);
  this.serverName = options.serverName || '';
  this.serverPort = String(options.serverPort || 0);
  this.queryString = options.queryString || '';
  this.scriptName = options.scriptName || '';
  this.pathInfo = options.pathInfo || options.path || '';

  // Make sure pathInfo is at least '/'.
  if (this.scriptName === '' && this.pathInfo === '')
    this.pathInfo = '/';
}

Request.prototype = Object.create(Message.prototype, {

  constructor: d(Request),

  /**
   * Calls the given `app` in the scope of this request with this request
   * as the first argument and returns a promise for a Response.
   */
  call: d(function (app) {
    try {
      var response = app.call(this, this);
    } catch (error) {
      return Promise.reject(error);
    }

    return Promise.resolve(response).then(function (response) {
      if (response == null)
        throw new Error('No response returned from app: ' + app);

      if (!(response instanceof Response))
        response = Response.createFromObject(response);

      return response;
    });
  }),

  /**
   * An object containing cookies that were used in the request, keyed by name.
   */
  cookies: d.gs(function () {
    if (!this._cookies) {
      if (this.headers['Cookie']) {
        var cookies = parseCookie(this.headers['Cookie']);

        // From RFC 2109:
        // If multiple cookies satisfy the criteria above, they are ordered in
        // the Cookie header such that those with more specific Path attributes
        // precede those with less specific. Ordering with respect to other
        // attributes (e.g., Domain) is unspecified.
        for (var cookieName in cookies) {
          if (Array.isArray(cookies[cookieName]))
            cookies[cookieName] = cookies[cookieName][0] || '';
        }

        this._cookies = cookies;
      } else {
        this._cookies = {};
      }
    }

    return this._cookies;
  }),

  /**
   * The protocol used in the request (i.e. "http:" or "https:").
   */
  protocol: d.gs(function () {
    if (this.headers['X-Forwarded-Ssl'] === 'on')
      return 'https:';

    if (this.headers['X-Forwarded-Proto'])
      return this.headers['X-Forwarded-Proto'].split(',')[0] + ':';

    return this._protocol;
  }),

  /**
   * True if this request was made over SSL.
   */
  isSSL: d.gs(function () {
    return this.protocol === 'https:';
  }),

  /**
   * Returns a string of the hostname:port used in this request.
   */
  host: d.gs(function () {
    var forwardedHost = this.headers['X-Forwarded-Host'];

    if (forwardedHost) {
      var parts = forwardedHost.split(/,\s?/);
      return parts[parts.length - 1];
    }

    if (this.headers['Host'])
      return this.headers['Host'];

    if (this.serverPort)
      return this.serverName + ':' + this.serverPort;

    return this.serverName;
  }),

  /**
   * Returns the name of the host used in this request.
   */
  hostname: d.gs(function () {
    return this.host.replace(/:\d+$/, '');
  }),

  /**
   * Returns the port number used in this request.
   */
  port: d.gs(function () {
    var port = this.host.split(':')[1] || this.headers['X-Forwarded-Port'];

    if (port)
      return port;

    if (this.isSSL)
      return '443';

    if (this.headers['X-Forwarded-Host'])
      return '80';

    return this.serverPort;
  }),

  /**
   * The full path of this request, including the query string.
   */
  path: d.gs(function () {
    return this.pathname + this.search;
  }),

  /**
   * The path of this request, without the query string.
   */
  pathname: d.gs(function () {
    return this.scriptName + this.pathInfo;
  }),

  /**
   * The query string of the URL, including the leading question mark.
   */
  search: d.gs(function () {
    return this.queryString ? '?' + this.queryString : '';
  }),

  /**
   * An object containing the properties and values that were URL-encoded in
   * the query string.
   */
  query: d.gs(function () {
    if (!this._query)
      this._query = parseQuery(this.queryString);

    return this._query;
  }),

  /**
   * The original URL of this request.
   */
  url: d.gs(function () {
    return this.protocol + '//' + this.host + this.path;
  }),

  /**
   * True if this request was made using XMLHttpRequest.
   */
  isXHR: d.gs(function () {
    return this.headers['X-Requested-With'] === 'XMLHttpRequest';
  }),

  /**
   * The IP address of the client.
   */
  remoteHost: d.gs(function () {
    return this.headers['X-Forwarded-For'] || this._remoteHost;
  }),

  /**
   * A high-level method that returns a promise for an object that is the union of
   * data contained in the request query and body.
   *
   *   var maxUploadLimit = Math.pow(2, 20); // 1 mb
   *
   *   function app(request) {
   *     return request.getParams(maxUploadLimit).then(function (params) {
   *       // params is the union of query and content params
   *     });
   *   }
   *
   * Note: Content parameters take precedence over query parameters with the same name.
   */
  getParams: d(function (maxLength, uploadPrefix) {
    if (this._params)
      return this._params;

    var queryParams = mergeProperties({}, this.query);

    this._params = this.parseContent(maxLength, uploadPrefix).then(function (params) {
      // Content params take precedence over query params.
      return mergeProperties(queryParams, params);
    });

    return this._params;
  }),

  /**
   * A high-level method that returns a promise for an object of all parameters given in
   * this request filtered by the filter functions given in the filterMap. This provides
   * a convenient way to get a whitelist of trusted request parameters.
   *
   * Keys in the filterMap should correspond to the names of request parameters and values
   * should be a filter function that is used to coerce the value of that parameter to the
   * desired output value. Any parameters in the filterMap that were not given in the request
   * are ignored. Values for which filtering functions return `undefined` are also ignored.
   *
   *   // This function parses a list of comma-separated values in
   *   // a request parameter into an array.
   *   function parseList(value) {
   *     return value.split(',');
   *   }
   *
   *   function app(request) {
   *     return request.filterParams({
   *       name: String,
   *       age: Number,
   *       hobbies: parseList
   *     }).then(function (params) {
   *       // params.name will be a string, params.age a number, and params.hobbies an array
   *       // if they were provided in the request. params won't contain any other properties.
   *     });
   *   }
   */
  filterParams: d(function (filterMap, maxLength, uploadPrefix) {
    return this.getParams(maxLength, uploadPrefix).then(function (params) {
      var filteredParams = {};

      var filter, value;
      for (var paramName in filterMap) {
        filter = filterMap[paramName];

        if (typeof filter === 'function' && params.hasOwnProperty(paramName)) {
          value = filter(params[paramName]);

          if (value !== undefined)
            filteredParams[paramName] = value;
        }
      }

      return filteredParams;
    });
  })

});

module.exports = Request;
