# nengi.js - multiplayer network engine <img src="https://timetocode.com/images/nengi-logo-32x32.png" />
Experimental branch for nengi 2! Not stable or documented yet :D

## Adapters
nengi 2 has no websocket/dataview/buffer dependency by default, and you may pick and choose the underlying websocket library+tech depending where you intend to run nengi

- RECOMMENDED FOR SERVER: [https://github.com/timetocode/nengi-uws-instance-adapter](https://github.com/timetocode/nengi-uws-instance-adapter) - allows a nengi Instance to listen to sockets in node.js using uws.js and Buffers
- RECOMMENDED FOR CLIENT: [https://github.com/timetocode/nengi-websocket-client-adapter](https://github.com/timetocode/nengi-websocket-client-adapter) - allows a nengi Client to open connections using regular browser websockets and DataViews
- Alternative for server: [https://github.com/timetocode/nengi-ws-instance-adapter](https://github.com/timetocode/nengi-ws-instance-adapter) - allows a nengi Instance to listen to sockets in nnode.js using ws and Buffers
- Sevices/Bots: [https://github.com/timetocode/nengi-ws-client-adapter](https://github.com/timetocode/nengi-ws-client-adapter) - allows a nengi Client to run in node.js and connect to servers

If you are attempting to emulate nengi 1.0, use uws.js on the server, and regular browser websockets on the client -- that's all 1.0 had availabnle to it.

## Make your own Adapter
Want nengi to speak over another protocol? Well you can ask the developer to add it (i might!) or roll your own. Some things that might be interesting are WebRTC, QUIC, misc javascript websocket implementations, and if you're really ambitious a non-javascript client (probably don't do that until the api hits 1.0.0).

- nengi buffers [https://github.com/timetocode/nengi-buffers](https://github.com/timetocode/nengi-buffers) - binary implemenation using node Buffers, usually what's available for a library that runs in node
- nengi dataviews [https://github.com/timetocode/nengi-dataviews](https://github.com/timetocode/nengi-dataviews) - binary implementation using browser DataViews, usually whats available for a library that runs in a browser