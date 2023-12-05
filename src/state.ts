import { SUPPORTED_CHAINS, TESTNET_SHOW } from "./constants";

export const states: any = {}

export const state = (ctx: any, values = {}) => {
    const valuesEmpty = Object.keys(values).length === 0;
    if (valuesEmpty) {
        const defaultChain = SUPPORTED_CHAINS.find(chain => TESTNET_SHOW ? true : !chain.testnet)
        return {
            chainId: defaultChain?.id,
            mixerReceiverAddress: "",
            token: { lockTime: 30 },
            trading: {},
            bridgeAmount: 1,
            mixerAmount: 0,
            // ...(
            //     process.env.DEBUG_PVKEY ? {
            //         pvkey: process.env.DEBUG_PVKEY,
            //         account: ""
            //     } : {}
            // ),
            ...states[ctx.chat.id]
        }
    }
    states[ctx.chat.id] = {
        ...(states[ctx.chat.id] ?? {}), ...values
    }
}