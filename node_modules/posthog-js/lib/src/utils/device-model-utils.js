"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDeviceModel = getDeviceModel;
var core_1 = require("@posthog/core");
var globals_1 = require("./globals");
var logger_1 = require("./logger");
/**
 * Reads the hardware model from `navigator.userAgentData.getHighEntropyValues(['model'])`.
 *
 * Only meaningful on Android Chromium — `undefined` on Safari/Firefox and an empty string on desktop
 * (both treated as absent). A Permissions-Policy block rejects with `NotAllowedError`, which we catch
 * and return `undefined`.
 */
function getDeviceModel() {
    return __awaiter(this, void 0, void 0, function () {
        var uaData, hints, model, e_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    uaData = globals_1.navigator === null || globals_1.navigator === void 0 ? void 0 : globals_1.navigator.userAgentData;
                    if (!(uaData === null || uaData === void 0 ? void 0 : uaData.getHighEntropyValues)) {
                        return [2 /*return*/, undefined];
                    }
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, uaData.getHighEntropyValues(['model'])];
                case 2:
                    hints = _a.sent();
                    model = hints === null || hints === void 0 ? void 0 : hints.model;
                    return [2 /*return*/, (0, core_1.isString)(model) && model.length > 0 ? model : undefined];
                case 3:
                    e_1 = _a.sent();
                    logger_1.logger.info('Unable to resolve $device_model from userAgentData.getHighEntropyValues', e_1);
                    return [2 /*return*/, undefined];
                case 4: return [2 /*return*/];
            }
        });
    });
}
//# sourceMappingURL=device-model-utils.js.map