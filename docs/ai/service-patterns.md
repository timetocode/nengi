# Service patterns

Nengi can carry state and interactions for a hub, lobby, collaboration service,
or other realtime process. The service does not need a game simulation. It does
need a clear owner for state, an explicit application cycle, and a deliberate
policy for asynchronous work.

## Map the service to nengi

Use the primitive that matches the service fact:

- durable shared record: entity in a channel
- one-shot notification: message
- repeated client input or presence signal: command
- validated client-originating action with a result: request/response
- scoped subscription: channel, often with a schema-backed header
- authentication and initial selection: connection handshake

The server remains authoritative. A client request is an input to validate, not
an instruction to apply directly. A client should receive the resulting state,
message, or response after the server decides what happened.

## Application cycle

An Express-style service can still make its mutation order visible. A useful
cycle is:

1. Accept adapter input and put it into an application queue.
2. Authenticate the connection and validate the payload.
3. Process a bounded batch of commands and requests.
4. Read durable state and external resources through explicit dependencies.
5. Apply the accepted state transition.
6. Emit entity, channel, message, and response changes.
7. Call `instance.step()` at the snapshot boundary.

Keep that network step on a regular cadence even when the service has no state
changes to publish. Nengi evaluates connection deadlines and emits Pings at the
step boundary; an event-driven service that steps only after mutations cannot
provide heartbeat liveness.
8. Flush transport output and metrics.

The service may run this cycle after each event or on a short scheduled cadence.
Choose one policy and document it. The important property is that no adapter
callback directly mutates unrelated domain state outside the cycle.

## Requests and asynchronous work

Requests are client-to-server interactions that expect a result. They are useful
for actions such as joining a room, changing a subscription, editing a record,
or reserving a resource. They are not a general server-to-client RPC mechanism.

Keep request behavior explicit:

- validate authentication, authorization, shape, and resource limits before
  doing work
- define whether duplicate requests are rejected, deduplicated, or repeated
- make the response describe the accepted result or a typed failure
- bound request processing so one connection cannot monopolize the cycle
- decide whether external work is allowed inside the handler

When a handler awaits a database or external service, the continuation may run
after the current synchronous application stage. If ordering with other
mutations matters, convert the completion into an application event and process
it at a visible boundary. Do not rely on promise scheduling as an undocumented
ordering rule.

For server-originating information, prefer a message, an entity update, or a
channel header change. If the client must acknowledge an action, define that
acknowledgment as an application message or as a subsequent client request with
an explicit correlation id. This keeps the protocol vocabulary aligned with
the direction of the existing request/response API.

## Resources and state

A service commonly has long-lived resources such as a database pool, room index,
clock, rate limiter, or metrics sink. Give each resource a lifecycle and a
narrow interface. An ECS resource is appropriate when the service already uses
`EcsWorld` and systems benefit from querying the dependency through the world;
it should still represent one coherent dependency or singleton concern.

Do not create one runtime object that contains configuration, adapters, command
routers, every service, and every mutable map merely to make parameter passing
shorter. Pass a narrow dependency to the function that needs it, or group a
small set of values that genuinely form one boundary, such as a room store or a
database repository.

A useful separation is:

- `decide(state, input, resources)`: validate and return an accepted decision
- `apply(state, decision)`: perform the owned state mutation
- `emit(decision, state)`: write nengi changes at the protocol boundary
- `effects(decision)`: perform persistence, metrics, or external I/O

These can be ordinary functions. They do not need to be classes or immutable
reducers. The goal is to make the mutation owner and effect boundary readable.

## Connection lifecycle

Keep connection lifecycle as an explicit part of the service cycle:

- handshake data is validated before the user enters the service
- connect allocates the user's scoped state and subscriptions
- commands and requests verify that the user still owns the target
- nengi removes channel subscriptions before emitting `UserDisconnected`
- the disconnect handler releases application-owned state and resources
- channel close is treated as a state transition, not only a transport event

Use private channels or headered channels when a service has scoped data. Do not
leak authorization decisions into a client-side presentation convention; the
server's channel subscription is the visibility boundary.

## Service correctness

Test the domain transition without a socket, then test the nengi boundary with
`LocalInstanceAdapter` and `LocalClientAdapter`. Assert the response and the
resulting frame. A service action is not complete merely because its in-memory
map changed; subscribed users must receive the intended state or message, and
unsubscribed users must not receive it.

For operational concerns, combine this guidance with [operations.md](./operations.md)
and [testing-and-correctness.md](./testing-and-correctness.md).
