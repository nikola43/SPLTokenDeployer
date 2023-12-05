import { state } from "./state"
import { DeployedToken } from "./types"
const fs = require("fs")
const path = require("path")

export const escape_markdown = (text) => {
    return text.replace(/([\.\+\-\|\(\)\#\_\[\]\~\=\{\}\,\!\`\>\<])/g, "\\$1").replaceAll('"','`')
}

export const tokens = (ctx: any, token: DeployedToken = undefined, update = false) => {
    const filepath = path.resolve(`./data/tokens-${ctx.chat.id}.json`)
    const data = fs.existsSync(filepath) ? JSON.parse(fs.readFileSync(filepath)) : []
    const { chainId, wallet } = state(ctx)

    console.log({ token, data, update, wallet })

    if (!token)
        return data.filter((token: DeployedToken) => token.chain == chainId && token.deployer == wallet.publicKey.toBase58())
    if (update)
        fs.writeFileSync(filepath, JSON.stringify(data.map((t: any) => t.chain == chainId && t.address == token.address ? { ...t, ...token } : t)))
    else
        fs.writeFileSync(filepath, JSON.stringify([...data, token]))
}