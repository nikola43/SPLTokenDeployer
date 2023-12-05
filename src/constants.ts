import { PublicKey } from "@solana/web3.js"

export const SUPPORTED_CHAINS = [
    {
        id: 999999999,
        name: 'Solana Devnet',
        symbol: 'SOL',
        rpc: 'https://api.devnet.solana.com',
        testnet: true,
        limit: 0.1,
        fee: 0.5
    },
    {
        id: 9999999991,
        name: 'Solana mainnet',
        symbol: 'SOL',
        rpc: 'https://api.mainnet-beta.solana.com',
        testnet: false,
        limit: 0.1,
        fee: 0.5
    },
]

export const INPUT_CAPTIONS: any = {
    pvkey: 'Please paste or enter private key of deployer wallet',
    symbol: 'Please enter symbol for the token',
    name: 'Please enter name for the token',
    supply: 'Please enter total supply for the token. (Do not enter commas)',
    taxes: 'Please enter tranfer taxes',
    description: "Please enter description",
    logo: 'Please paste your image on chat',
}

export const METADATA_2022_PROGRAM_ID = new PublicKey("META4s4fSmpkTbZoUsgC1oBnWB31vQcmnN8giPw51Zu")
export const METADATA_2022_PROGRAM_ID_TESTNET = new PublicKey("M1tgEZCz7fHqRAR3G5RLxU6c6ceQiZyFK7tzzy4Rof4")

//const TESTNET_SHOW = process.env.TESTNET_SHOW === "1"
export const TESTNET_SHOW = true

export const BOT_NAME = 'Solana Token Minter'