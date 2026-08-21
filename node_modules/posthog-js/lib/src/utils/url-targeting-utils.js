"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyUrlTargetingOverride = applyUrlTargetingOverride;
exports.getTargetingUrl = getTargetingUrl;
var globals_1 = require("./globals");
var core_1 = require("@posthog/core");
var logger_1 = require("./logger");
/**
 * Applies the `get_current_url` config hook to an already-resolved URL. Returns `defaultUrl`
 * unchanged when no override is configured, or if the override throws or returns a
 * non-string/empty value.
 *
 * Use this when the caller already has its own URL source (e.g. web experiments read
 * `window.location` via a mockable indirection); otherwise prefer `getTargetingUrl`.
 */
function applyUrlTargetingOverride(instance, defaultUrl) {
    var _a;
    var override = (_a = instance === null || instance === void 0 ? void 0 : instance.config) === null || _a === void 0 ? void 0 : _a.get_current_url;
    if (!(0, core_1.isFunction)(override)) {
        return defaultUrl;
    }
    try {
        var result = override(defaultUrl);
        return (0, core_1.isString)(result) && result ? result : defaultUrl;
    }
    catch (e) {
        logger_1.logger.error('Error in get_current_url, falling back to window.location.href', e);
        return defaultUrl;
    }
}
/**
 * Resolves the URL used for client-side URL targeting: session replay URL triggers, the
 * session replay URL blocklist, survey URL conditions, product tour URL conditions, and web
 * experiment URL conditions.
 *
 * Defaults to `window.location.href`, but honors the `get_current_url` config hook so apps
 * that rewrite their URL (e.g. Electron/desktop builds, or `$current_url` rewrites in
 * `before_send`) can make targeting match the logical URL instead of the raw browser URL.
 *
 * Returns `undefined` when there is no URL available (e.g. non-browser environments).
 *
 * Called on every rrweb event by the replay URL triggers/blocklist, so a configured
 * `get_current_url` override should stay cheap.
 */
function getTargetingUrl(instance) {
    var _a;
    var defaultUrl = (_a = globals_1.window === null || globals_1.window === void 0 ? void 0 : globals_1.window.location) === null || _a === void 0 ? void 0 : _a.href;
    return (0, core_1.isUndefined)(defaultUrl) ? undefined : applyUrlTargetingOverride(instance, defaultUrl);
}
//# sourceMappingURL=url-targeting-utils.js.map