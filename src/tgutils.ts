import { LAMPORTS_PER_SOL } from "@solana/web3.js"
import { BOT_NAME, SUPPORTED_CHAINS } from "./constants"
import { state } from "./state"
import { Buttons, DeployedToken } from "./types"
import { escape_markdown, tokens } from "./utils"
import { getFeesAccounts, getSolBalance, initSolanaWeb3Connection } from "./web3utils"

export const update = async (ctx: any, caption: string, buttons: Buttons[] = [], must = false) => {
    if (!ctx)
        return

    if (must == true) {
        return await ctx.telegram.sendMessage(ctx.chat.id, escape_markdown(caption), {
            parse_mode: "MarkdownV2",
            reply_markup: {
                inline_keyboard: buttons
            }
        }).catch((ex: any) => { console.log(ex) })
    }
    else if (ctx.update?.callback_query) {
        const msg = ctx.update.callback_query.message
        return await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, msg.message_id, escape_markdown(caption), {
            parse_mode: "MarkdownV2",
            reply_markup: {
                inline_keyboard: buttons
            }
        }).catch((ex: any) => { console.log(ex) })
    } else if (ctx.message_id) {
        return await ctx.telegram.editMessageText(ctx.chat.id, ctx.message_id, ctx.message_id, escape_markdown(caption), {
            parse_mode: "MarkdownV2",
            reply_markup: {
                inline_keyboard: buttons
            }
        }).catch((ex: any) => { console.log(ex) })
    } else {
        return await ctx.telegram.sendMessage(ctx.chat.id, escape_markdown(caption), {
            parse_mode: "MarkdownV2",
            reply_markup: {
                inline_keyboard: buttons
            }
        }).catch((ex: any) => { console.log(ex) })
    }
}

export const create = (ctx: any, caption: string, buttons: Buttons[] = []) => {
    if (!ctx)
        return
    return ctx.telegram.sendMessage(ctx.chat.id, escape_markdown(caption), {
        parse_mode: "MarkdownV2",
        reply_markup: {
            inline_keyboard: buttons
        }
    }).catch((ex: any) => { console.log(ex) })
}

export const showWelcome = async (ctx: any) => {
    state(ctx, { mixerStatus: false, mixerAmount: 0, mixerReceiverAddress: "" });
    return update(ctx, `Welcome to ${BOT_NAME}!`, [
        [
            {
                text: `Deploy`,
                callback_data: `back@deploy`,
            }
        ]
    ])
}

export const showWallet = async (ctx: any): Promise<any> => {
    const { chainId, wallet } = state(ctx)
    if (!wallet)
        return showStart(ctx)

    const chain = SUPPORTED_CHAINS.find(chain => chain.id == chainId)
    const connection = await initSolanaWeb3Connection(chain.rpc)
    const solBalance = await getSolBalance(connection, wallet.publicKey.toBase58());

    return update(ctx, ['🧳 Wallet: ' + wallet.publicKey.toBase58() + " " + solBalance / LAMPORTS_PER_SOL + " SOL"].join('\n'), [
        SUPPORTED_CHAINS.map(chain => ({
            text: `${chain.id == chainId ? '🟢' : '⚪'} ${chain.name}`, callback_data: `chain@${chain.id}`
        })),
        [
            {
                text: `📝 Deploy Token`,
                callback_data: `back@deploy`,
            },
            {
                text: `📋 List Deployed Tokens`,
                callback_data: `back@list`,
            }
        ],
        [
            {
                text: `🔌 Disconnect`,
                callback_data: `disconnect`,
            }
        ]
    ])
}

export const showStart = async (ctx: any) => {
    const { chainId, wallet } = state(ctx)
    if (wallet)
        return showWallet(ctx)

    return update(ctx, `Setup your wallet to start using ${BOT_NAME}!`, [
        SUPPORTED_CHAINS.map(chain => ({
            text: `${chain.id == chainId ? '🟢' : '⚪'} ${chain.name}`, callback_data: `chain@${chain.id}`
        })),
        [
            {
                text: `Connect Wallet`,
                callback_data: `back@account`,
            }
        ]
    ])
}

export const showAccount = (ctx: any) => {
    const { wallet } = state(ctx)
    update(ctx, 'Setup your Account', [
        wallet ? [
            {
                text: `🔌 Disconnect`,
                callback_data: `disconnect`,
            }
        ] : [],
        [
            {
                text: `🔐 Existing private Key`,
                callback_data: `existing`,
            },
            {
                text: `🔑 Generate private Key`,
                callback_data: `generate`,
            }
        ],
        [
            {
                text: `🔙 Back`,
                callback_data: `back@start`,
            }
        ]
    ])
}

