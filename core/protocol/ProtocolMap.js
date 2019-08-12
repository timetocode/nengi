import Protocol from './Protocol.js';
import EntityProtocol from './EntityProtocol.js';
import MessageProtocol from './MessageProtocol.js';
import LocalEventProtocol from './LocalEventProtocol.js';
import CommandProtocol from './CommandProtocol.js';
import ComponentProtocol from './ComponentProtocol.js';

function ProtocolMap(config, metaConfig) {
    this.lookupByIndex = new Map()
    this.lookupByProtocol = new Map()
    this.protocolIndex = 0

    //this.processProtocols(meta, config, )

    this.lookupMetaByIndex = new Map()
    this.lookupMetaByProtocol = new Map()

    this.processMeta(config, metaConfig, 'messages')

    
    this.processProtocols(config, 'basics', Protocol)
    this.processProtocols(config, 'entities', EntityProtocol)
    this.processProtocols(config, 'components', EntityProtocol)
    this.processProtocols(config, 'messages', MessageProtocol)
    this.processProtocols(config, 'localMessages', LocalEventProtocol)
    this.processProtocols(config, 'commands', CommandProtocol)
}

ProtocolMap.prototype.processMeta = function(config,  metaConfig, configSection) {
    for (var i = 0; i < metaConfig[configSection].length; i++) {

        var name = metaConfig[configSection][i][0]
        var protocolConfig = metaConfig[configSection][i][1]
        var type = metaConfig[configSection][i][2]

        var protocol = new MessageProtocol(protocolConfig, config)
        this.lookupMetaByIndex.set(type, protocol)
        this.lookupMetaByProtocol.set(protocol, type)
        protocol.name = name

        //console.log('protocol', protocol)
    }
}


ProtocolMap.prototype.processProtocols = function(config, configSection, protocolConstructor) {
    let section = config.protocols[configSection]
    if (!section) { 
        return 
    }
    for (var i = 0; i < section.length; i++) {
        let entry = section[i]
        if (Array.isArray(entry)) {
            var name = entry[0]
            var ctor = entry[1]   
            if (entry.length === 2) {
                //console.log('ctor mode')
                // nengi beta Constructor mode       
                var protocolConfig = ctor.protocol
                var protocol = new protocolConstructor(protocolConfig, config)
                this.lookupByIndex.set(this.protocolIndex, protocol)
                this.lookupByProtocol.set(protocol, this.protocolIndex)
                // mutates prototype
                ctor.prototype.protocol = protocol
                // mutates protocol, adding a name
                protocol.name = name
                this.protocolIndex++

                //console.log(name, this.protocolIndex)

            } else {
                //console.log('factory mode')
                // nengi beta factory mode
                var protocolConfig = entry[2]
                var type = entry[3]
                var protocol = new protocolConstructor(protocolConfig, config)
                this.lookupByIndex.set(type, protocol)
                this.lookupByProtocol.set(protocol, type)
                protocol.name = name
            }
        } else {
            // new syntax mode
            //console.log('new syntax')
            if (configSection === 'components') {
                let protocol = new ComponentProtocol(entry.protocol, config, entry.components)
                this.lookupByIndex.set(entry[config.TYPE_PROPERTY_NAME], protocol)
                this.lookupByProtocol.set(protocol, entry[config.TYPE_PROPERTY_NAME])
                protocol.name = entry.name
            
            }
            if (configSection === 'entities') {
                let protocol = new EntityProtocol(entry.protocol, config, entry.components)
                this.lookupByIndex.set(entry[config.TYPE_PROPERTY_NAME], protocol)
                this.lookupByProtocol.set(protocol, entry[config.TYPE_PROPERTY_NAME])
                protocol.name = entry.name
            }
        }
    }

   // console.log(this)
}

ProtocolMap.prototype.getMetaProtocol = function(index) {
    return this.lookupMetaByIndex.get(index)
}

ProtocolMap.prototype.getMetaIndex = function(protocol) {
    return this.lookupMetaByProtocol.get(protocol)
}

ProtocolMap.prototype.getProtocol = function(index) {
    return this.lookupByIndex.get(index)
}

ProtocolMap.prototype.getIndex = function(protocol) {
    return this.lookupByProtocol.get(protocol)
}

export default ProtocolMap;
