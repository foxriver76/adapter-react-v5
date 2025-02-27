/**
 * Copyright 2020-2023, bluefox <dogafox@gmail.com>
 *
 * MIT License
 *
 **/
import PropTypes from 'prop-types';

/** Possible progress states. */
export const PROGRESS = {
    /** The socket is connecting. */
    CONNECTING: 0,
    /** The socket is successfully connected. */
    CONNECTED: 1,
    /** All objects are loaded. */
    OBJECTS_LOADED: 2,
    /** The socket is ready for use. */
    READY: 3,
};

const PERMISSION_ERROR = 'permissionError';
const NOT_CONNECTED    = 'notConnectedError';
const TIMEOUT_FOR_ADMIN4 = 1300;

export const ERRORS = {
    PERMISSION_ERROR,
    NOT_CONNECTED,
};

function fixAdminUI(obj) {
    if (obj && obj.common && !obj.common.adminUI) {
        if (obj.common.noConfig) {
            obj.common.adminUI = obj.common.adminUI || {};
            obj.common.adminUI.config = 'none';
        } else if (obj.common.jsonConfig) {
            obj.common.adminUI = obj.common.adminUI || {};
            obj.common.adminUI.config = 'json';
        } else if (obj.common.materialize) {
            obj.common.adminUI = obj.common.adminUI || {};
            obj.common.adminUI.config = 'materialize';
        } else {
            obj.common.adminUI = obj.common.adminUI || {};
            obj.common.adminUI.config = 'html';
        }

        if (obj.common.jsonCustom) {
            obj.common.adminUI = obj.common.adminUI || {};
            obj.common.adminUI.custom = 'json';
        } else if (obj.common.supportCustoms) {
            obj.common.adminUI = obj.common.adminUI || {};
            obj.common.adminUI.custom = 'json';
        }

        if (obj.common.materializeTab && obj.common.adminTab) {
            obj.common.adminUI = obj.common.adminUI || {};
            obj.common.adminUI.tab = 'materialize';
        } else if (obj.common.adminTab) {
            obj.common.adminUI = obj.common.adminUI || {};
            obj.common.adminUI.tab = 'html';
        }

        obj.common.adminUI && console.debug(`Please add to "${obj._id.replace(/\.\d+$/, '')}" common.adminUI=${JSON.stringify(obj.common.adminUI)}`);
    }
    return obj;
}

/** Converts ioB pattern into regex
 * @param {string} pattern
 * @returns {string}
 */

export function pattern2RegEx(pattern) {
    pattern = (pattern || '').toString();

    const startsWithWildcard = pattern[0] === '*';
    const endsWithWildcard = pattern[pattern.length - 1] === '*';

    pattern = pattern
        .replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&')
        .replace(/\*/g, '.*');

    return (startsWithWildcard ? '' : '^') + pattern + (endsWithWildcard ? '' : '$');
}

class Connection {
    /**
     * @param {import('./types').ConnectionProps} props
     */
    constructor(props) {
        props                 = props || { protocol: window.location.protocol, host: window.location.hostname };
        this.props            = props;

        this.autoSubscribes   = this.props.autoSubscribes || [];
        this.autoSubscribeLog = this.props.autoSubscribeLog;

        this.props.protocol   = this.props.protocol || window.location.protocol;
        this.props.host       = this.props.host     || window.location.hostname;
        this.props.port       = this.props.port     || (window.location.port === '3000' ? (Connection.isWeb() ? 8082 : 8081) : window.location.port);
        this.props.ioTimeout  = Math.max(this.props.ioTimeout  || 20000, 20000);
        this.props.cmdTimeout = Math.max(this.props.cmdTimeout || 5000, 5000);
        this._instanceSubscriptions = {};

        // breaking change. Do not load all objects by default is true
        this.doNotLoadAllObjects = this.props.doNotLoadAllObjects === undefined ? true : this.props.doNotLoadAllObjects;
        this.doNotLoadACL        = this.props.doNotLoadACL        === undefined ? true : this.props.doNotLoadACL;

        /** @type {Record<string, ioBroker.State>} */
        this.states = {};
        this.objects = null;
        this.acl = null;
        this.firstConnect = true;
        this.waitForRestart = false;
        /** @type {ioBroker.Languages} */
        this.systemLang = 'en';
        this.connected = false;
        this._waitForFirstConnection = new Promise(resolve => {
            this._waitForFirstConnectionResolve = resolve;
        });

        /** @type {Record<string, { reg: RegExp; cbs: ioBroker.StateChangeHandler[]}>} */
        this.statesSubscribes = {}; // subscribe for states

        /** @type {Record<string, { reg: RegExp; cbs: import('./types').ObjectChangeHandler[]}>} */
        this.objectsSubscribes = {}; // subscribe for objects
        this.filesSubscribes = {}; // subscribe for files
        this.onProgress = this.props.onProgress || (() => {});
        this.onError = this.props.onError || (err => console.error(err));
        this.loaded = false;
        this.loadTimer = null;
        this.loadCounter = 0;
        this.admin5only = this.props.admin5only || false;

        /** @type {((connected: boolean) => void)[]} */
        this.onConnectionHandlers = [];
        /** @type {((message: string) => void)[]} */
        this.onLogHandlers = [];

        /** @type {Record<string, Promise<any>>} */
        this._promises = {};
        this.ignoreState = '';
        this.simStates = {};

        this.log.error = text => this.log(text, 'error');
        this.log.warn = text => this.log(text, 'warn');
        this.log.info = text => this.log(text, 'info');
        this.log.debug = text => this.log(text, 'debug');
        this.log.silly = text => this.log(text, 'silly');

        this.startSocket();
    }

    /**
     * Checks if this connection is running in a web adapter and not in an admin.
     * @returns {boolean} True if running in a web adapter or in a socketio adapter.
     */
    static isWeb() {
        return window.adapterName === 'material' ||
            window.adapterName === 'vis' ||
            (window.adapterName && window.adapterName.startsWith('vis-')) ||
            window.adapterName === 'echarts-show' ||
            window.socketUrl !== undefined;
    }

    /**
     * Starts the socket.io connection.
     * @returns {void}
     */
    startSocket() {
        // if socket io is not yet loaded
        if (typeof window.io === 'undefined') {
            // if in index.html the onLoad function not defined
            if (typeof window.registerSocketOnLoad !== 'function') {
                // poll if loaded
                this.scriptLoadCounter = this.scriptLoadCounter || 0;
                this.scriptLoadCounter++;

                if (this.scriptLoadCounter < 30) {
                    // wait till the script loaded
                    setTimeout(() => this.startSocket(), 100);
                    return;
                }
                window.alert('Cannot load socket.io.js!');
            } else {
                // register on load
                window.registerSocketOnLoad(() => this.startSocket());
            }
            return;
        }
        if (this._socket) {
            // socket was initialized, do not repeat
            return;
        }

        let host = this.props.host;
        let port = this.props.port;
        let protocol = this.props.protocol.replace(':', '');
        let path = window.location.pathname;

        if (
            window.location.hostname === 'iobroker.net' ||
            window.location.hostname === 'iobroker.pro'
        ) {
            path = '';
        } else {
            // if web adapter, socket io could be on another port or even host
            if (window.socketUrl) {
                let parts = window.socketUrl.split(':');
                host = parts[0] || host;
                port = parts[1] || port;
                if (host.includes('://')) {
                    parts = host.split('://');
                    protocol = parts[0];
                    host = parts[1];
                }
            }
            // get current path
            const pos = path.lastIndexOf('/');
            if (pos !== -1) {
                path = path.substring(0, pos + 1);
            }

            if (Connection.isWeb()) {
                // remove one level, like echarts, vis, .... We have here: '/echarts/'
                const parts = path.split('/');
                if (parts.length > 2) {
                    parts.pop();
                    // if it is version, like in material, so remove it too
                    if (parts[parts.length - 1].match(/\d+\.\d+\.\d+/)) {
                        parts.pop();
                    }
                    parts.pop();
                    path = parts.join('/');
                    if (!path.endsWith('/')) {
                        path += '/';
                    }
                }
            }
        }

        const url = port ? `${protocol}://${host}:${port}${path}` : `${protocol}://${host}${path}`;

        this._socket = window.io.connect(
            url,
            {
                path: path.endsWith('/') ? `${path}socket.io` : `${path}/socket.io`,
                query: 'ws=true',
                name: this.props.name,
                timeout: this.props.ioTimeout,
                uuid: this.props.uuid,
            },
        );

        this._socket.on('connect', noTimeout => {
            // If the user is not admin it takes some time to install the handlers, because all rights must be checked
            if (noTimeout !== true) {
                setTimeout(() =>
                    this.getVersion()
                        .then(info => {
                            const [major, minor, patch] = info.version.split('.');
                            const v = parseInt(major, 10) * 10000 + parseInt(minor, 10) * 100 + parseInt(patch, 10);
                            if (v < 40102) {
                                this._authTimer = null;
                                // possible this is old version of admin
                                this.onPreConnect(false, false);
                            } else {
                                this._socket.emit('authenticate', (isOk, isSecure) => this.onPreConnect(isOk, isSecure));
                            }
                        }), 500);
            } else {
                // iobroker websocket waits, till all handlers are installed
                this._socket.emit('authenticate', (isOk, isSecure) => this.onPreConnect(isOk, isSecure));
            }
        });

        this._socket.on('reconnect', () => {
            this.onProgress(PROGRESS.READY);
            this.connected = true;

            if (this.waitForRestart) {
                window.location.reload(false);
            } else {
                this._subscribe(true);
                this.onConnectionHandlers.forEach(cb => cb(true));
            }
        });

        this._socket.on('disconnect', () => {
            this.connected  = false;
            this.subscribed = false;
            this.onProgress(PROGRESS.CONNECTING);
            this.onConnectionHandlers.forEach(cb => cb(false));
        });

        this._socket.on('reauthenticate', () =>
            this.authenticate());

        this._socket.on('log', message => {
            this.props.onLog && this.props.onLog(message);
            this.onLogHandlers.forEach(cb => cb(message));
        });

        this._socket.on('error', err => {
            let _err = err || '';
            if (typeof _err.toString !== 'function') {
                _err = JSON.stringify(_err);
                console.error(`Received strange error: ${_err}`);
            }
            _err = _err.toString();
            if (_err.includes('User not authorized')) {
                this.authenticate();
            } else {
                window.alert(`Socket Error: ${err}`);
            }
        });

        this._socket.on('connect_error', err =>
            console.error(`Connect error: ${err}`));

        this._socket.on('permissionError', err =>
            this.onError({
                message: 'no permission',
                operation: err.operation,
                type: err.type,
                id: (err.id || ''),
            }));

        this._socket.on('objectChange', (id, obj) =>
            setTimeout(() => this.objectChange(id, obj), 0));

        this._socket.on('stateChange', (id, state) =>
            setTimeout(() => this.stateChange(id, state), 0));

        this._socket.on("im", (messageType, from, data) =>
            setTimeout(() => this.instanceMessage(messageType, from, data), 0));

        this._socket.on('fileChange', (id, fileName, size) =>
            setTimeout(() => this.fileChange(id, fileName, size), 0));

        this._socket.on('cmdStdout', (id, text) =>
            this.onCmdStdoutHandler && this.onCmdStdoutHandler(id, text));

        this._socket.on('cmdStderr', (id, text) =>
            this.onCmdStderrHandler && this.onCmdStderrHandler(id, text));

        this._socket.on('cmdExit', (id, exitCode) =>
            this.onCmdExitHandler && this.onCmdExitHandler(id, exitCode));
    }

