// This small consumer exercises the adapter boundary, including declarations
// produced by an older build. Do not compile adapter sources in this check.
import { Client, Context, Instance, NetworkConditionLink } from 'nengi'
import type { BinaryAdapter, IClientNetworkAdapter, IServerNetworkAdapter } from 'nengi'
import { bufferBinary } from 'nengi-buffers'
import { dataViewBinary } from 'nengi-dataviews'
import { WsClientAdapter, SimulatedWsClientAdapter } from 'nengi-ws-client-adapter'
import { WebSocketClientAdapter, SimulatedWebSocketClientAdapter } from 'nengi-websocket-client-adapter'
import { WsInstanceAdapter } from 'nengi-ws-instance-adapter'
import { UwsInstanceAdapter } from 'nengi-uws-instance-adapter'
import { BunInstanceAdapter } from 'nengi-bun-instance-adapter'
import { DenoInstanceAdapter } from 'nengi-deno-instance-adapter'

const instance = new Instance(new Context())
const binaries: BinaryAdapter<any, any>[] = [bufferBinary, dataViewBinary]
const clients: IClientNetworkAdapter<any, any, any>[] = [
    new WsClientAdapter(), new WebSocketClientAdapter(),
    new SimulatedWsClientAdapter({ conditions: { seed: 1 } }),
    new SimulatedWebSocketClientAdapter({ conditions: { seed: 1 } })
]
const servers: IServerNetworkAdapter<any, any, any>[] = [
    new WsInstanceAdapter(instance.adapterHost), new UwsInstanceAdapter(instance.adapterHost),
    new BunInstanceAdapter(instance.adapterHost), new DenoInstanceAdapter(instance.adapterHost)
]
for (const binary of binaries) {
    const writer = binary.createWriter(2)
    writer.writeUInt16(123)
    if (writer.offset !== 2) throw new Error('Binary writer contract mismatch')
    if (binary.createReader(writer.payload).readUInt16() !== 123) throw new Error('Binary reader contract mismatch')
}
for (const client of clients) {
    if (client.clientAdapterVersion !== 2) throw new Error('Client contract mismatch')
}
for (const server of servers) {
    if (server.serverAdapterVersion !== 1) throw new Error('Server contract mismatch')
}
const simulated = clients[2] as SimulatedWsClientAdapter
const link: NetworkConditionLink = simulated.conditions
link.status()
new Client(instance.context, WsClientAdapter, 20)
new Client(instance.context, WebSocketClientAdapter, 20)
console.log('Installed adapter declarations and contract markers are compatible.')
