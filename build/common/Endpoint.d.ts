import { Schema } from './binary/schema/Schema';
type EndpointOptions = {
    requestSchema?: Schema;
    responseSchema?: Schema;
    name?: string;
};
type EndpointDefinition<Request = any, Response = any> = EndpointOptions & {
    id: number;
    __requestType?: Request;
    __responseType?: Response;
};
type Endpoint<Request = any, Response = any> = number | EndpointDefinition<Request, Response>;
declare const MAX_UINT32 = 4294967295;
declare function isValidUInt32(value: number): boolean;
declare function assertValidEndpointId(id: number): void;
declare enum ResponseStatus {
    Ok = 1,
    Error = 2
}
declare enum RequestPolicy {
    Allow = 1,
    Dedupe = 2,
    Replace = 3
}
declare class RequestError extends Error {
    code: string;
    requestId?: number;
    endpointId?: number;
    payload?: any;
    constructor(message: string, code: string, options?: {
        requestId?: number;
        endpointId?: number;
        payload?: any;
    });
}
declare function defineEndpoint<Request = any, Response = any>(id: number, options?: EndpointOptions): EndpointDefinition<Request, Response>;
declare function getEndpointId(endpoint: Endpoint): number;
declare function getEndpointDefinition<Request = any, Response = any>(endpoint: Endpoint<Request, Response>): EndpointDefinition<Request, Response> | null;
export { Endpoint, EndpointDefinition, EndpointOptions, MAX_UINT32, RequestError, RequestPolicy, ResponseStatus, assertValidEndpointId, defineEndpoint, getEndpointDefinition, getEndpointId, isValidUInt32 };
//# sourceMappingURL=Endpoint.d.ts.map