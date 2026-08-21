"use strict";
// Portions of this file are derived from getsentry/sentry-javascript
// Copyright (c) 2012 Functional Software, Inc. dba Sentry
// Licensed under the MIT License: https://github.com/getsentry/sentry-javascript/blob/develop/LICENSE
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNativeImplementation = getNativeImplementation;
exports.getNativeMutationObserverImplementation = getNativeMutationObserverImplementation;
var type_utils_1 = require("./type-utils");
var core_1 = require("@posthog/core");
var logger_1 = require("./logger");
var cachedImplementations = {};
function getNativeImplementation(name, assignableWindow) {
    var cached = cachedImplementations[name];
    if (cached) {
        return cached;
    }
    var impl = assignableWindow[name];
    if ((0, core_1.isNativeFunction)(impl) && !(0, type_utils_1.isAngularZonePresent)()) {
        return (cachedImplementations[name] = impl.bind(assignableWindow));
    }
    var document = assignableWindow.document;
    if (document && (0, core_1.isFunction)(document.createElement)) {
        try {
            var sandbox = document.createElement('iframe');
            sandbox.hidden = true;
            document.head.appendChild(sandbox);
            var contentWindow = sandbox.contentWindow;
            if (contentWindow && contentWindow[name]) {
                impl = contentWindow[name];
            }
            document.head.removeChild(sandbox);
        }
        catch (e) {
            // Could not create sandbox iframe, just use assignableWindow.xxx
            logger_1.logger.warn("Could not create sandbox iframe for ".concat(name, " check, bailing to assignableWindow.").concat(name, ": "), e);
        }
    }
    // Sanity check: This _should_ not happen, but if it does, we just skip caching...
    // This can happen e.g. in tests where fetch may not be available in the env, or similar.
    if (!impl || !(0, core_1.isFunction)(impl)) {
        return impl;
    }
    return (cachedImplementations[name] = impl.bind(assignableWindow));
}
function getNativeMutationObserverImplementation(assignableWindow) {
    return getNativeImplementation('MutationObserver', assignableWindow);
}
//# sourceMappingURL=prototype-utils.js.map