export const showDeploy = async (ctx: any) => {
    const { chainId, wallet, token } = state(ctx)
    if (!wallet)
        return showStart(ctx)
    const chain = SUPPORTED_CHAINS.find(chain => chain.id == chainId)

    return update(ctx, [
        '🧳 Token Parameters',
        '',
        `${token.symbol ? '✅' : '❌'} Symbol: "${token.symbol?.toUpperCase() ?? 'Not set'}"`,
        `${token.name ? '✅' : '❌'} Name: "${token.name ?? 'Not set'}"`,
        `${token.supply ? '✅' : '❌'} Supply: "${token.supply ?? 'Not set'}"`,
        `${token.taxes ? '✅' : '❔'} Taxes: "${token.taxes ? `${token.taxes}%` : 'Not set'}"`,
        `${token.description ? '✅' : '❔'} Description: "${token.description ? `${token.description}` : 'Not set'}"`,
        `${token.logo ? '✅' : '❔'} Logo: "${token.logo ? `${token.logo}` : 'Not set'}"`,
    ].join('\n'), [
        SUPPORTED_CHAINS.map(chain => ({
            text: `${chain.id == chainId ? '🟢' : '⚪'} ${chain.name}`, callback_data: `chain@${chain.id}`
        })),
        [
            {
                text: `💲 Symbol`,
                callback_data: `input@symbol`,
            },
            {
                text: `🔠 Name`,
                callback_data: `input@name`,
            },
            {
                text: `🔢 Supply`,
                callback_data: `input@supply`,
            }
        ],
        [
            {
                text: `💲 Taxes`,
                callback_data: `input@taxes`,
            },
            {
                text: `🔠 Description`,
                callback_data: `input@description`,
            },
            {
                text: `🌅 Logo`,
                callback_data: `input@logo`,
            }
        ],
        [
            {
                text: `📝 Review and Deploy`,
                callback_data: `confirm@deploy`,
            }
        ],
        [
            {
                text: `🔙 Back`,
                callback_data: `back@wallet`,
            }
        ],
        Object.keys(token).length ? [
            {
                text: `🔄 Restart`,
                callback_data: `reset`,
            }
        ] : []
    ])
}

export const showList = async (ctx: any) => {
    const { chainId, wallet } = state(ctx)

    const deployed: DeployedToken[] = tokens(ctx)
    console.log({ deployed })

    return update(ctx, ['Deployed Tokens'].join('\n'), [
        SUPPORTED_CHAINS.map(chain => ({
            text: `${chain.id == chainId ? '🟢' : '⚪'} ${chain.name}`, callback_data: `chain@${chain.id}`
        })),
        ...deployed.map(token =>
            [
                {
                    text: `${token.name} (${token.symbol}) address ${token.address}`,
                    callback_data: `token@${token.address}`
                }
            ]),
        [
            {
                text: `🔙 Back`,
                callback_data: `back@wallet`,
            }
        ]
    ])

}

export const showSuccess = async (ctx: any, message: any, href: any, duration = 10000) => {
    if (duration) setTimeout(() => showPage(ctx, href), duration)
    return update(ctx, `${message}`, [
        [
            {
                text: 'Continue ➡️',
                callback_data: `back@${href}`
            }
        ]
    ])
}

export const showToken = async (ctx: any, address: string) => {
    const { chainId, wallet } = state(ctx)

    const chain = SUPPORTED_CHAINS.find(chain => chain.id == chainId)



    return initSolanaWeb3Connection(chain.rpc).then(async (_connection) => {

        //const tokenBalance = await getTokenBalance(_connection, wallet.publicKey.toBase58(), address)

        //const mintPublicKey = new PublicKey(address)
        return getFeesAccounts(_connection, address).then((_accountsAmounts) => {

            const token = tokens(ctx).find(token => token.chain == chainId && token.address == address)
            const claimableAmount = Number(_accountsAmounts.amount) / LAMPORTS_PER_SOL

            return update(ctx, [
                '🧳 Token Parameters',
                '',
                `✅ Address: "${token.address}"`,
                '',
                `✅ Available withdraw: "${claimableAmount}"`,
                '',
                `${token.symbol ? '✅' : '❌'} Symbol: "${token.symbol?.toUpperCase() ?? 'Not set'}"`,
                `${token.name ? '✅' : '❌'} Name: "${token.name ?? 'Not set'}"`,
                `${token.supply ? '✅' : '❌'} Supply: "${token.supply ?? 'Not set'}"`,
                `${token.taxes ? '✅' : '❔'} Taxes: "${token.taxes ? `${token.taxes}%` : 'Not set'}"`,
                `${token.description ? '✅' : '❔'} Description: "${token.description ? `${token.description}` : 'Not set'}"`,
                `${token.logo ? '✅' : '❔'} Logo: "${token.logo ? `${token.logo}` : 'Not set'}"`,
            ].join('\n'), [
                SUPPORTED_CHAINS.map(chain => ({
                    text: `${chain.id == chainId ? '🟢' : '⚪'} ${chain.name}`, callback_data: `chain@${chain.id}`
                })),
                claimableAmount > 0 ?
                    [
                        {
                            text: `Widthdraw Fees`,
                            callback_data: `withdraw@${token.address}`,
                        }
                    ] : [],
                [
                    {
                        text: `🔄 Refresh`,
                        callback_data: `refresh@${token.address}`,
                    }
                ],
                [
                    {
                        text: `🔙 Back`,
                        callback_data: `back@wallet`,
                    }
                ],
            ])
        })
    })
}

export const showWait = async (ctx: any, caption: string) => {
    return update(ctx, `⌛ ${caption}`)
}

export const showError = async (ctx: any, error: any, href: any, duration = 10000) => {
    // showPage(ctx, href)
    const err = await create(ctx, `⚠ ${error}`)
    if (duration)
        setTimeout(() => ctx.telegram.deleteMessage(ctx.chat.id, err.message_id).catch((ex: any) => { }), duration)
}

export const showPage = (ctx: any, page: any) => {
    if (page == 'start')
        showWallet(ctx)
    else if (page == 'account')
        showAccount(ctx)
    else if (page == 'key')
        showAccount(ctx)
    else if (page == 'wallet')
        showWallet(ctx)
    else if (page == 'deploy')
        showDeploy(ctx)
    else if (page == 'list')
        showList(ctx)
    else if (/^token@(?<address>0x[\da-f]{40})$/i.test(page)) {
        const match = /^token@(?<address>0x[\da-f]{40})$/i.exec(page)
        if (match && match?.groups?.address)
            showToken(ctx, match.groups.address)
    } else
        showDeploy(ctx)
    //showWelcome(ctx)
}