    /**
     * Called internally.
     * @private
     * @param {boolean} isOk
     * @param {boolean} isSecure
     */
    onPreConnect(isOk, isSecure) {
        if (this._authTimer) {
            clearTimeout(this._authTimer);
            this._authTimer = null;
        }

        this.connected = true;
        this.isSecure = isSecure;

        if (this.waitForRestart) {
            window.location.reload(false);
        } else {
            if (this.firstConnect) {
                // retry strategy
                this.loadTimer = setTimeout(() => {
                    this.loadTimer = null;
                    this.loadCounter++;
                    if (this.loadCounter < 10) {
                        this.onConnect();
                    }
                }, 1000);

                if (!this.loaded) {
                    this.onConnect();
                }
            } else {
                this.onProgress(PROGRESS.READY);
            }

            this._subscribe(true);
            this.onConnectionHandlers.forEach(cb => cb(true));
        }

        if (this._waitForFirstConnectionResolve) {
            this._waitForFirstConnectionResolve();
            this._waitForFirstConnectionResolve = null;
        }
    }

    /**
     * Checks if the socket is connected.
     * @returns {boolean} true if connected.
     */
    isConnected() {
        return this.connected;
    }

    /**
     * Checks if the socket is connected.
     * @returns {Promise<void>} Promise resolves if once connected.
     */
    waitForFirstConnection() {
        return this._waitForFirstConnection;
    }

    /**
     * Called internally.
     * @private
     */
    _getUserPermissions(cb) {
        if (this.doNotLoadACL) {
            return cb && cb();
        }

        this._socket.emit('getUserPermissions', cb);
    }

    /**
     * Called internally.
     * @private
     */
    onConnect() {
        this._getUserPermissions((err, acl) => {
            if (err) {
                this.onError(`Cannot read user permissions: ${err}`);
                return;
            }
            if (!this.doNotLoadACL) {
                if (this.loaded) {
                    return;
                }
                this.loaded = true;
                clearTimeout(this.loadTimer);
                this.loadTimer = null;

                this.onProgress(PROGRESS.CONNECTED);
                this.firstConnect = false;

                this.acl = acl;
            }

            // Read system configuration
            return (this.admin5only && !window.vendorPrefix ? this.getCompactSystemConfig() : this.getSystemConfig())
                .then(data => {
                    if (this.doNotLoadACL) {
                        if (this.loaded) {
                            return undefined;
                        }
                        this.loaded = true;
                        clearTimeout(this.loadTimer);
                        this.loadTimer = null;

                        this.onProgress(PROGRESS.CONNECTED);
                        this.firstConnect = false;
                    }

                    this.systemConfig = data;
                    if (this.systemConfig && this.systemConfig.common) {
                        this.systemLang = this.systemConfig.common.language;
                    } else {
                        this.systemLang = window.navigator.userLanguage || window.navigator.language;

                        if (/^(en|de|ru|pt|nl|fr|it|es|pl|uk)-?/.test(this._systemLang)) {
                            this.systemLang = this._systemLang.substr(0, 2);
                        } else if (
                            !/^(en|de|ru|pt|nl|fr|it|es|pl|uk|zh-cn)$/.test(this._systemLang)
                        ) {
                            this.systemLang = 'en';
                        }
                    }

                    this.props.onLanguage && this.props.onLanguage(this.systemLang);

                    if (!this.doNotLoadAllObjects) {
                        return this.getObjects()
                            .then(() => {
                                this.onProgress(PROGRESS.READY);
                                this.props.onReady && this.props.onReady(this.objects);
                            });
                    }
                    this.objects = this.admin5only ? {} : { 'system.config': data };
                    this.onProgress(PROGRESS.READY);
                    this.props.onReady && this.props.onReady(this.objects);

                    return undefined;
                })
                .catch(e => this.onError(`Cannot read system config: ${e}`));
        });
    }

    /**
     * Called internally.
     * @private
     */
    authenticate() {
        if (window.location.search.includes('&href=')) {
            window.location = `${window.location.protocol}//${window.location.host}${window.location.pathname}${window.location.search}${window.location.hash}`;
        } else {
            window.location = `${window.location.protocol}//${window.location.host}${window.location.pathname}?login&href=${window.location.search}${window.location.hash}`;
        }
    }

