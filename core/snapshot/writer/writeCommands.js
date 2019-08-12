import { Chunk } from '../Chunk.js';
import BinaryType from '../../binary/BinaryType.js';
import Binary from '../../binary/Binary.js';
import writeMessage from '../../protocol/write/writeMessage.js';

function writeCommands(bitStream, commands) {

    // note: it is possible to write 0 commands
    // in which case the chunktype and 0 are still sent
    //console.log('writing commands', commands)
    // ChunkType Commands
    bitStream[Binary[BinaryType.UInt8].write](Chunk.Commands)

    // number of Commands
    bitStream[Binary[BinaryType.UInt16].write](commands.length)

    for (var i = 0; i < commands.length; i++) {
        var command = commands[i]
        writeMessage(bitStream, command, command.protocol)
    }
    
}

export default writeCommands;