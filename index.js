var nengi = {
    importMode: 'default'
}

import BinaryType from './core/binary/BinaryType.js';
import Protocol from './core/protocol/Protocol.js';
import EntityProtocol from './core/protocol/EntityProtocol.js';
import LocalEventProtocol from './core/protocol/LocalEventProtocol.js';
import MessageProtocol from './core/protocol/MessageProtocol.js';
import CommandProtocol from './core/protocol/CommandProtocol.js';

import proxify from './core/protocol/proxify.js';

// server only
import Instance from './core/instance/Instance.js';
import Channel from './core/instance/Channel.js';
import Bot from './core/bot/Bot.js';

// client only
import Client from './core/client/Client.js';
import Interpolator from './core/client/Interpolator.js';

import ProtocolMap from './core/protocol/ProtocolMap.js';
import metaConfig from './core/common/metaConfig.js';

// shortcuts for less typing
nengi.Boolean   = BinaryType.Boolean
nengi.Int2      = BinaryType.Int2
nengi.UInt2     = BinaryType.UInt2
nengi.Int3      = BinaryType.Int3
nengi.UInt3     = BinaryType.UInt3
nengi.Int4      = BinaryType.Int4
nengi.UInt4     = BinaryType.UInt4
nengi.Int6      = BinaryType.Int6
nengi.UInt6     = BinaryType.UInt6
nengi.Int8      = BinaryType.Int8
nengi.UInt8     = BinaryType.UInt8
nengi.Int10     = BinaryType.Int10
nengi.UInt10    = BinaryType.UInt10
nengi.Int12     = BinaryType.Int12
nengi.UInt12    = BinaryType.UInt12
nengi.Int16     = BinaryType.Int16
nengi.UInt16    = BinaryType.UInt16
nengi.Int32     = BinaryType.Int32
nengi.UInt32    = BinaryType.UInt32
nengi.Float32   = BinaryType.Float32
nengi.Number =
nengi.Float64   = BinaryType.Float64
nengi.EntityId  = BinaryType.EntityId
nengi.RGB888    = BinaryType.RGB888
nengi.RotationFloat32 = BinaryType.RotationFloat32
nengi.ASCIIString    = BinaryType.ASCIIString
nengi.String =
nengi.UTF8String = BinaryType.UTF8String

nengi.Basic =
nengi.Protocol = Protocol

nengi.Entity =
nengi.EntityProtocol = EntityProtocol

nengi.LEvent =
nengi.LocalEventProtocol = LocalEventProtocol

nengi.Msg =
nengi.Message =
nengi.MessageProtocol = MessageProtocol

nengi.Command =
nengi.CommandProtocol = CommandProtocol


nengi.proxify = proxify

// NODE-only
nengi.Instance = Instance
nengi.Channel = Channel
nengi.Bot = Bot

nengi.Client = Client
nengi.Interpolator = Interpolator

nengi.ProtocolMap = ProtocolMap
nengi.metaConfig = metaConfig


// browser
//nengi.Client = Client
//nengi.Interpolator = Interpolator

export default nengi
