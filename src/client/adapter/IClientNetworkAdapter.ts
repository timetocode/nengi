interface IClientNetworkAdapter {
    connect(wsUrl: string, handshake: any): Promise<any>
    flush(): void
	//disconnect(): void
}

export { IClientNetworkAdapter }
