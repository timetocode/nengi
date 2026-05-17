"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResponseStatus = exports.RequestPolicy = exports.RequestError = exports.MAX_UINT32 = void 0;
exports.assertValidEndpointId = assertValidEndpointId;
exports.defineEndpoint = defineEndpoint;
exports.getEndpointDefinition = getEndpointDefinition;
exports.getEndpointId = getEndpointId;
exports.isValidUInt32 = isValidUInt32;
const MAX_UINT32 = 0xffffffff;
exports.MAX_UINT32 = MAX_UINT32;
function isValidUInt32(value) {
    return Number.isSafeInteger(value) && value >= 0 && value <= MAX_UINT32;
}
function assertValidEndpointId(id) {
    if (!isValidUInt32(id) || id === 0) {
        throw new Error(`Endpoint id must be an integer from 1 to ${MAX_UINT32}.`);
    }
}
var ResponseStatus;
(function (ResponseStatus) {
    ResponseStatus[ResponseStatus["Ok"] = 1] = "Ok";
    ResponseStatus[ResponseStatus["Error"] = 2] = "Error";
})(ResponseStatus || (exports.ResponseStatus = ResponseStatus = {}));
var RequestPolicy;
(function (RequestPolicy) {
    RequestPolicy[RequestPolicy["Allow"] = 1] = "Allow";
    RequestPolicy[RequestPolicy["Dedupe"] = 2] = "Dedupe";
    RequestPolicy[RequestPolicy["Replace"] = 3] = "Replace";
})(RequestPolicy || (exports.RequestPolicy = RequestPolicy = {}));
class RequestError extends Error {
    constructor(message, code, options = {}) {
        super(message);
        this.name = 'RequestError';
        this.code = code;
        this.requestId = options.requestId;
        this.endpointId = options.endpointId;
        this.payload = options.payload;
    }
}
exports.RequestError = RequestError;
function defineEndpoint(id, options = {}) {
    assertValidEndpointId(id);
    return Object.assign({ id }, options);
}
function getEndpointId(endpoint) {
    const id = typeof endpoint === 'number' ? endpoint : endpoint.id;
    assertValidEndpointId(id);
    return id;
}
function getEndpointDefinition(endpoint) {
    return typeof endpoint === 'number' ? null : endpoint;
}
