"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMessage = exports.createEntity = void 0;
exports.defineEntitySchema = defineEntitySchema;
exports.defineMessageSchema = defineMessageSchema;
exports.definePayloadSchema = definePayloadSchema;
const Schema_1 = require("./Schema");
const BinaryExt_1 = require("../BinaryExt");
function createPropSpec(key, prop, type, interp) {
    const entry = { key, prop, type, interp };
    Object.defineProperty(entry, 'binary', {
        value: (0, BinaryExt_1.binaryGet)(type),
        enumerable: false
    });
    return entry;
}
function normalizeUpdateGroups(options) {
    if (!(options === null || options === void 0 ? void 0 : options.updateGroups)) {
        return [];
    }
    if (Array.isArray(options.updateGroups)) {
        return options.updateGroups;
    }
    return Object.entries(options.updateGroups).map(([name, definition]) => {
        if (Array.isArray(definition)) {
            return { name, props: definition };
        }
        return { name, props: definition.props, mode: definition.mode };
    });
}
function compileUpdateGroups(compiled, options) {
    var _a, _b;
    const groups = normalizeUpdateGroups(options);
    for (let i = 0; i < groups.length; i++) {
        const definition = groups[i];
        const name = Array.isArray(definition) ? `group${i}` : ((_a = definition.name) !== null && _a !== void 0 ? _a : `group${i}`);
        const propNames = Array.isArray(definition) ? definition : definition.props;
        const mode = Array.isArray(definition) ? 'any' : ((_b = definition.mode) !== null && _b !== void 0 ? _b : 'any');
        if (propNames.length < 2) {
            throw new Error(`Update group "${name}" must include at least two properties.`);
        }
        if (compiled.updateGroups.length > 255) {
            throw new Error('A schema may define at most 256 update groups.');
        }
        const props = propNames.map(propName => {
            const prop = compiled.props[propName];
            if (!prop) {
                throw new Error(`Update group "${name}" references unknown property "${propName}".`);
            }
            if (prop.updateGroup) {
                throw new Error(`Property "${propName}" is already in update group "${prop.updateGroup.name}".`);
            }
            return prop;
        });
        const group = {
            key: compiled.updateGroups.length,
            name,
            mode,
            props,
            lastEmitGeneration: 0
        };
        props.forEach(prop => {
            prop.updateGroup = group;
        });
        compiled.updateGroups.push(group);
    }
}
function compileSchema(schema, kind) {
    var _a;
    const compiled = new Schema_1.Schema(kind);
    let index = 0;
    const options = schema.$options;
    for (const prop in schema) {
        if (prop === '$options') {
            continue;
        }
        if ((kind === 'entity' || kind === 'message') && prop === 'ntype') {
            throw new Error('No need to define `ntype` in a schema, this is added by the network envelope.');
        }
        if (kind === 'entity' && prop === 'nid') {
            throw new Error('No need to define `nid` in an entity schema, this is added by the entity envelope.');
        }
        const spec = schema[prop];
        if (typeof spec === 'object' && spec !== null && 'type' in spec) {
            // probably the syntax x: { type: Binary.Float32, interp: true }
            const entry = createPropSpec(index, prop, spec.type, (_a = spec.interp) !== null && _a !== void 0 ? _a : false);
            compiled.keys.push(entry);
            compiled.props[prop] = entry;
            index++;
        }
        else {
            // probably the syntax x: Binary.Float32
            const entry = createPropSpec(index, prop, spec, false);
            compiled.keys.push(entry);
            compiled.props[prop] = entry;
            index++;
        }
    }
    if (kind === 'entity') {
        compileUpdateGroups(compiled, options);
    }
    return compiled;
}
function defineEntitySchema(schema) {
    return compileSchema(schema, 'entity');
}
function defineMessageSchema(schema) {
    return compileSchema(schema, 'message');
}
function definePayloadSchema(schema) {
    return compileSchema(schema, 'payload');
}
const createEntity = defineEntitySchema;
exports.createEntity = createEntity;
const createMessage = defineMessageSchema;
exports.createMessage = createMessage;
