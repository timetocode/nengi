import { User } from '../User'

interface IServerNetworkAdapter {
	listen(port: number, ready: () => void): void
	send(user: User, buffer: Buffer): void
	disconnect(user: User, reason: any): void
}

export { IServerNetworkAdapter }