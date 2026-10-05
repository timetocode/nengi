import { AdaptiveInterpolator, Client, ClientConnectionError } from 'nengi'
import { WebSocketClientAdapter } from 'nengi-websocket-client-adapter'
import { createPresentation, updatePresentation } from './client-state.ts'
import type { Presentation } from './client-state.ts'
import { NType, ROOM_HEIGHT, ROOM_WIDTH, SERVER_TICK_RATE, createContext } from './protocol.ts'
import './style.css'

const room = document.querySelector<HTMLDivElement>('#room')!
const button = document.querySelector<HTMLButtonElement>('#connection')!
const status = document.querySelector<HTMLParagraphElement>('#status')!
const count = document.querySelector<HTMLSpanElement>('#count')!
const nodes = new Map<number, HTMLDivElement>()
const context = createContext()

type Session = {
    client: Client<WebSocketClientAdapter>
    interpolator: AdaptiveInterpolator
    presentation: Presentation
}
let session: Session | undefined

function clearSession(current: Session, detail: string) {
    if (session !== current) return
    session = undefined
    for (const node of nodes.values()) node.remove()
    nodes.clear()
    count.textContent = '0 players'
    status.textContent = detail
    button.textContent = 'Connect'
    button.disabled = false
}

button.addEventListener('click', async () => {
    if (session) {
        session.client.disconnect()
        return
    }

    const client = new Client(context, WebSocketClientAdapter, SERVER_TICK_RATE)
    const current = { client, interpolator: new AdaptiveInterpolator(client), presentation: createPresentation() }
    session = current
    button.disabled = true
    status.textContent = 'Connecting…'
    client.setDisconnectHandler(info => clearSession(current, `Disconnected: ${info.code}. You can connect again.`))

    const url = new URL('/game', location.href)
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    try {
        await client.connect(url.href)
        if (session !== current || client.connectionState !== 'connected') return
        button.textContent = 'Disconnect'
        button.disabled = false
        status.textContent = 'Connected. Click inside the room to move.'
    } catch (error) {
        const detail = error instanceof ClientConnectionError ? error.code : String(error)
        clearSession(current, `Could not connect: ${detail}. Try again.`)
    }
})

room.addEventListener('pointerdown', event => {
    if (!session || session.client.connectionState !== 'connected') return
    const bounds = room.getBoundingClientRect()
    session.client.addCommand({
        ntype: NType.MoveTo,
        x: (event.clientX - bounds.left) / bounds.width * ROOM_WIDTH,
        y: (event.clientY - bounds.top) / bounds.height * ROOM_HEIGHT
    })
    session.client.flush()
})

function render(state: Presentation) {
    for (const [nid, node] of nodes) {
        if (!state.players.has(nid)) {
            node.remove()
            nodes.delete(nid)
        }
    }
    for (const player of state.players.values()) {
        let node = nodes.get(player.nid)
        if (!node) {
            node = document.createElement('div')
            node.className = 'player'
            node.dataset.nid = String(player.nid)
            room.append(node)
            nodes.set(player.nid, node)
        }
        const controlled = player.nid === state.controlledNid
        node.classList.toggle('is-you', controlled)
        node.textContent = controlled ? 'You' : String(player.nid)
        node.style.left = `${player.x / ROOM_WIDTH * 100}%`
        node.style.top = `${player.y / ROOM_HEIGHT * 100}%`
        node.style.backgroundColor = `hsl(${player.hue} 65% 65%)`
    }
    count.textContent = `${state.players.size} players`
}

function frame() {
    if (session?.client.connectionState === 'connected') {
        updatePresentation(session.client, session.interpolator, session.presentation)
        render(session.presentation)
    }
    requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

// Background tabs still drain deltas. A fully suspended page can time out normally.
setInterval(() => {
    if (document.hidden && session?.client.connectionState === 'connected') {
        updatePresentation(session.client, session.interpolator, session.presentation)
    }
}, 250)

window.addEventListener('pagehide', () => session?.client.disconnect())