    /**
     * Subscribe to changes of the given state.
     * @param {string} id The ioBroker state ID.
     * @param {ioBroker.StateChangeHandler} cb The callback.
     */
    /**
     * Subscribe to changes of the given state.
     * @param {string} id The ioBroker state ID.
     * @param {boolean} binary Set to true if the given state is binary and requires Base64 decoding.
     * @param {ioBroker.StateChangeHandler} cb The callback.
     */
    subscribeState(id, binary, cb) {
        if (typeof binary === 'function') {
            cb = binary;
            binary = false;
        }

        let ids;
        if (!Array.isArray(id)) {
            ids = [id];
        } else {
            ids = id;
        }
        let toSubscribe = [];
        for (let i = 0; i < ids.length; i++) {
            const _id = ids[i];
            if (!this.statesSubscribes[_id]) {
                let reg = _id
                    .replace(/\./g, '\\.')
                    .replace(/\*/g, '.*')
                    .replace(/\(/g, '\\(')
                    .replace(/\)/g, '\\)')
                    .replace(/\+/g, '\\+')
                    .replace(/\[/g, '\\[');

                if (!reg.includes('*')) {
                    reg += '$';
                }
                this.statesSubscribes[_id] = { reg: new RegExp(reg), cbs: [] };
                this.statesSubscribes[_id].cbs.push(cb);
                if (_id !== this.ignoreState) {
                    toSubscribe.push(_id);
                }
            } else {
                !this.statesSubscribes[_id].cbs.includes(cb) && this.statesSubscribes[_id].cbs.push(cb);
            }
        }

        if (toSubscribe.length && this.connected) {
            // no answer from server required
            this._socket.emit('subscribe', toSubscribe);
        }

        if (typeof cb === 'function' && this.connected) {
            if (binary) {
                this.getBinaryState(id)
                    .then(base64 => cb(id, base64))
                    .catch(e => console.error(`Cannot getForeignStates "${id}": ${JSON.stringify(e)}`));
            } else {
                this._socket.emit(Connection.isWeb() ? 'getStates' : 'getForeignStates', id, (err, states) => {
                    err && console.error(`Cannot getForeignStates "${id}": ${JSON.stringify(err)}`);
                    states && Object.keys(states).forEach(id => cb(id, states[id]));
                });
            }
        }
    }

    /**
     * Subscribe to changes of the given state.
     * @param {string | string[]} id The ioBroker state ID or array of states
     * @param {ioBroker.StateChangeHandler} cb The callback.
     */
    subscribeStateAsync(id, cb) {
        let ids;
        if (!Array.isArray(id)) {
            ids = [id];
        } else {
            ids = id;
        }
        let toSubscribe = [];
        for (let i = 0; i < ids.length; i++) {
            const _id = ids[i];
            if (!this.statesSubscribes[_id]) {
                let reg = _id
                    .replace(/\./g, '\\.')
                    .replace(/\*/g, '.*')
                    .replace(/\(/g, '\\(')
                    .replace(/\)/g, '\\)')
                    .replace(/\+/g, '\\+')
                    .replace(/\[/g, '\\[');

                if (!reg.includes('*')) {
                    reg += '$';
                }
                this.statesSubscribes[_id] = {reg: new RegExp(reg), cbs: []};
                this.statesSubscribes[_id].cbs.push(cb);
                if (_id !== this.ignoreState) {
                    // no answer from server required
                    toSubscribe.push(_id);
                }
            } else {
                !this.statesSubscribes[_id].cbs.includes(cb) && this.statesSubscribes[_id].cbs.push(cb);
            }
        }

        if (toSubscribe.length && this.connected) {
            // no answer from server required
            this._socket.emit('subscribe', toSubscribe);
        }

        return new Promise((resolve, reject) => {
            if (typeof cb === 'function' && this.connected) {
                this._socket.emit(Connection.isWeb() ? 'getStates' : 'getForeignStates', id, (err, states) => {
                    err && console.error(`Cannot getForeignStates "${id}": ${JSON.stringify(err)}`);
                    states && Object.keys(states).forEach(id => cb(id, states[id]));
                    states ? resolve(null) : reject(new Error(`Cannot getForeignStates "${id}": ${JSON.stringify(err)}`));
                });
            } else {
                this.connected ? reject(new Error('callback is not a function')) : reject(new Error('not connected'));
            }
        });
    }

    /**
     * Unsubscribes all callbacks from changes of the given state.
     * @param {string | string[]} id The ioBroker state ID or array of states
     */
    /**
     * Unsubscribes the given callback from changes of the given state.
     * @param {string | string[]} id The ioBroker state ID or array of states
     * @param {ioBroker.StateChangeHandler} cb The callback.
     */
    unsubscribeState(id, cb) {
        let ids;
        if (!Array.isArray(id)) {
            ids = [id];
        } else {
            ids = id;
        }
        let toUnsubscribe = [];
        for (let i = 0; i < ids.length; i++) {
            const _id = ids[i];

            if (this.statesSubscribes[_id]) {
                if (cb) {
                    const pos = this.statesSubscribes[_id].cbs.indexOf(cb);
                    pos !== -1 && this.statesSubscribes[_id].cbs.splice(pos, 1);
                } else {
                    this.statesSubscribes[_id].cbs = [];
                }

                if (!this.statesSubscribes[_id].cbs || !this.statesSubscribes[_id].cbs.length) {
                    delete this.statesSubscribes[_id];
                    if (_id !== this.ignoreState) {
                        toUnsubscribe.push(_id);
                    }
                }
            }
        }

        if (toUnsubscribe.length && this.connected) {
            // no answer from server required
            this._socket.emit('unsubscribe', toUnsubscribe);
        }
    }

    /**
     * Subscribe to changes of the given object.
     * @param {string} id The ioBroker object ID.
     * @param {import('./types').ObjectChangeHandler} cb The callback.
     * @returns {Promise<void>}
     */
    subscribeObject(id, cb) {
        let ids;
        if (!Array.isArray(id)) {
            ids = [id];
        } else {
            ids = id;
        }
        const toSubscribe = [];
        for (let i = 0; i < ids.length; i++) {
            const _id = ids[i];
            if (!this.objectsSubscribes[_id]) {
                let reg = _id.replace(/\./g, '\\.').replace(/\*/g, '.*');
                if (!reg.includes('*')) {
                    reg += '$';
                }
                this.objectsSubscribes[_id] = { reg: new RegExp(reg), cbs: [] };
                this.objectsSubscribes[_id].cbs.push(cb);
                ids.push(_id);
            } else {
                !this.objectsSubscribes[_id].cbs.includes(cb) && this.objectsSubscribes[_id].cbs.push(cb);
            }
        }
        if (this.connected && toSubscribe.length) {
            this._socket.emit('subscribeObjects', toSubscribe);
        }

        return Promise.resolve();
    }

    /**
     * Unsubscribes all callbacks from changes of the given object.
     * @param {string} id The ioBroker object ID.
     * @returns {Promise<void>}
     */
    /**
     * Unsubscribes the given callback from changes of the given object.
     * @param {string} id The ioBroker object ID.
     * @param {import('./types').ObjectChangeHandler} cb The callback.
     * @returns {Promise<void>}
     */
    unsubscribeObject(id, cb) {
        let ids;
        if (!Array.isArray(id)) {
            ids = [id];
        } else {
            ids = id;
        }
        const toUnsubscribe = [];
        for (let i = 0; i < ids.length; i++) {
            const _id = ids[i];
            if (this.objectsSubscribes[_id]) {
                if (cb) {
                    const pos = this.objectsSubscribes[_id].cbs.indexOf(cb);
                    pos !== -1 && this.objectsSubscribes[_id].cbs.splice(pos, 1);
                } else {
                    this.objectsSubscribes[_id].cbs = [];
                }

                if (this.connected && (!this.objectsSubscribes[_id].cbs || !this.objectsSubscribes[_id].cbs.length)) {
                    delete this.objectsSubscribes[_id];
                    toUnsubscribe.push(_id);
                }
            }
        }

        if (this.connected && toUnsubscribe.length) {
            this._socket.emit('unsubscribeObjects', toUnsubscribe);
        }

        return Promise.resolve();
    }

    /**
     * Called internally.
     * @param id
     * @param fileName
     * @param size
     */
    fileChange(id, fileName, size) {
        for (const sub of Object.values(this.filesSubscribes)) {
            if (sub.regId.test(id) && sub.regFilePattern.test(fileName)) {
                for (const cb of sub.cbs) {
                    try {
                        cb(id, fileName, size);
                    } catch (e) {
                        console.error(
                            `Error by callback of fileChange: ${e}`,
                        );
                    }
                }
            }
        }
    }

    /**
     * Subscribe to changes of the files.
     * @param {string} id The ioBroker state ID for meta-object. Could be a pattern
     * @param {string} filePattern Pattern or file name, like 'main/*' or 'main/visViews.json`
     * @param {function} cb The callback.
     */
    async subscribeFiles(id, filePattern, cb) {
        if (typeof cb !== 'function') {
            throw new Error('The state change handler must be a function!');
        }
        let filePatterns
        if (Array.isArray(filePattern)) {
            filePatterns = filePattern;
        } else {
            filePatterns = [filePattern];
        }
        const toSubscribe = [];
        for (let f = 0; f < filePatterns.length; f++) {
            const pattern = filePatterns[f];
            const key = `${id}$%$${pattern}`;

            if (!this.filesSubscribes[key]) {
                this.filesSubscribes[key] = {
                    regId: new RegExp(pattern2RegEx(id)),
                    regFilePattern: new RegExp(pattern2RegEx(pattern)),
                    cbs: [cb],
                };

                toSubscribe.push(pattern);
            } else {
                !this.filesSubscribes[key].cbs.includes(cb) &&
                this.filesSubscribes[key].cbs.push(cb);
            }
        }
        if (this.connected && toSubscribe.length) {
            this._socket.emit('subscribeFiles', id, toSubscribe);
        }
    }

    /**
     * Unsubscribes the given callback from changes of files.
     * @param {string} id The ioBroker state ID.
     * @param {string} filePattern Pattern or file name, like 'main/*' or 'main/visViews.json`
     * @param {function} cb The callback.
     */
    unsubscribeFiles(id, filePattern, cb) {
        let filePatterns
        if (Array.isArray(filePattern)) {
            filePatterns = filePattern;
        } else {
            filePatterns = [filePattern];
        }
        const toUnsubscribe = [];
        for (let f = 0; f < filePatterns.length; f++) {
            const pattern = filePatterns[f];
            const key = `${id}$%$${pattern}`;
            if (this.filesSubscribes[key]) {
                const sub = this.filesSubscribes[key];
                if (cb) {
                    const pos = sub.cbs.indexOf(cb);
                    pos !== -1 && sub.cbs.splice(pos, 1);
                } else {
                    sub.cbs = [];
                }

                if (!sub.cbs || !sub.cbs.length) {
                    delete this.filesSubscribes[key];
                    this.connected &&
                    toUnsubscribe.push(pattern);
                }
            }
        }

        if (this.connected && toUnsubscribe.length) {
            this._socket.emit('unsubscribeFiles', id, toUnsubscribe);
        }
    }

    /**
     * Called internally.
     * @private
     * @param {string} id
     * @param {ioBroker.Object | null | undefined} obj
     */
    objectChange(id, obj) {
        // update main.objects cache
        if (!this.objects) {
            return;
        }

        /** @type {import("./types").OldObject} */
        let oldObj;

        let changed = false;
        if (obj) {
            if (obj._rev && this.objects[id]) {
                this.objects[id]._rev = obj._rev;
            }

            if (this.objects[id]) {
                oldObj = { _id: id, type: this.objects[id].type };
            }

            if (!this.objects[id] || JSON.stringify(this.objects[id]) !== JSON.stringify(obj)) {
                this.objects[id] = obj;
                changed = true;
            }
        } else if (this.objects[id]) {
            oldObj = { _id: id, type: this.objects[id].type };
            delete this.objects[id];
            changed = true;
        }

        Object.keys(this.objectsSubscribes).forEach(_id => {
            if (_id === id || this.objectsSubscribes[_id].reg.test(id)) {
                // @ts-ignore
                this.objectsSubscribes[_id].cbs.forEach(cb => {
                    try {
                        cb(id, obj, oldObj);
                    } catch (e) {
                        console.error(`Error by callback of objectChange: ${e}`);
                    }
                });
            }
        });

        if (changed && this.props.onObjectChange) {
            this.props.onObjectChange(id, obj);
        }
    }

    /**
     * Called internally.
     * @private
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    stateChange(id, state) {
        for (const task in this.statesSubscribes) {
            if (this.statesSubscribes.hasOwnProperty(task) && this.statesSubscribes[task].reg.test(id)) {
                this.statesSubscribes[task].cbs.forEach(cb => {
                    try {
                        cb(id, state);
                    } catch (e) {
                        console.error(`Error by callback of stateChange: ${e}`);
                    }
                });
            }
        }
    }

    /**
     * Called internally.
     * @param {string} messageType
     * @param {string} sourceInstance
     * @param {object} data
     */
    instanceMessage(messageType, sourceInstance, data) {
        if (this._instanceSubscriptions[sourceInstance]) {
            this._instanceSubscriptions[sourceInstance].forEach(sub => {
                if (sub.messageType === messageType) {
                    sub.callback(data, sourceInstance, messageType);
                }
            });
        }
    }

    /**
     * Gets all states.
     * @param {boolean} disableProgressUpdate don't call onProgress() when done
     * @returns {Promise<Record<string, ioBroker.State>>}
     */
    getStates(disableProgressUpdate) {
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }

        return new Promise((resolve, reject) =>
            this._socket.emit('getStates', (err, res) => {
                this.states = res;
                // @ts-ignore
                !disableProgressUpdate && this.onProgress(PROGRESS.STATES_LOADED);
                return err ? reject(err) : resolve(this.states);
            }));
    }

    /**
     * Gets the given state.
     * @param {string} id The state ID.
     * @returns {Promise<ioBroker.State | null | undefined>}
     */
    getState(id) {
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }
        if (id && id === this.ignoreState) {
            return Promise.resolve(this.simStates[id] || { val: null, ack: true });
        }
        return new Promise((resolve, reject) =>
            (this._socket.emit('getState', id, (err, state) => err ? reject(err) : resolve(state))));
    }

    /**
     * @deprecated since js-controller 5.0. Use files instead.
     * Gets the given binary state.
     * @param {string} id The state ID.
     * @returns {Promise<Buffer | undefined>}
     */
    getBinaryState(id) {
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }

