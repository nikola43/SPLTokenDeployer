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
    supply?: number,
    description?: string,
    taxes?: number,
    logo?: string
}

export type AccountsAmount = {
    accounts: PublicKey[]
    amount: bigint
}