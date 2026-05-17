interface IClientNetworkAdapter {
    connect(wsUrl: string, handshake: any): Promise<any>;
    flush(): void;
}
export { IClientNetworkAdapter };
//# sourceMappingURL=IClientNetworkAdapter.d.ts.map