const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
/**
 * Simple configuration builder to create and start a server in one step
 * @param {Object} config - Server configuration
 * @param {number} [config.port=3000] - Server port
 * @param {string} [config.host='localhost'] - Server host
 * @param {boolean} [config.ssl=false] - Enable SSL
 * @param {Object} [config.sslOptions] - SSL options with keyPath and certPath
 * @param {Object} [config.routes] - Routes configuration object
 * @param {Object} [config.routes.GET] - GET route handlers as path:handler pairs
 * @param {Object} [config.routes.POST] - POST route handlers as path:handler pairs
 * @param {Object} [config.routes.PUT] - PUT route handlers as path:handler pairs
 * @param {Object} [config.routes.DELETE] - DELETE route handlers as path:handler pairs
 * @param {Object} [config.routes.PATCH] - PATCH route handlers as path:handler pairs
 * @param {Array} [config.middlewares] - Array of middleware functions
 * @returns {ServerListener} - Configured and started server instance
 */
function createServer(config = {}) {
    const server = new ServerListener({
        port: config.port,
        host: config.host,
        ssl: config.ssl
    });
    
    // Configure SSL if provided
    if (config.ssl && config.sslOptions) {
        server.useSSL(config.sslOptions);
    }
    
    // Add middlewares
    if (Array.isArray(config.middlewares)) {
        config.middlewares.forEach(middleware => server.use(middleware));
    }
    
    // Add routes
    if (config.routes) {
        Object.entries(config.routes).forEach(([method, handlers]) => {
            if (server.routes[method]) {
                Object.entries(handlers).forEach(([path, handler]) => {
                    server[method.toLowerCase()](path, handler);
                });
            }
        });
    }
    
    // Start the server automatically if autoStart is true
    if (config.autoStart !== false) {
        server.start();
    }
    
    return server;
}
/**
 * Server Listener class that handles HTTP/HTTPS requests
 */
class ServerListener {
    constructor(options = {}) {
        this.port = options.port || 3000;
        this.host = options.host || 'localhost';
        this.ssl = options.ssl || false;
        this.server = null;
        this.routes = {
            GET: {},
            POST: {},
            PUT: {},
            DELETE: {},
            PATCH: {}
        };
        this.middlewares = [];
    }

    /**
     * Set the port for the server
     * @param {number} port - The port number
     * @returns {ServerListener} - Returns this for chaining
     */
    setPort(port) {
        this.port = port;
        return this;
    }

    /**
     * Set the host for the server
     * @param {string} host - The host address
     * @returns {ServerListener} - Returns this for chaining
     */
    setHost(host) {
        this.host = host;
        return this;
    }

    /**
     * Configure SSL for HTTPS
     * @param {Object} sslOptions - SSL options with key and cert paths
     * @returns {ServerListener} - Returns this for chaining
     */
    useSSL(sslOptions) {
        this.ssl = true;
        this.sslOptions = {
            key: fs.readFileSync(sslOptions.keyPath),
            cert: fs.readFileSync(sslOptions.certPath)
        };
        return this;
    }

    /**
     * Add middleware function to process requests
     * @param {Function} middleware - Middleware function
     * @returns {ServerListener} - Returns this for chaining
     */
    use(middleware) {
        this.middlewares.push(middleware);
        return this;
    }

    /**
     * Register a route handler for GET requests
     * @param {string} path - URL path
     * @param {Function} handler - Request handler
     * @returns {ServerListener} - Returns this for chaining
     */
    get(path, handler) {
        this.routes.GET[path] = handler;
        return this;
    }

    /**
     * Register a route handler for POST requests
     * @param {string} path - URL path
     * @param {Function} handler - Request handler
     * @returns {ServerListener} - Returns this for chaining
     */
    post(path, handler) {
        this.routes.POST[path] = handler;
        return this;
    }

    /**
     * Register a route handler for PUT requests
     * @param {string} path - URL path
     * @param {Function} handler - Request handler
     * @returns {ServerListener} - Returns this for chaining
     */
    put(path, handler) {
        this.routes.PUT[path] = handler;
        return this;
    }

    /**
     * Register a route handler for DELETE requests
     * @param {string} path - URL path
     * @param {Function} handler - Request handler
     * @returns {ServerListener} - Returns this for chaining
     */
    delete(path, handler) {
        this.routes.DELETE[path] = handler;
        return this;
    }

    /**
     * Register a route handler for PATCH requests
     * @param {string} path - URL path
     * @param {Function} handler - Request handler
     * @returns {ServerListener} - Returns this for chaining
     */
    patch(path, handler) {
        this.routes.PATCH[path] = handler;
        return this;
    }

    /**
     * Helper method to parse request body
     * @param {Object} request - HTTP request object
     * @returns {Promise<Object>} - Parsed request body
     */
    parseBody(request) {
        return new Promise((resolve, reject) => {
            let body = '';
            request.on('data', chunk => {
                body += chunk.toString();
            });
            request.on('end', () => {
                try {
                    if (body) {
                        resolve(JSON.parse(body));
                    } else {
                        resolve({});
                    }
                } catch (error) {
                    resolve({}); // If parsing fails, return empty object
                }
            });
            request.on('error', reject);
        });
    }

    /**
     * Handle incoming requests
     * @param {Object} req - Request object
     * @param {Object} res - Response object
     */
    async handleRequest(req, res) {
        // Parse URL
        const parsedUrl = url.parse(req.url, true);
        const path = parsedUrl.pathname;
        const method = req.method;
        
        // Set common headers
        res.setHeader('Content-Type', 'application/json');
        
        // Apply middlewares
        for (const middleware of this.middlewares) {
            await new Promise(resolve => {
                middleware(req, res, resolve);
            });
            
            // If response is already sent by middleware, return
            if (res.writableEnded) return;
        }
        
        try {
            // Check if route exists
            if (this.routes[method] && this.routes[method][path]) {
                // Parse body for non-GET requests
                if (method !== 'GET') {
                    req.body = await this.parseBody(req);
                }
                
                req.query = parsedUrl.query;
                
                // Call route handler
                await this.routes[method][path](req, res);
            } else {
                // Route not found
                res.statusCode = 404;
                res.end(JSON.stringify({ error: 'Not Found' }));
            }
        } catch (error) {
            // Handle errors
            console.error('Request handler error:', error);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Internal Server Error' }));
        }
    }

    /**
     * Start the server
     * @returns {Promise<void>}
     */
    start() {
        return new Promise((resolve) => {
            const requestHandler = this.handleRequest.bind(this);
            
            if (this.ssl && this.sslOptions) {
                this.server = https.createServer(this.sslOptions, requestHandler);
            } else {
                this.server = http.createServer(requestHandler);
            }
            
            this.server.listen(this.port, this.host, () => {
                console.log(`Server listening on ${this.ssl ? 'https' : 'http'}://${this.host}:${this.port}`);
                resolve();
            });
        });
    }

    /**
     * Stop the server
     * @returns {Promise<void>}
     */
    stop() {
        return new Promise((resolve, reject) => {
            if (!this.server) {
                resolve();
                return;
            }
            
            this.server.close(err => {
                if (err) {
                    reject(err);
                } else {
                    console.log('Server stopped');
                    resolve();
                }
            });
        });
    }
}

module.exports = ServerListener;