        // the data will come in base64
        return new Promise((resolve, reject) =>
            this._socket.emit('getBinaryState', id, (err, state) => err ? reject(err) : resolve(state)));
    }

    /**
     * @deprecated since js-controller 5.0. Use files instead.
     * Sets the given binary state.
     * @param {string} id The state ID.
     * @param {string} base64 The Base64 encoded binary data.
     * @returns {Promise<void>}
     */
    setBinaryState(id, base64) {
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }

        // the data will come in base64
        return new Promise((resolve, reject) =>
            this._socket.emit('setBinaryState', id, base64, err => err ? reject(err) : resolve()));
    }

    /**
     * Sets the given state value.
     * @param {string} id The state ID.
     * @param {string | number | boolean | ioBroker.State | ioBroker.SettableState | null} val The state value.
     * @param {boolean | null} ack Acknowledge flag
     * @returns {Promise<void>}
     */
    setState(id, val, ack) {
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }

        if (typeof ack === 'boolean') {
            val = { val, ack };
        }

        // extra handling for "nothing_selected" state for vis
        if (id && id === this.ignoreState) {
            let state;

            if (typeof ack === 'boolean') {
                state = val;
            } else if (typeof val === 'object' && val.val !== undefined) {
                state = val;
            } else {
                state = {
                    val,
                    ack: false,
                    ts: Date.now(),
                    lc: Date.now(),
                    from: 'system.adapter.vis.0',
                };
            }

            this.simStates[id] = state;

            // inform subscribers about changes
            if (this.statesSubscribes[id]) {
                for (const cb of this.statesSubscribes[id].cbs) {
                    try {
                        cb(id, state);
                    } catch (e) {
                        console.error(
                            `Error by callback of stateChanged: ${e}`,
                        );
                    }
                }
            }

            return Promise.resolve();
        }

        return new Promise((resolve, reject) =>
            this._socket.emit('setState', id, val, err =>
                err ? reject(err) : resolve()));
    }

    /**
     * Gets all objects.
     * @param {(objects?: Record<string, ioBroker.Object>) => void} update Callback that is executed when all objects are retrieved.
     * @returns {void}
     */
    /**
     * Gets all objects.
     * @param {boolean} update Set to true to retrieve all objects from the server (instead of using the local cache).
     * @param {boolean} disableProgressUpdate don't call onProgress() when done
     * @returns {Promise<Record<string, ioBroker.Object>> | undefined}
     */
    getObjects(update, disableProgressUpdate) {
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }
        return new Promise((resolve, reject) => {
            if (!update && this.objects) {
                return resolve(this.objects);
            }

            this._socket.emit(Connection.isWeb() ? 'getObjects' : 'getAllObjects', (err, res) => {
                this.objects = res;
                disableProgressUpdate && this.onProgress(PROGRESS.OBJECTS_LOADED);
                err ? reject(err) : resolve(this.objects);
            });
        });
    }

    /**
     * Gets objects by list of IDs.
     * @param {string[]} list Array of object IDs to retrieve.
     * @returns {void}
     */
    getObjectsById(list) {
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }

        return new Promise((resolve, reject) =>
            this._socket.emit('getObjects', list, (err, res) =>
                err ? reject(err) : resolve(res)));
    }

    /**
     * Called internally.
     * @private
     * @param {boolean} isEnable
     */
    _subscribe(isEnable) {
        if (isEnable && !this.subscribed) {
            this.subscribed = true;
            this.autoSubscribes.forEach(id => this._socket.emit('subscribeObjects', id));
            // re subscribe objects
            Object.keys(this.objectsSubscribes).forEach(id => this._socket.emit('subscribeObjects', id));
            // re-subscribe logs
            this.autoSubscribeLog && this._socket.emit('requireLog', true);
            // re subscribe states
            Object.keys(this.statesSubscribes).forEach(id => this._socket.emit('subscribe', id));
        } else if (!isEnable && this.subscribed) {
            this.subscribed = false;
            // un-subscribe objects
            this.autoSubscribes.forEach(id => this._socket.emit('unsubscribeObjects', id));
            Object.keys(this.objectsSubscribes).forEach(id => this._socket.emit('unsubscribeObjects', id));
            // un-subscribe logs
            this.autoSubscribeLog && this._socket.emit('requireLog', false);

            // un-subscribe states
            Object.keys(this.statesSubscribes).forEach(id => this._socket.emit('unsubscribe', id));
        }
    }

    /**
     * Requests log updates.
     * @param {boolean} isEnabled Set to true to get logs.
     * @returns {Promise<void>}
     */
    requireLog(isEnabled) {
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }
        return new Promise((resolve, reject) =>
            this._socket.emit('requireLog', isEnabled, err =>
                err ? reject(err) : resolve()));
    }

    /**
     * Deletes the given object.
     * @param {string} id The object ID.
     * @param {boolean} maintenance Force deletion of non conform IDs.
     * @returns {Promise<void>}
     */
    delObject(id, maintenance) {
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }
        return new Promise((resolve, reject) =>
            this._socket.emit('delObject', id, { maintenance: !!maintenance }, err =>
                err ? reject(err) : resolve()));
    }

    /**
     * Deletes the given object and all its children.
     * @param {string} id The object ID.
     * @param {boolean} maintenance Force deletion of non conform IDs.
     * @returns {Promise<void>}
     */
    delObjects(id, maintenance) {
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }
        return new Promise((resolve, reject) =>
            this._socket.emit('delObjects', id, { maintenance: !!maintenance }, err =>
                err ? reject(err) : resolve()));
    }

    /**
     * Sets the object.
     * @param {string} id The object ID.
     * @param {ioBroker.SettableObject} obj The object.
     * @returns {Promise<void>}
     */
    setObject(id, obj) {
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }

        if (!obj) {
            return Promise.reject('Null object is not allowed');
        }

        obj = JSON.parse(JSON.stringify(obj));

        if (obj.hasOwnProperty('from')) {
            delete obj.from;
        }
        if (obj.hasOwnProperty('user')) {
            delete obj.user;
        }
        if (obj.hasOwnProperty('ts')) {
            delete obj.ts;
        }

        return new Promise((resolve, reject) =>
            this._socket.emit('setObject', id, obj, err =>
                err ? reject(err) : resolve()));
    }

    /**
     * Gets the object with the given id from the server.
     * @param {string} id The object ID.
     * @returns {ioBroker.GetObjectPromise} The object.
     */
    getObject(id) {
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }
        if (id && id === this.ignoreState) {
            return Promise.resolve({
                _id: this.ignoreState,
                type: 'state',
                common: {
                    name: 'ignored state',
                    type: 'mixed',
                },
            });
        }

        return new Promise((resolve, reject) =>
            this._socket.emit('getObject', id, (err, obj) =>
                (err ? reject(err) : resolve(obj))));
    }

    /**
     * Get all adapter instances.
     * @param {boolean} [update] Force update.
     * @returns {Promise<ioBroker.Object[]>}
     */
    /**
     * Get all instances of the given adapter.
     * @param {string} adapter The name of the adapter.
     * @param {boolean} [update] Force update.
     * @returns {Promise<ioBroker.Object[]>}
     */
    getAdapterInstances(adapter, update) {
        if (typeof adapter === 'boolean') {
            update = adapter;
            adapter = '';
        }
        adapter = adapter || '';

        if (!update && this._promises[`instances_${adapter}`]) {
            return this._promises[`instances_${adapter}`];
        }

        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }

        this._promises[`instances_${adapter}`] = new Promise((resolve, reject) => {
            let timeout = setTimeout(() => {
                timeout = null;
                this.getObjectView(
                    `system.adapter.${adapter ? `${adapter}.` : ''}`,
                    `system.adapter.${adapter ? `${adapter}.` : ''}\u9999`,
                    'instance',
                )
                    .then(items => resolve(Object.keys(items).map(id => fixAdminUI(items[id]))))
                    .catch(e => reject(e));
            }, TIMEOUT_FOR_ADMIN4);

            this._socket.emit('getAdapterInstances', adapter, (err, instances) => {
                if (timeout) {
                    clearTimeout(timeout);
                    timeout = null;
                    return err ? reject(err) : resolve(instances);
                }
            });
        });

        return this._promises[`instances_${adapter}`];
    }

    /**
     * Get all adapters.
     * @param {boolean} [update] Force update.
     * @returns {Promise<ioBroker.Object[]>}
     */
    /**
     * Get adapters with the given name.
     * @param {string} adapter The name of the adapter.
     * @param {boolean} [update] Force update.
     * @returns {Promise<ioBroker.Object[]>}
     */
    getAdapters(adapter, update) {
        if (Connection.isWeb()) {
            return Promise.reject('Allowed only in admin');
        }

        if (typeof adapter === 'boolean') {
            update = adapter;
            adapter = '';
        }

        adapter = adapter || '';

        if (!update && this._promises[`adapter_${adapter}`]) {
            return this._promises[`adapter_${adapter}`];
        }

        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }

        this._promises[`adapter_${adapter}`] = new Promise((resolve, reject) => {
            let timeout = setTimeout(() => {
                timeout = null;
                this.getObjectView(
                    `system.adapter.${adapter}.`,
                    `system.adapter.${adapter}.\u9999`,
                    'adapter',
                )
                    .then(items => resolve(Object.keys(items).map(id => fixAdminUI(items[id]))))
                    .catch(e => reject(e));
            }, TIMEOUT_FOR_ADMIN4);

            this._socket.emit('getAdapters', adapter, (err, adapters) => {
                if (timeout) {
                    clearTimeout(timeout);
                    timeout = null;
                    return err ? reject(err) : resolve(adapters);
                }
            });
        });

        return this._promises[`adapter_${adapter}`];
    }

    /**
     * Called internally.
     * @private
     * @param {any[]} objs
     * @param {(err?: any) => void} cb
     */
    _renameGroups(objs, cb) {
        if (!objs || !objs.length) {
            cb && cb();
        } else {
            const obj = objs.pop();
            const oldId = obj._id;
            obj._id = obj.newId;
            delete obj.newId;

            this.setObject(obj._id, obj)
                .then(() => this.delObject(oldId))
                .then(() => setTimeout(() => this._renameGroups(objs, cb), 0))
                .catch(err => cb && cb(err));
        }
    }

    /**
     * Rename a group.
     * @param {string} id The id.
     * @param {string} newId The new id.
     * @param {string | { [lang in ioBroker.Languages]?: string; }} newName The new name.
     */
    renameGroup(id, newId, newName) {
        if (Connection.isWeb()) {
            return Promise.reject('Allowed only in admin');
        }

        return this.getGroups(true)
            .then(groups => {
                if (groups.length) {
                    // find all elements
                    const groupsToRename = groups
                        .filter(group => group._id.startsWith(`${id}.`));

                    groupsToRename.forEach(group => group.newId = newId + group._id.substring(id.length));

                    return new Promise((resolve, reject) =>
                        this._renameGroups(groupsToRename, err => err ? reject(err) : resolve()))
                        .then(() => {
                            const obj = groups.find(group => group._id === id);

                            if (obj) {
                                obj._id = newId;
                                if (newName !== undefined) {
                                    obj.common = obj.common || {};
                                    obj.common.name = newName;
                                }

                                return this.setObject(obj._id, obj)
                                    .then(() => this.delObject(id));
                            }
                        });
                }
            });
    }

    /**
     * Sends a message to a specific instance or all instances of some specific adapter.
     * @param {string} instance The instance to send this message to.
     * @param {string} [command] Command name of the target instance.
     * @param {ioBroker.MessagePayload} [data] The message data to send.
     * @returns {Promise<ioBroker.Message | undefined>}
     */
    sendTo(instance, command, data) {
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }
        return new Promise(resolve =>
            this._socket.emit('sendTo', instance, command, data, result =>
                resolve(result)));
    }

    /**
     * Extend an object and create it if it might not exist.
     * @param {string} id The id.
     * @param {ioBroker.PartialObject} obj The object.
     */
    extendObject(id, obj) {
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }

        obj = JSON.parse(JSON.stringify(obj));

        if (obj.hasOwnProperty('from')) {
            delete obj.from;
        }
        if (obj.hasOwnProperty('user')) {
            delete obj.user;
        }
        if (obj.hasOwnProperty('ts')) {
            delete obj.ts;
        }

        return new Promise((resolve, reject) =>
            this._socket.emit('extendObject', id, obj, err => (err ? reject(err) : resolve())));
    }

    /**
     * Register a handler for log messages.
     * @param {(message: string) => void} handler The handler.
     */
    registerLogHandler(handler) {
        !this.onLogHandlers.includes(handler) && this.onLogHandlers.push(handler);
    }

    /**
     * Unregister a handler for log messages.
     * @param {(message: string) => void} handler The handler.
     */
    unregisterLogHandler(handler) {
        const pos = this.onLogHandlers.indexOf(handler);
        pos !== -1 && this.onLogHandlers.splice(pos, 1);
    }

    /**
     * Register a handler for the connection state.
     * @param {(connected: boolean) => void} handler The handler.
     */
    registerConnectionHandler(handler) {
        !this.onConnectionHandlers.includes(handler) && this.onConnectionHandlers.push(handler);
    }

    /**
     * Unregister a handler for the connection state.
     * @param {(connected: boolean) => void} handler The handler.
     */
    unregisterConnectionHandler(handler) {
        const pos = this.onConnectionHandlers.indexOf(handler);
        pos !== -1 && this.onConnectionHandlers.splice(pos, 1);
    }

    /**
     * Set the handler for standard output of a command.
     * @param {(id: string, text: string) => void} handler The handler.
     */
    registerCmdStdoutHandler(handler) {
        this.onCmdStdoutHandler = handler;
    }

    /**
     * Unset the handler for standard output of a command.
     * @param {(id: string, text: string) => void} handler The handler.
     */
    unregisterCmdStdoutHandler(/* handler */) {
        this.onCmdStdoutHandler = null;
    }

    /**
     * Set the handler for standard error of a command.
     * @param {(id: string, text: string) => void} handler The handler.
     */
    registerCmdStderrHandler(handler) {
        this.onCmdStderrHandler = handler;
    }

    /**
     * Unset the handler for standard error of a command.
     * @param {(id: string, text: string) => void} handler The handler.
     */
    unregisterCmdStderrHandler(/* handler */) {
        this.onCmdStderrHandler = null;
    }

    /**
     * Set the handler for exit of a command.
     * @param {(id: string, exitCode: number) => void} handler The handler.
     */
    registerCmdExitHandler(handler) {
        this.onCmdExitHandler = handler;
    }

    /**
     * Unset the handler for exit of a command.
     * @param {(id: string, exitCode: number) => void} handler The handler.
     */
    unregisterCmdExitHandler(/* handler */) {
        this.onCmdExitHandler = null;
    }

    /**
     * Get all enums with the given name.
     * @param {string} [_enum] The name of the enum
     * @param {boolean} [update] Force update.
     * @returns {Promise<Record<string, ioBroker.Object>>}
     */
    getEnums(_enum, update) {
        if (!update && this._promises[`enums_${_enum || 'all'}`]) {
            return this._promises[`enums_${_enum || 'all'}`];
        }

        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }

        this._promises[`enums_${_enum || 'all'}`] = new Promise((resolve, reject) => {
            this._socket.emit('getObjectView', 'system', 'enum', { startkey: `enum.${_enum || ''}`, endkey: `enum.${_enum ? `${_enum}.` : ''}\u9999` }, (err, res) => {
                if (!err && res) {
                    const _res = {};
                    for (let i = 0; i < res.rows.length; i++) {
                        if (_enum && res.rows[i].id === `enum.${_enum}`) {
                            continue;
                        }
                        _res[res.rows[i].id] = res.rows[i].value;
                    }
                    resolve(_res);
                } else {
                    reject(err);
                }
            });
        });

        return this._promises[`enums_${_enum || 'all'}`];
    }

    /**
     * Query a predefined object view.
     * @param design design - 'system' or other designs like `custom`.
     * @param type The type of object.
     * @param start The start ID.
     * @param [end] The end ID.
     */
    getObjectViewCustom(design, type, start, end) {
        return new Promise((resolve, reject) => {
            this._socket.emit('getObjectView', design, type, { startkey: start, endkey: end }, (err, res) => {
                if (!err) {
                    const _res = {};
                    if (res && res.rows) {
                        for (let i = 0; i < res.rows.length; i++) {
                            _res[res.rows[i].id] = res.rows[i].value;
                        }
                    }
                    resolve(_res);
                } else {
                    reject(err);
                }
            });
        });
    }

    /**
     * Query a predefined object view.
     * @param type The type of object.
     * @param start The start ID.
     * @param [end] The end ID.
     */
    getObjectViewSystem(type, start, end) {
        return this.getObjectViewCustom('system', type, start, end);
    }

    /**
     * @deprecated since version 1.1.15, cause parameter order does not match backend
     * Query a predefined object view.
     * @param {string} start The start ID.
     * @param {string} end The end ID.
     * @param {string} type The type of object.
     * @returns {Promise<Record<string, ioBroker.Object>>}
     */
    getObjectView(start, end, type) {
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }

        start = start || '';
        end   = end   || '\u9999';
        return this.getObjectViewCustom('system', type, start, end);
    }

    /**
     * Get the stored certificates.
     * @param {boolean} [update] Force update.
     * @returns {Promise<{name: string; type: 'public' | 'private' | 'chained'}[]>}
     */
    getCertificates(update) {
        if (Connection.isWeb()) {
            return Promise.reject('Allowed only in admin');
        }

        if (this._promises.cert && !update) {
            return this._promises.cert;
        }

        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }

        this._promises.cert = this.getObject('system.certificates')
            .then(res => {
                const certs = [];
                if (res && res.native && res.native.certificates) {
                    Object.keys(res.native.certificates).forEach(c => {
                        const cert = res.native.certificates[c];
                        if (!cert) {
                            return;
                        }
                        const _cert = {
                            name: c,
                            type: '',
                        };
                        // If it is a filename, it could be everything
                        if (cert.length < 700 && (cert.includes('/') || cert.includes('\\'))) {
                            if (c.toLowerCase().includes('private')) {
                                _cert.type = 'private';
                            } else if (cert.toLowerCase().includes('private')) {
                                _cert.type = 'private';
                            } else if (c.toLowerCase().includes('public')) {
                                _cert.type = 'public';
                            } else if (cert.toLowerCase().includes('public')) {
                                _cert.type = 'public';
                            }
                            certs.push(_cert);
                        } else {
                            _cert.type = (cert.substring(0, '-----BEGIN RSA PRIVATE KEY'.length) === '-----BEGIN RSA PRIVATE KEY' || cert.substring(0, '-----BEGIN PRIVATE KEY'.length) === '-----BEGIN PRIVATE KEY') ? 'private' : 'public';

                            if (_cert.type === 'public') {
                                const m = cert.split('-----END CERTIFICATE-----');
                                if (m.filter(t => t.replace(/\r\n|\r|\n/, '').trim()).length > 1) {
                                    _cert.type = 'chained';
                                }
                            }

                            certs.push(_cert);
                        }
                    });
                }
                return certs;
            });

        return this._promises.cert;
    }

    /**
     * Get the logs from a host (only for admin connection).
     * @param {string} host
     * @param {number} [linesNumber]
     * @returns {Promise<string[]>}
     */
    getLogs(host, linesNumber) {
        if (Connection.isWeb()) {
            return Promise.reject('Allowed only in admin');
        }

        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }

        return new Promise(resolve =>
            this._socket.emit('sendToHost', host, 'getLogs', linesNumber || 200, lines =>
                resolve(lines)));
    }

    /**
     * Get the log files (only for admin connection).
     * @returns {Promise<string[]>}
     */
    getLogsFiles(host) {
        if (Connection.isWeb()) {
            return Promise.reject('Allowed only in admin');
        }
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }
        return new Promise((resolve, reject) =>
            this._socket.emit('readLogs', host, (err, files) =>
                err ? reject(err) : resolve(files)));
    }

    /**
     * Delete the logs from a host (only for admin connection).
     * @param {string} host
     * @returns {Promise<void>}
     */
    delLogs(host) {
        if (Connection.isWeb()) {
            return Promise.reject('Allowed only in admin');
        }
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }
        return new Promise((resolve, reject) =>
            this._socket.emit('sendToHost', host, 'delLogs', null, error =>
                error ? reject(error) : resolve()));
    }

    /**
     * Read the meta items.
     * @returns {Promise<ioBroker.Object[]>}
     */
    readMetaItems() {
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }
        return new Promise((resolve, reject) =>
            this._socket.emit('getObjectView', 'system', 'meta', { startkey: '', endkey: '\u9999' }, (err, objs) =>
                err ? reject(err) : resolve(objs.rows && objs.rows.map(obj => obj.value))));
    }

    /**
     * Read the directory of an adapter.
     * @param {string} adapter The adapter name.
     * @param {string} fileName The directory name.
     * @returns {Promise<ioBroker.ReadDirResult[]>}
     */
    readDir(adapter, fileName) {
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }
        return new Promise((resolve, reject) =>
            this._socket.emit('readDir', adapter, fileName, (err, files) =>
                err ? reject(err) : resolve(files)));
    }

    /**
     * Read a file of an adapter.
     * @param {string} adapter The adapter name.
     * @param {string} fileName The file name.
     * @param {boolean} base64 If it must be a base64 format
     * @returns {Promise<string>}
     */
    readFile(adapter, fileName, base64) {
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }
        return new Promise((resolve, reject) => {
            if (!base64) {
                this._socket.emit('readFile', adapter, fileName, (err, data, type) => {
                    //@ts-ignore
                    err ? reject(err) : resolve({ data, type });
                });
            } else {
                this._socket.emit('readFile64', adapter, fileName, base64, (err, data) =>
                    err ? reject(err) : resolve(data));
            }
        });
    }

    /**
     * Write a file of an adapter.
     * @param {string} adapter The adapter name.
     * @param {string} fileName The file name.
     * @param {Buffer | string} data The data (if it's a Buffer, it will be converted to Base64).
     * @returns {Promise<void>}
     */
    writeFile64(adapter, fileName, data) {
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }
        return new Promise((resolve, reject) => {
            if (typeof data === 'string') {
                this._socket.emit('writeFile', adapter, fileName, data, err =>
                    err ? reject(err) : resolve());
            } else {
                const base64 = btoa(
                    new Uint8Array(data)
                        .reduce((data, byte) => data + String.fromCharCode(byte), ''),
                );

                this._socket.emit('writeFile64', adapter, fileName, base64, err =>
                    err ? reject(err) : resolve());
            }
        });
    }

    /**
     * Delete a file of an adapter.
     * @param {string} adapter The adapter name.
     * @param {string} fileName The file name.
     * @returns {Promise<void>}
     */
    deleteFile(adapter, fileName) {
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }
        return new Promise((resolve, reject) =>
            this._socket.emit('unlink', adapter, fileName, err =>
                err ? reject(err) : resolve()));
    }

    /**
     * Delete a folder of an adapter.
     * All files in folder will be deleted.
     * @param {string} adapter The adapter name.
     * @param {string} folderName The folder name.
     * @returns {Promise<void>}
     */
    deleteFolder(adapter, folderName) {
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }
        return new Promise((resolve, reject) =>
            this._socket.emit('deleteFolder', adapter, folderName, err =>
                err ? reject(err) : resolve()));
    }

    /**
     * Get the list of all hosts.
     * @param {boolean} [update] Force update.
     * @returns {Promise<ioBroker.Object[]>}
     */
    getHosts(update) {
        if (Connection.isWeb()) {
            return Promise.reject('Allowed only in admin');
        }
        if (!update && this._promises.hosts) {
            return this._promises.hosts;
        }

        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }

        this._promises.hosts = new Promise((resolve, reject) =>
            this._socket.emit(
                'getObjectView',
                'system',
                'host',
                { startkey: 'system.host.', endkey: 'system.host.\u9999' },
                (err, doc) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(doc.rows.map(item => item.value));
                    }
                }));

        return this._promises.hosts;
    }

    /**
     * Get the list of all users.
     * @param {boolean} [update] Force update.
     * @returns {Promise<ioBroker.Object[]>}
     */
    getUsers(update) {
        if (Connection.isWeb()) {
            return Promise.reject('Allowed only in admin');
        }
        if (!update && this._promises.users) {
            return this._promises.users;
        }
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }

        this._promises.users = new Promise((resolve, reject) =>
            this._socket.emit(
                'getObjectView',
                'system',
                'user',
                { startkey: 'system.user.', endkey: 'system.user.\u9999' },
                (err, doc) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(doc.rows.map(item => item.value));
                    }
                }));

        return this._promises.users;
    }

    /**
     * Get the list of all groups.
     * @param {boolean} [update] Force update.
     * @returns {Promise<ioBroker.Object[]>}
     */
    getGroups(update) {
        if (!update && this._promises.groups) {
            return this._promises.groups;
        }
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }

        this._promises.groups = new Promise((resolve, reject) =>
            this._socket.emit(
                'getObjectView',
                'system',
                'group',
                { startkey: 'system.group.', endkey: 'system.group.\u9999' },
                (err, doc) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(doc.rows.map(item => item.value));
                    }
                }));

        return this._promises.groups;
    }

    /**
     * Get the host information.
     * @param {string} host
     * @param {boolean} [update] Force update.
     * @param {number} [timeoutMs] optional read timeout.
     * @returns {Promise<any>}
     */
    getHostInfo(host, update, timeoutMs) {
        if (Connection.isWeb()) {
            return Promise.reject('Allowed only in admin');
        }
        if (!host.startsWith('system.host.')) {
            host += `system.host.${host}`;
        }
        const cache = `hostInfo${host}`;

        if (!update && this._promises[cache]) {
            return this._promises[cache];
        }

        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }

        this._promises[cache] = new Promise((resolve, reject) => {
            let timeout = setTimeout(() => {
                if (timeout) {
                    timeout = null;
                    reject('getHostInfo timeout');
                }
            }, timeoutMs || this.props.cmdTimeout);

            this._socket.emit('sendToHost', host, 'getHostInfo', null, data => {
                if (timeout) {
                    clearTimeout(timeout);
                    timeout = null;
                    if (data === PERMISSION_ERROR) {
                        reject('May not read "getHostInfo"');
                    } else if (!data) {
                        reject('Cannot read "getHostInfo"');
                    } else {
                        resolve(data);
                    }
                }
            });
        });

        return this._promises[cache];
    }

    /**
     * Get the host information (short version).
     * @param {string} host
     * @param {boolean} [update] Force update.
     * @param {number} [timeoutMs] optional read timeout.
     * @returns {Promise<any>}
     */
    getHostInfoShort(host, update, timeoutMs) {
        if (Connection.isWeb()) {
            return Promise.reject('Allowed only in admin');
        }
        if (!host.startsWith('system.host.')) {
            host += `system.host.${host}`;
        }
        const cache = `hostInfoShort${host}`;

        if (!update && this._promises[cache]) {
            return this._promises[cache];
        }

        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }

        this._promises[cache] = new Promise((resolve, reject) => {
            let timeout = setTimeout(() => {
                if (timeout) {
                    timeout = null;
                    reject('hostInfoShort timeout');
                }
            }, timeoutMs || this.props.cmdTimeout);

            this._socket.emit('sendToHost', host, 'getHostInfoShort', null, data => {
                if (timeout) {
                    clearTimeout(timeout);
                    timeout = null;
                    if (data === PERMISSION_ERROR) {
                        reject('May not read "getHostInfoShort"');
                    } else if (!data) {
                        reject('Cannot read "getHostInfoShort"');
                    } else {
                        resolve(data);
                    }
                }
            });
        });

        return this._promises[cache];
    }

    /**
     * Get the repository.
     * @param {string} host
     * @param {any} [args]
     * @param {boolean} [update] Force update.
     * @param {number} [timeoutMs] timeout in ms.
     * @returns {Promise<any>}
     */
    getRepository(host, args, update, timeoutMs) {
        if (Connection.isWeb()) {
            return Promise.reject('Allowed only in admin');
        }
        if (!update && this._promises.repo) {
            return this._promises.repo;
        }

        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }

        if (!host.startsWith('system.host.')) {
            host += `system.host.${host}`;
        }

        this._promises.repo = new Promise((resolve, reject) => {
            let timeout = setTimeout(() => {
                if (timeout) {
                    timeout = null;
                    reject('getRepository timeout');
                }
            }, timeoutMs || this.props.cmdTimeout);

            this._socket.emit('sendToHost', host, 'getRepository', args, data => {
                if (timeout) {
                    clearTimeout(timeout);
                    timeout = null;
                    if (data === PERMISSION_ERROR) {
                        reject('May not read "getRepository"');
                    } else if (!data) {
                        reject('Cannot read "getRepository"');
                    } else {
                        resolve(data);
                    }
                }
            });
        });

        return this._promises.repo;
    }

    /**
     * Get the installed.
     * @param {string} host
     * @param {boolean} [update] Force update.
     * @param {number} [cmdTimeout] timeout in ms (optional)
     * @returns {Promise<any>}
     */
    getInstalled(host, update, cmdTimeout) {
        if (Connection.isWeb()) {
            return Promise.reject('Allowed only in admin');
        }

        this._promises.installed = this._promises.installed || {};

        if (!update && this._promises.installed[host]) {
            return this._promises.installed[host];
        }

        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }

        if (!host.startsWith('system.host.')) {
            host += `system.host.${host}`;
        }

        this._promises.installed[host] = new Promise((resolve, reject) => {
            let timeout = setTimeout(() => {
                if (timeout) {
                    timeout = null;
                    reject('getInstalled timeout');
                }
            }, cmdTimeout || this.props.cmdTimeout);

            this._socket.emit('sendToHost', host, 'getInstalled', null, data => {
                if (timeout) {
                    clearTimeout(timeout);
                    timeout = null;
                    if (data === PERMISSION_ERROR) {
                        reject('May not read "getInstalled"');
                    } else if (!data) {
                        reject('Cannot read "getInstalled"');
                    } else {
                        resolve(data);
                    }
                }
            });
        });

        return this._promises.installed[host];
    }

    /**
     * Rename file or folder in ioBroker DB
     * @param adapter instance name
     * @param oldName current file name, e.g main/vis-views.json
     * @param newName new file name, e.g main/vis-views-new.json
     */
    rename(adapter, oldName, newName) {
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }
        return new Promise((resolve, reject) =>
            this._socket.emit('rename', adapter, oldName, newName, err => err ? reject(err) : resolve()));
    }

    /**
     * Rename file in ioBroker DB
     * @param adapter instance name
     * @param oldName current file name, e.g, main/vis-views.json
     * @param newName new file name, e.g, main/vis-views-new.json
     */
    renameFile(adapter, oldName, newName) {
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }
        return new Promise((resolve, reject) =>
            this._socket.emit('renameFile', adapter, oldName, newName, err => err ? reject(err) : resolve()));
    }

    /**
     * Execute a command on a host.
     * @param {string} host The host name.
     * @param {string} cmd The command.
     * @param {string} cmdId The command ID.
     * @param {number} cmdTimeout Timeout of command in ms
     * @returns {Promise<void>}
     */
    cmdExec(host, cmd, cmdId, cmdTimeout) {
        if (Connection.isWeb()) {
            return Promise.reject('Allowed only in admin');
        }
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }

        if (!host.startsWith(host)) {
            host += `system.host.${host}`;
        }

        return new Promise((resolve, reject) => {
            let timeout = cmdTimeout && setTimeout(() => {
                if (timeout) {
                    timeout = null;
                    reject('cmdExec timeout');
                }
            }, cmdTimeout);

            this._socket.emit('cmdExec', host, cmdId, cmd, null, err => {
                if (!cmdTimeout || timeout) {
                    timeout && clearTimeout(timeout);
                    timeout = null;
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                }
            });
        });
    }

    /**
     * Checks if a given feature is supported.
     * @param {string} feature The feature to check.
     * @param {boolean} [update] Force update.
     * @returns {Promise<any>}
     */
    checkFeatureSupported(feature, update) {
        const cache = `supportedFeatures_${feature}`;
        if (!update && this._promises[cache]) {
            return this._promises[cache];
        }

        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }

        this._promises[cache] = new Promise((resolve, reject) =>
            this._socket.emit('checkFeatureSupported', feature, (err, features) => {
                err ? reject(err) : resolve(features);
            }));

        return this._promises[cache];
    }

    /**
     * Read the base settings of a given host.
     * @param {string} host
     * @returns {Promise<any>}
     */
    readBaseSettings(host) {
        if (Connection.isWeb()) {
            return Promise.reject('Allowed only in admin');
        }
        return this.checkFeatureSupported('CONTROLLER_READWRITE_BASE_SETTINGS')
            .then(result => {
                if (result) {
                    if (!this.connected) {
                        return Promise.reject(NOT_CONNECTED);
                    }
                    return new Promise((resolve, reject) => {
                        let timeout = setTimeout(() => {
                            if (timeout) {
                                timeout = null;
                                reject('readBaseSettings timeout');
                            }
                        }, this.props.cmdTimeout);

                        if (host.startsWith('system.host.')) {
                            host = host.replace(/^system\.host\./, '');
                        }

                        this._socket.emit('sendToHost', host, 'readBaseSettings', null, data => {
                            if (timeout) {
                                clearTimeout(timeout);
                                timeout = null;

                                if (data === PERMISSION_ERROR) {
                                    reject('May not read "BaseSettings"');
                                } else if (!data) {
                                    reject('Cannot read "BaseSettings"');
                                } else {
                                    resolve(data);
                                }
                            }
                        });
                    });
                }

                return Promise.reject('Not supported');
            });
    }

    /**
     * Write the base settings of a given host.
     * @param {string} host
     * @param {any} config
     * @returns {Promise<any>}
     */
    writeBaseSettings(host, config) {
        if (Connection.isWeb()) {
            return Promise.reject('Allowed only in admin');
        }
        return this.checkFeatureSupported('CONTROLLER_READWRITE_BASE_SETTINGS')
            .then(result => {
                if (result) {
                    if (!this.connected) {
                        return Promise.reject(NOT_CONNECTED);
                    }
                    return new Promise((resolve, reject) => {
                        let timeout = setTimeout(() => {
                            if (timeout) {
                                timeout = null;
                                reject('writeBaseSettings timeout');
                            }
                        }, this.props.cmdTimeout);

                        this._socket.emit('sendToHost', host, 'writeBaseSettings', config, data => {
                            if (timeout) {
                                clearTimeout(timeout);
                                timeout = null;

                                if (data === PERMISSION_ERROR) {
                                    reject(new Error('May not write "BaseSettings"'));
                                } else if (!data) {
                                    reject(new Error('Cannot write "BaseSettings"'));
                                } else {
                                    resolve(data);
                                }
                            }
                        });
                    });
                }

                return Promise.reject(new Error('Not supported'));
            });
    }

    /**
     * Send command to restart the iobroker on host
     * @param {string} host
     * @returns {Promise<any>}
     */
    restartController(host) {
        if (Connection.isWeb()) {
            return Promise.reject('Allowed only in admin');
        }
        return new Promise((resolve, reject) => {
            this._socket.emit('sendToHost', host, 'restartController', null, error => {
                error ? reject(error) : resolve(true);
            });
        });
    }

    /**
     * Read statistics information from host
     * @param {string} host
     * @param {string} typeOfDiag one of none, normal, no-city, extended
     * @returns {Promise<any>}
     */
    getDiagData(host, typeOfDiag) {
        if (Connection.isWeb()) {
            return Promise.reject('Allowed only in admin');
        }
        return new Promise(resolve => {
            this._socket.emit('sendToHost', host, 'getDiagData', typeOfDiag, result =>
                resolve(result));
        });
    }

    /**
     * Read all states (which might not belong to this adapter) which match the given pattern.
     * @param {string} pattern
     * @returns {ioBroker.GetStatesPromise}
     */
    getForeignStates(pattern) {
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }
        if (Connection.isWeb()) {
            return new Promise((resolve, reject) =>
                this._socket.emit('getStates', pattern || '*', (err, states) =>
                    err ? reject(err) : resolve(states)));
        }

        return new Promise((resolve, reject) =>
            this._socket.emit('getForeignStates', pattern || '*', (err, states) =>
                err ? reject(err) : resolve(states)));
    }

    /**
     * Get foreign objects by pattern, by specific type and resolve their enums.
     * @param {string} pattern
     * @param {string} [type]
     * @returns {ioBroker.GetObjectsPromise}
     */
    getForeignObjects(pattern, type) {
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }
        return new Promise((resolve, reject) =>
            this._socket.emit('getForeignObjects', pattern || '*', type, (err, states) =>
                err ? reject(err) : resolve(states)));
    }

    /**
     * Gets the system configuration.
     * @param {boolean} [update] Force update.
     * @returns {Promise<ioBroker.OtherObject>}
     */
    getSystemConfig(update) {
        if (!update && this._promises.systemConfig) {
            return this._promises.systemConfig;
        }

        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }

        this._promises.systemConfig = this.getObject('system.config')
            .then(systemConfig => {
                // @ts-ignore
                systemConfig = systemConfig || {};
                // @ts-ignore
                systemConfig.common = systemConfig.common || {};
                // @ts-ignore
                systemConfig.native = systemConfig.native || {};
                return systemConfig;
            });

        return this._promises.systemConfig;
    }

    /**
     * Sets the system configuration.
     * @param {ioBroker.SettableObjectWorker<ioBroker.OtherObject>} obj
     * @returns {Promise<ioBroker.SettableObjectWorker<ioBroker.OtherObject>>}
     */
    setSystemConfig(obj) {
        return this.setObject('system.config', obj)
            .then(() => this._promises.systemConfig = Promise.resolve(obj));
    }

    /**
     * Get the raw socket.io socket.
     * @returns {any}
     */
    getRawSocket() {
        return this._socket;
    }

    /**
     * Get the history of a given state.
     * @param {string} id
     * @param {ioBroker.GetHistoryOptions} options
     * @returns {Promise<ioBroker.GetHistoryResult>}
     */
    getHistory(id, options) {
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }

        return new Promise((resolve, reject) =>
            this._socket.emit('getHistory', id, options, (err, values) =>
                err ? reject(err) : resolve(values)));
    }

    /**
     * Get the history of a given state.
     * @param {string} id
     * @param {ioBroker.GetHistoryOptions} options
     * @returns {Promise<{values: ioBroker.GetHistoryResult; sesionId: string; stepIgnore: number}>}
     */
    getHistoryEx(id, options) {
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }

        return new Promise((resolve, reject) =>
            this._socket.emit('getHistory', id, options, (err, values, stepIgnore, sessionId) =>
                err ? reject(err) : resolve({ values, sessionId, stepIgnore })));
    }

    /**
     * Change the password of the given user.
     * @param {string} user
     * @param {string} password
     * @returns {Promise<void>}
     */
    changePassword(user, password) {
        if (Connection.isWeb()) {
            return Promise.reject('Allowed only in admin');
        }
        return new Promise((resolve, reject) =>
            this._socket.emit('changePassword', user, password, err =>
                err ? reject(err) : resolve()));
    }

    /**
     * Get the IP addresses of the given host.
     * @param {string} host
     * @param {boolean} [update] Force update.
     * @returns {Promise<string[]>}
     */
    getIpAddresses(host, update) {
        if (Connection.isWeb()) {
            return Promise.reject('Allowed only in admin');
        }
        if (!host.startsWith('system.host.')) {
            host = `system.host.${host}`;
        }

        if (!update && this._promises[`IPs_${host}`]) {
            return this._promises[`IPs_${host}`];
        }
        this._promises[`IPs_${host}`] = this.getObject(host)
            .then(obj => obj && obj.common ? obj.common.address || [] : []);

        return this._promises[`IPs_${host}`];
    }

    /**
     * Get the IP addresses with interface names of the given host or find host by IP.
     * @param {string} ipOrHostName
     * @param {boolean} [update] Force update.
     * @returns {Promise<any[<name, address, family>]>}
     */
    getHostByIp(ipOrHostName, update) {
        if (Connection.isWeb()) {
            return Promise.reject('Allowed only in admin');
        }
        if (ipOrHostName.startsWith('system.host.')) {
            ipOrHostName = ipOrHostName.replace(/^system\.host\./, '');
        }
        const cache = `rIPs_${ipOrHostName}`;

        if (!update && this._promises[cache]) {
            return this._promises[cache];
        }
        this._promises[cache] = new Promise(resolve =>
            this._socket.emit('getHostByIp', ipOrHostName, (ip, host) => {
                const IPs4 = [{ name: '[IPv4] 0.0.0.0 - Listen on all IPs', address: '0.0.0.0', family: 'ipv4' }];
                const IPs6 = [{ name: '[IPv6] :: - Listen on all IPs',      address: '::',      family: 'ipv6' }];
                if (host?.native?.hardware?.networkInterfaces) {
                    for (const eth in host.native.hardware.networkInterfaces) {
                        if (!host.native.hardware.networkInterfaces.hasOwnProperty(eth)) {
                            continue;
                        }
                        for (let num = 0; num < host.native.hardware.networkInterfaces[eth].length; num++) {
                            if (host.native.hardware.networkInterfaces[eth][num].family !== 'IPv6') {
                                IPs4.push({ name: `[${host.native.hardware.networkInterfaces[eth][num].family}] ${host.native.hardware.networkInterfaces[eth][num].address} - ${eth}`, address: host.native.hardware.networkInterfaces[eth][num].address, family: 'ipv4' });
                            } else {
                                IPs6.push({ name: `[${host.native.hardware.networkInterfaces[eth][num].family}] ${host.native.hardware.networkInterfaces[eth][num].address} - ${eth}`, address: host.native.hardware.networkInterfaces[eth][num].address, family: 'ipv6' });
                            }
                        }
                    }
                }
                for (let i = 0; i < IPs6.length; i++) {
                    IPs4.push(IPs6[i]);
                }
                resolve(IPs4);
            }));

        return this._promises[cache];
    }

    /**
     * Encrypt a text
     * @param {string} text
     * @returns {Promise<string>}
     */
    encrypt(text) {
        if (Connection.isWeb()) {
            return Promise.reject('Allowed only in admin');
        }
        return new Promise((resolve, reject) =>
            this._socket.emit('encrypt', text, (err, text) =>
                err ? reject(err) : resolve(text)));
    }

    /**
     * Decrypt a text
     * @param {string} encryptedText
     * @returns {Promise<string>}
     */
    decrypt(encryptedText) {
        if (Connection.isWeb()) {
            return Promise.reject('Allowed only in admin');
        }
        return new Promise((resolve, reject) =>
            this._socket.emit('decrypt', encryptedText, (err, text) =>
                err ? reject(err) : resolve(text)));
    }

    /**
     * Gets the version.
     * @returns {Promise<{version: string; serverName: string}>}
     */
    getVersion(update) {
        if (update && this._promises.version) {
            this._promises.version = null;
        }

        this._promises.version = this._promises.version || new Promise((resolve, reject) =>
            this._socket.emit('getVersion', (err, version, serverName) => {
                // support of old socket.io
                if (err && !version && typeof err === 'string' && err.match(/\d+\.\d+\.\d+/)) {
                    resolve({ version: err, serverName: 'socketio' });
                } else {
                    return err ? reject(err) : resolve({ version, serverName });
                }
            }));

        return this._promises.version;
    }

    /**
     * Gets the web server name.
     * @returns {Promise<string>}
     */
    getWebServerName() {
        this._promises.webName = this._promises.webName || new Promise((resolve, reject) =>
            this._socket.emit('getAdapterName', (err, name) =>
                err ? reject(err) : resolve(name)));

        return this._promises.webName;
    }

    /**
     * Gets the admin version.
     * @deprecated use getVersion()
     * @returns {Promise<{version: string; serverName: string}>}
     */
    getAdminVersion() {
        console.log('Deprecated: use getVersion');
        return this.getVersion();
    }

    /**
     * Change access rights for file
     * @param {string} [adapter] adapter name
     * @param {string} [filename] file name with full path. it could be like vis.0/*
     * @param {object} [options] like {mode: 0x644}
     * @returns {Promise<{entries: array}>}
     */
    chmodFile(adapter, filename, options) {
        if (Connection.isWeb()) {
            return Promise.reject('Allowed only in admin');
        }
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }

        return new Promise((resolve, reject) =>
            this._socket.emit('chmodFile', adapter, filename, options, (err, entries, id) =>
                err ? reject(err) : resolve({ entries, id })));
    }

    /**
     * Change owner or/and owner group for file
     * @param {string} [adapter] adapter name
     * @param {string} [filename] file name with full path. it could be like vis.0/*
     * @param {object} [options] like {owner: 'newOwner', ownerGroup: 'newGroup'}
     * @returns {Promise<{entries: array}>}
     */
    chownFile(adapter, filename, options) {
        if (Connection.isWeb()) {
            return Promise.reject('Allowed only in admin');
        }
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }

        return new Promise((resolve, reject) =>
            this._socket.emit('chownFile', adapter, filename, options, (err, entries, id) =>
                err ? reject(err) : resolve({ entries, id })));
    }

    /**
     * Check if the file exists
     * @param {string} [adapter] adapter name
     * @param {string} [filename] file name with full path. it could be like vis.0/*
     * @returns {Promise<boolean>}
     */
    fileExists(adapter, filename) {
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }

        return new Promise((resolve, reject) =>
            this._socket.emit('fileExists', adapter, filename, (err, exists) =>
                err ? reject(err) : resolve(exists)));
    }

    /**
     * Get the alarm notifications from a host (only for admin connection).
     * @param {string} host
     * @param {string} [category] - optional
     * @returns {Promise<any>}
     */
    getNotifications(host, category) {
        if (Connection.isWeb()) {
            return Promise.reject('Allowed only in admin');
        }

        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }
        return new Promise(resolve =>
            this._socket.emit('sendToHost', host, 'getNotifications', { category }, notifications =>
                resolve(notifications)));
    }

    /**
     * Clear the alarm notifications on a host (only for admin connection).
     * @param {string} host
     * @param {string} [category] - optional
     * @returns {Promise<any>}
     */
    clearNotifications(host, category) {
        if (Connection.isWeb()) {
            return Promise.reject('Allowed only in admin');
        }

        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }
        return new Promise(resolve =>
            this._socket.emit('sendToHost', host, 'clearNotifications', { category }, notifications =>
                resolve(notifications)));
    }

    /**
     * Read if only easy mode is allowed  (only for admin connection).
     * @returns {Promise<boolean>}
     */
    getIsEasyModeStrict() {
        if (Connection.isWeb()) {
            return Promise.reject('Allowed only in admin');
        }
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }
        return new Promise((resolve, reject) =>
            this._socket.emit('getIsEasyModeStrict', (error, isStrict) =>
                error ? reject(error) : resolve(isStrict)));
    }

    /**
     * Read easy mode configuration (only for admin connection).
     * @returns {Promise<any>}
     */
    getEasyMode() {
        if (Connection.isWeb()) {
            return Promise.reject('Allowed only in admin');
        }
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }
        return new Promise((resolve, reject) =>
            this._socket.emit('getEasyMode', (error, config) =>
                error ? reject(error) : resolve(config)));
    }

    /**
     * Read current user
     * @returns {Promise<string>}
     */
    getCurrentUser() {
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }

        return new Promise(resolve =>
            this._socket.emit('authEnabled', (isSecure, user) =>
                resolve(user)));
    }

    getCurrentSession(cmdTimeout) {
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }

        return new Promise((resolve, reject) => {
            const controller = new AbortController();

            let timeout = setTimeout(() => {
                if (timeout) {
                    timeout = null;
                    controller.abort();
                    reject('getCurrentSession timeout');
                }
            }, cmdTimeout || 5000);

            return fetch('./session', { signal: controller.signal })
                .then(res => res.json())
                .then(json => {
                    if (timeout) {
                        clearTimeout(timeout);
                        timeout = null;
                        resolve(json);
                    }
                })
                .catch(e =>
                    reject('getCurrentSession: ' + e));
        });
    }

    /**
     * Read adapter ratings
     * @returns {Promise<any>}
     */
    getRatings(update) {
        if (Connection.isWeb()) {
            return Promise.reject('Allowed only in admin');
        }
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }
        return new Promise((resolve, reject) =>
            this._socket.emit('getRatings', update, (err, ratings) =>
                err ? reject(err) : resolve(ratings)));
    }

    /**
     * Read current web, socketio or admin namespace, like admin.0
     * @returns {Promise<string>}
     */
    getCurrentInstance() {
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }

        this._promises.currentInstance = this._promises.currentInstance ||
            new Promise((resolve, reject) =>
                this._socket.emit('getCurrentInstance', (err, namespace) =>
                    err ? reject(err) : resolve(namespace)));

        return this._promises.currentInstance;
    }

    // returns very optimized information for adapters to minimize connection load
    getCompactAdapters(update) {
        if (Connection.isWeb()) {
            return Promise.reject('Allowed only in admin');
        }
        if (!update && this._promises.compactAdapters) {
            return this._promises.compactAdapters;
        }
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }
        this._promises.compactAdapters = new Promise((resolve, reject) =>
            this._socket.emit('getCompactAdapters', (err, adapters) =>
                err ? reject(err) : resolve(adapters)));

        return this._promises.compactAdapters;
    }

    getAdaptersResetCache(adapter) {
        adapter = adapter || '';
        this._promises.compactAdapters = null;
        this._promises['adapter_' + adapter] = null;
    }

    // returns very optimized information for adapters to minimize connection load
    getCompactInstances(update) {
        if (Connection.isWeb()) {
            return Promise.reject('Allowed only in admin');
        }
        if (!update && this._promises.compactInstances) {
            return this._promises.compactInstances;
        }
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }

        this._promises.compactInstances = new Promise((resolve, reject) =>
            this._socket.emit('getCompactInstances', (err, instances) =>
                err ? reject(err) : resolve(instances)));

        return this._promises.compactInstances;
    }

    getAdapternInstancesResetCache(adapter) {
        adapter = adapter || '';
        this._promises.compactInstances = null;
        this._promises['instances_' + adapter] = null;
    }

    // returns very optimized information for adapters to minimize connection load
    // reads only version of installed adapter
    getCompactInstalled(host, update, cmdTimeout) {
        if (Connection.isWeb()) {
            return Promise.reject('Allowed only in admin');
        }

        this._promises.installedCompact = this._promises.installedCompact || {};

        if (!update && this._promises.installedCompact[host]) {
            return this._promises.installedCompact[host];
        }

        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }

        if (!host.startsWith('system.host.')) {
            host += 'system.host.' + host;
        }

        this._promises.installedCompact[host] = new Promise((resolve, reject) => {
            let timeout = setTimeout(() => {
                if (timeout) {
                    timeout = null;
                    reject('getCompactInstalled timeout');
                }
            }, cmdTimeout || this.props.cmdTimeout);

            this._socket.emit('getCompactInstalled', host, data => {
                if (timeout) {
                    clearTimeout(timeout);
                    timeout = null;
                    if (data === PERMISSION_ERROR) {
                        reject('May not read "getCompactInstalled"');
                    } else if (!data) {
                        reject('Cannot read "getCompactInstalled"');
                    } else {
                        resolve(data);
                    }
                }
            });
        });

        return this._promises.installedCompact[host];
    }

    // returns very optimized information for adapters to minimize connection load
    // reads only version of installed adapter
    getCompactSystemRepositories(update, cmdTimeout) {
        if (Connection.isWeb()) {
            return Promise.reject('Allowed only in admin');
        }

        this._promises.installedCompact = this._promises.installedCompact || {};

        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }

        this._promises.getCompactSystemRepositories = new Promise((resolve, reject) => {
            let timeout = setTimeout(() => {
                if (timeout) {
                    timeout = null;
                    reject('getCompactSystemRepositories timeout');
                }
            }, cmdTimeout || this.props.cmdTimeout);

            this._socket.emit('getCompactSystemRepositories', data => {
                if (timeout) {
                    clearTimeout(timeout);
                    timeout = null;
                    if (data === PERMISSION_ERROR) {
                        reject('May not read "getCompactSystemRepositories"');
                    } else if (!data) {
                        reject('Cannot read "getCompactSystemRepositories"');
                    } else {
                        resolve(data);
                    }
                }
            });
        });

        return this._promises.getCompactSystemRepositories;
    }

    getInstalledResetCache(host) {
        if (this._promises.installedCompact) {
            this._promises.installedCompact[host] = null;
        }
        if (this._promises.installed) {
            this._promises.installed[host] = null;
        }
    }

    // returns very optimized information for adapters to minimize connection load
    getCompactSystemConfig(update) {
        if (!update && this._promises.systemConfigCommon) {
            return this._promises.systemConfigCommon;
        }

        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }

        this._promises.systemConfigCommon = new Promise((resolve, reject) =>
            this._socket.emit('getCompactSystemConfig', (err, systemConfig) =>
                err ? reject(err) : resolve(systemConfig)));

        return this._promises.systemConfigCommon;
    }

    /**
     * Get the repository in compact form (only version and icon).
     * @param {string} host
     * @param {boolean} [update] Force update.
     * @param {number} [timeoutMs] timeout in ms.
     * @returns {Promise<any>}
     */
    getCompactRepository(host, update, timeoutMs) {
        if (Connection.isWeb()) {
            return Promise.reject('Allowed only in admin');
        }

        if (!update && this._promises.repoCompact) {
            return this._promises.repoCompact;
        }

        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }

        if (!host.startsWith('system.host.')) {
            host += 'system.host.' + host;
        }

        this._promises.repoCompact = new Promise((resolve, reject) => {
            let timeout = setTimeout(() => {
                if (timeout) {
                    timeout = null;
                    reject('getCompactRepository timeout');
                }
            }, timeoutMs || this.props.cmdTimeout);

            this._socket.emit('getCompactRepository', host, data => {
                if (timeout) {
                    clearTimeout(timeout);
                    timeout = null;
                    if (data === PERMISSION_ERROR) {
                        reject('May not read "getCompactRepository"');
                    } else if (!data) {
                        reject('Cannot read "getCompactRepository"');
                    } else {
                        resolve(data);
                    }
                }
            });
        });

        return this._promises.repoCompact;
    }

    getInstalledResetCache(/* host */) {
        this._promises.repoCompact = null;
        this._promises.repo = null;
    }

    /**
     * Get the list of all hosts in compact form (only _id, common.name, common.icon, common.color, native.hardware.networkInterfaces)
     * @param {boolean} [update] Force update.
     * @returns {Promise<ioBroker.Object[]>}
     */
    getCompactHosts(update) {
        if (Connection.isWeb()) {
            return Promise.reject('Allowed only in admin');
        }
        if (!update && this._promises.hostsCompact) {
            return this._promises.hostsCompact;
        }

        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }

        this._promises.hostsCompact = new Promise((resolve, reject) =>
            this._socket.emit('getCompactHosts', (err, hosts) =>
                err ? reject(err) : resolve(hosts)));

        return this._promises.hostsCompact;
    }

    /**
     * Get uuid
     * @returns {Promise<ioBroker.Object[]>}
     */
    getUuid() {
        if (this._promises.uuid) {
            return this._promises.uuid;
        }

        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }

        this._promises.uuid = this.getObject('system.meta.uuid')
            //@ts-ignore
            .then(obj => obj?.native?.uuid);

        return this._promises.uuid;
    }

    /**
     * Subscribe on instance message
     * @param {string} [targetInstance] instance, like 'cameras.0'
     * @param {string} [messageType] message type like 'startCamera/cam3'
     * @param {object} [data] optional data object
     * @param {function} [callback] message handler
     * @returns {Promise<null>}
     */
    subscribeOnInstance(targetInstance, messageType, data, callback) {
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }
        return new Promise((resolve, reject) =>
            this._socket.emit('clientSubscribe', targetInstance, messageType, data, (err, result) => {
                if (err) {
                    reject(err);
                } else if (result && result.error) {
                    reject(result.error);
                } else {
                    if (!targetInstance.startsWith('system.adapter.')) {
                        targetInstance = `system.adapter.${targetInstance}`;
                    }
                    // save callback
                    this._instanceSubscriptions[targetInstance] = this._instanceSubscriptions[targetInstance] || [];
                    if (!this._instanceSubscriptions[targetInstance].find(sub =>
                        sub.messageType === messageType &&
                        sub.callback === callback)
                    ) {
                        this._instanceSubscriptions[targetInstance].push({
                            messageType,
                            callback,
                        });
                    }
                    resolve(result);
                }
            })
        );
    }

    /**
     * Unsubscribe from instance message
     * @param {string} [targetInstance] instance, like 'cameras.0'
     * @param {string} [messageType] message type like 'startCamera/cam3'
     * @param {function} [callback] message handler. Could be null if all callbacks for this messageType should be unsubscribed
     * @returns {Promise<boolean>}
     */
    unsubscribeFromInstance(targetInstance, messageType, callback) {
        if (!targetInstance.startsWith('system.adapter.')) {
            targetInstance = `system.adapter.${targetInstance}`;
        }
        let deleted;
        const promiseResults = [];
        do {
            deleted = false;
            const index = this._instanceSubscriptions[targetInstance]?.findIndex(sub =>
                (!messageType || sub.messageType === messageType) && (!callback || sub.callback === callback));

            if (index !== undefined && index !== null && index !== -1) {
                deleted = true;
                // remember messageType
                const _messageType =
                    this._instanceSubscriptions[targetInstance][index].messageType;

                this._instanceSubscriptions[targetInstance].splice(index, 1);
                if (!this._instanceSubscriptions[targetInstance].length) {
                    delete this._instanceSubscriptions[targetInstance];
                }

                // try to find another subscription for this instance and messageType
                const found = this._instanceSubscriptions[targetInstance] &&
                    this._instanceSubscriptions[targetInstance].find(sub => sub.messageType === _messageType);

                if (!found) {
                    promiseResults.push(new Promise((resolve, reject) =>
                        this._socket.emit('clientUnsubscribe', targetInstance, messageType, (err, wasSubscribed) => {
                            if (err) {
                                reject(err);
                            } else {
                                resolve(wasSubscribed);
                            }
                        })
                    ));
                }
            }
        } while (deleted && (!callback || !messageType));

        if (promiseResults.length) {
            return Promise.all(promiseResults)
                .then(results => results.find(result => result) || false);
        }

        return Promise.resolve(false);
    }

    /**
     * Send log to ioBroker log
     * @param {string} [text] Log text
     * @param {string} [level] `info`, `debug`, `warn`, `error` or `silly`
     * @returns {void}
     */
    log(text, level) {
        text && this._socket.emit('log', text, level || 'debug');
    }

    /**
     * Logout current user
     * @returns {Promise<null>}
     */
    logout() {
        if (!this.connected) {
            return Promise.reject(NOT_CONNECTED);
        }

        return new Promise((resolve, reject) =>
            this._socket.emit('logout', err =>
                err ? reject(err) : resolve(null)));
    }
    /**
     * This is special method for vis.
     * It is used to not send to server the changes about "nothing_selected" state
     * @param id The state that has to be ignored by communication
     */
    setStateToIgnore(id) {
        this.ignoreState = id;
    }
}

Connection.Connection = {
    onLog: PropTypes.func,
    onReady: PropTypes.func,
    onProgress: PropTypes.func,
};

export default Connection;
