var q = require('q');
var utils = require('./utils');

module.exports = basicAuth;

/**
 * A middleware that performs basic auth on the incoming request before passing
 * it downstream.
 *
 * The `validate` argument must be a function that accepts two arguments: the
 * username and password given in the request. It must return the username to
 * use for the request (or simply `true` to indicate the given username is
 * valid) or a promise for such a value. The validated username is stored in the
 * `remoteUser` request variable.
 *
 * When authorization fails, the client automatically receives a 401 Unauthorized
 * response with the appropriate challenge in the WWW-Authenticate header.
 *
 * Example usage:
 *
 *   mach.basicAuth(app, function (user, pass) {
 *     // Return a boolean value to indicate the given credentials are valid.
 *     return (user === 'admin' && pass === 'secret');
 *   });
 *
 *   mach.basicAuth(app, function (user, pass) {
 *     // Return a promise for the actual username to use.
 *     return query('SELECT username FROM users WHERE handle=? AND password=?', user, pass);
 *   });
 */
function basicAuth(app, validate, realm) {
  realm = realm || 'Authorization Required';

  if (typeof validate !== 'function') {
    throw new Error('Missing validation function for basic auth');
  }

  return function (request) {
    var authorization = request.headers.authorization;
    if (!authorization) return unauthorized(realm);

    var parts = authorization.split(' ');
    var scheme = parts[0];
    if (scheme.toLowerCase() !== 'basic') return utils.badRequest();

    var params = new Buffer(parts[1], 'base64').toString().split(':');
    var username = params[0];
    var password = params[1];

    return q.when(validate(username, password), function (user) {
      if (user) {
        request.remoteUser = (user === true) ? username : user;
        return request.call(app);
      }

      return unauthorized(realm);
    });
  };
}

function unauthorized(realm) {
  return {
    status: 401,
    headers: {
      'Content-Type': 'text/plain',
      'WWW-Authenticate': 'Basic realm="' + realm + '"'
    },
    content: 'Not Authorized'
  };
}