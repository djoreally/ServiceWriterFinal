"use strict";
// Portions of this file are derived from getsentry/sentry-javascript
// Copyright (c) 2012 Functional Software, Inc. dba Sentry
// Licensed under the MIT License: https://github.com/getsentry/sentry-javascript/blob/develop/LICENSE
Object.defineProperty(exports, "__esModule", { value: true });
exports.Compression = exports.severityLevels = void 0;
// levels originally copied from Sentry to work with the sentry integration
// and to avoid relying on a frequently changing @sentry/types dependency
// but provided as an array of literal types, so we can constrain the level below
exports.severityLevels = ['fatal', 'error', 'warning', 'log', 'info', 'debug'];
exports.Compression = {
    GZipJS: 'gzip-js',
    Base64: 'base64',
};
//# sourceMappingURL=types.js.map