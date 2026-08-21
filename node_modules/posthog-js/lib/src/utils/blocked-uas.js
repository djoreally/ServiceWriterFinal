"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isLikelyBot = exports.isBlockedUA = exports.DEFAULT_BLOCKED_UA_STRS = void 0;
// Re-export shared bot detection logic from @posthog/core
var core_1 = require("@posthog/core");
var core_2 = require("@posthog/core");
Object.defineProperty(exports, "DEFAULT_BLOCKED_UA_STRS", { enumerable: true, get: function () { return core_2.DEFAULT_BLOCKED_UA_STRS; } });
Object.defineProperty(exports, "isBlockedUA", { enumerable: true, get: function () { return core_2.isBlockedUA; } });
var isLikelyBot = function (navigator, customBlockedUserAgents) {
    if (!navigator) {
        return false;
    }
    var ua = navigator.userAgent;
    if (ua) {
        if ((0, core_1.isBlockedUA)(ua, customBlockedUserAgents)) {
            return true;
        }
    }
    try {
        // eslint-disable-next-line compat/compat
        var uaData = navigator === null || navigator === void 0 ? void 0 : navigator.userAgentData;
        if ((uaData === null || uaData === void 0 ? void 0 : uaData.brands) &&
            uaData.brands.some(function (brandObj) { return (0, core_1.isBlockedUA)(brandObj === null || brandObj === void 0 ? void 0 : brandObj.brand, customBlockedUserAgents); })) {
            return true;
        }
    }
    catch (_a) {
        // ignore the error, we were using experimental browser features
    }
    return !!navigator.webdriver;
    // There's some more enhancements we could make in this area, e.g. it's possible to check if Chrome dev tools are
    // open, which will detect some bots that are trying to mask themselves and might get past the checks above.
    // However, this would give false positives for actual humans who have dev tools open.
    // We could also use navigator.userAgentData.getHighEntropyValues() to detect bots — it doesn't
    // prompt; access is gated by the `ch-ua-high-entropy-values` Permissions-Policy and a blocked
    // call rejects with NotAllowedError.
    // See https://developer.mozilla.org/en-US/docs/Web/API/NavigatorUAData/getHighEntropyValues
};
exports.isLikelyBot = isLikelyBot;
//# sourceMappingURL=blocked-uas.js.map