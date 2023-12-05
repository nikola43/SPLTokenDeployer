import { PublicKey } from "@solana/web3.js"

export type Button = {
    text: string
    callback_data: string
}

export type Buttons = Button[]

export type DeployedToken = {
    address: string,
    name?: string,
    symbol?: string,
    chain?: number,
    deployer?: string,
}

export type AccountsAmounts = {
    accounts: PublicKey[]
    amount: bigint
}