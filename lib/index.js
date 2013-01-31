var http = require('http');
var https = require('https');
var Request = require('./request');
var mach = module.exports;

/**
 * The current version of mach.
 */
mach.version = '0.0.0';

/**
 * The default port to use in mach.serve.
 */
mach.defaultPort = 3333;

/**
 * Binds the given app to the "request" event of the given server so that it
 * is called whenever the server receives a new request.
 */
mach.bind = bindAppToNodeServer;
function bindAppToNodeServer(app, nodeServer) {
  nodeServer.on('request', function (nodeRequest, nodeResponse) {
    var request = Request.makeFromNodeRequest(nodeServer, nodeRequest);
    request.call(app).then(function (response) {
      nodeResponse.writeHead(response.status, response.headers);
      response.content.resume();
      response.content.pipe(nodeResponse);
      request.done();
    }, function (error) {
      var stack = error.stack || error.toString();
      request.error.write('There was an unhandled error!\n' + stack + '\n');
      nodeResponse.writeHead(500, { 'Content-Type': 'text/plain' });
      nodeResponse.end('Internal Server Error');
      request.done();
    });
  });
}

/**
 * Creates and starts a node HTTP server that serves the given app. Options may
 * be any of the following:
 *
 *   - host     The host name to accept connections on (defaults to INADDR_ANY)
 *   - port     The port to listen on (defaults to mach.defaultPort)
 *   - socket   Unix socket file to listen on (trumps host/port)
 *   - quiet    Set true to prevent the server from writing a startup/shutdown
 *              messages to the console
 *   - key      Private key to use for SSL (HTTPS only)
 *   - cert     Public X509 certificate to use (HTTPS only)
 */
mach.serve = serveApp;
function serveApp(app, options) {
  options = options || {};

  if (typeof options === 'number') {
    options = { port: options };
  } else if (typeof options === 'string') {
    options = { socket: options };
  }

  var nodeServer;
  if (options.key && options.cert) {
    nodeServer = https.createServer({ key: options.key, cert: options.cert });
  } else {
    nodeServer = http.createServer();
  }

  nodeServer.on('listening', function () {
    process.once('SIGINT', function () {
      if (!options.quiet) console.log('>> Shutting down...');
      nodeServer.close();
    });

    if (!options.quiet) {
      var address = nodeServer.address();
      var message = '>> mach web server version ' + mach.version + ' started on node ' + process.versions.node + '\n';

      if (typeof address === 'string') {
        message += '>> Listening on ' + address;
      } else {
        message += '>> Listening on ' + address.address;
        if (address.port) message += ':' + address.port;
      }

      message += ', use CTRL+C to stop';

      console.log(message);
    }
  });

  mach.bind(app, nodeServer);

  if (options.socket) {
    nodeServer.listen(options.socket);
  } else {
    nodeServer.listen(options.port || mach.defaultPort, options.host);
  }

  return nodeServer;
}

// Expose modules.
var modulePaths = {
  basicAuth:      './basic-auth',
  commonLogger:   './common-logger',
  contentType:    './content-type',
  favicon:        './favicon',
  file:           './file',
  gzip:           './gzip',
  mapper:         './mapper',
  Request:        './request',
  router:         './router',
  Server:         './server',
  stack:          './stack',
  urlMap:         './url-map',
  utils:          './utils'
};

for (var name in modulePaths) {
  (function (path) {
    mach.__defineGetter__(name, function () {
      return require(path);
    });
  })(modulePaths[name]);
}