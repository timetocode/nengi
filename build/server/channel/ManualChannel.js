"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ManualChannel = void 0;
const Channel_1 = require("./Channel");
class ManualChannel extends Channel_1.Channel {
    constructor(localState, options = {}) {
        super(localState, options);
        // Snapshot writers key off this marker to use the manual mutation log
        // instead of scanning visible entities and diffing every schema property.
        this.manualUpdateChannelMode = true;
        this.manualPropNids = [];
        this.manualPropSchemas = [];
        this.manualPropValues = [];
        this.manualGroupNids = [];
        this.manualGroupSchemas = [];
        this.manualGroupValueOffsets = [];
        this.manualGroupValues = [];
    }
    createEntityWriter(ntype, schema) {
        const props = Object.create(null);
        const groups = Object.create(null);
        const writers = {
            ntype,
            schema,
            props,
            groups
        };
        const aliases = new Set();
        const blockedAliases = new Set(['ntype', 'schema', 'props', 'groups']);
        const addAlias = (name, writer) => {
            if (blockedAliases.has(name)) {
                return;
            }
            if (aliases.has(name)) {
                delete writers[name];
                blockedAliases.add(name);
                return;
            }
            aliases.add(name);
            writers[name] = writer;
        };
        const propNids = this.manualPropNids;
        const propSchemas = this.manualPropSchemas;
        const propValues = this.manualPropValues;
        // Generated closures close over the channel arrays directly. This is
        // deliberately small and unsafe: validation belongs in separate debug
        // modes, while the default writer path should be just array appends.
        const propNames = Object.keys(schema.props);
        for (let i = 0; i < propNames.length; i++) {
            const name = propNames[i];
            const prop = schema.props[name];
            props[name] = function writeManualProp(entity, value) {
                propNids.push(entity.nid);
                propSchemas.push(prop);
                propValues.push(value);
            };
            addAlias(name, props[name]);
        }
        const groupNids = this.manualGroupNids;
        const groupSchemas = this.manualGroupSchemas;
        const groupValueOffsets = this.manualGroupValueOffsets;
        const groupValues = this.manualGroupValues;
        for (let i = 0; i < schema.updateGroups.length; i++) {
            const group = schema.updateGroups[i];
            if (group.props.length === 1) {
                groups[group.name] = function writeManualGroup1(entity, v0) {
                    groupNids.push(entity.nid);
                    groupSchemas.push(group);
                    groupValueOffsets.push(groupValues.length);
                    groupValues.push(v0);
                };
            }
            else if (group.props.length === 2) {
                groups[group.name] = function writeManualGroup2(entity, v0, v1) {
                    groupNids.push(entity.nid);
                    groupSchemas.push(group);
                    groupValueOffsets.push(groupValues.length);
                    groupValues.push(v0, v1);
                };
            }
            else if (group.props.length === 3) {
                groups[group.name] = function writeManualGroup3(entity, v0, v1, v2) {
                    groupNids.push(entity.nid);
                    groupSchemas.push(group);
                    groupValueOffsets.push(groupValues.length);
                    groupValues.push(v0, v1, v2);
                };
            }
            else if (group.props.length === 4) {
                groups[group.name] = function writeManualGroup4(entity, v0, v1, v2, v3) {
                    groupNids.push(entity.nid);
                    groupSchemas.push(group);
                    groupValueOffsets.push(groupValues.length);
                    groupValues.push(v0, v1, v2, v3);
                };
            }
            else {
                groups[group.name] = function writeManualGroup(entity) {
                    groupNids.push(entity.nid);
                    groupSchemas.push(group);
                    groupValueOffsets.push(groupValues.length);
                    for (let j = 0; j < group.props.length; j++) {
                        groupValues.push(arguments[j + 1]);
                    }
                };
            }
            addAlias(group.name, groups[group.name]);
        }
        return writers;
    }
    clearSnapshotDeltas() {
        super.clearSnapshotDeltas();
        this.manualPropNids.length = 0;
        this.manualPropSchemas.length = 0;
        this.manualPropValues.length = 0;
        this.manualGroupNids.length = 0;
        this.manualGroupSchemas.length = 0;
        this.manualGroupValueOffsets.length = 0;
        this.manualGroupValues.length = 0;
    }
    destroy() {
        super.destroy();
        this.manualPropNids.length = 0;
        this.manualPropSchemas.length = 0;
        this.manualPropValues.length = 0;
        this.manualGroupNids.length = 0;
        this.manualGroupSchemas.length = 0;
        this.manualGroupValueOffsets.length = 0;
        this.manualGroupValues.length = 0;
    }
}
exports.ManualChannel = ManualChannel;
