// Import necessary functions and constants from the Solana web3.js and SPL Token packages
import {
    sendAndConfirmTransaction,
    Connection,
    Keypair,
    SystemProgram,
    Transaction,
    LAMPORTS_PER_SOL,
    Cluster,
    PublicKey,
} from '@solana/web3.js';

const { Telegraf } = require("telegraf")
const { message } = require("telegraf/filters")

const fs = require("fs")
const path = require("path")
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const bs58 = require('bs58');

// Import the NFTStorage class and File constructor from the 'nft.storage' package
import { NFTStorage, File } from 'nft.storage'

const mime = require('mime')

const dotenv = require("dotenv")
dotenv.config()

const BOT_NAME = 'Flash Bot'


const TESTNET_SHOW = process.env.TESTNET_SHOW === "1"

function sleep(seconds: number) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

type Button = {
    text: string
    callback_data: string
}

type Buttons = Button[]

type DeployedToken = {
    address: string,
    name?: string,
    symbol?: string,
    chain?: number,
    deployer?: string,
}


const SUPPORTED_CHAINS = [
    {
        id: 999999999,
        name: 'Sol Dev',
        symbol: 'SOL',
        rpc: 'https://api.devnet.solana.com',
        testnet: false,
        limit: 0.01,
    },
    {
        id: 9999999991,
        name: 'Sol main',
        symbol: 'SOL',
        rpc: 'https://api.devnet.solana.com',
        testnet: true,
        limit: 0.01,
    },
]

const INPUT_CAPTIONS: any = {
    pvkey: 'Please paste or enter private key of deployer wallet',
    symbol: 'Please enter symbol for the token',
    name: 'Please enter name for the token',
    supply: 'Please enter total supply for the token. (Do not enter commas)',
    taxes: 'Please enter tranfer taxes',
}

const { escape_markdown } = require("./common/utils")
const { error } = require("console")
const createBot = () => {
    const token = process.env.BOT_TOKEN
    if (process.env.BOT_PROXY) {
        const [host, port] = process.env.BOT_PROXY.split(':')
        const HttpsProxyAgent = require('https-proxy-agent')
        const agent = new HttpsProxyAgent({ host, port })
        return new Telegraf(token, {
            telegram: { agent },
            handlerTimeout: 9_000_000
        })
    }
    return new Telegraf(token, {
        handlerTimeout: 9_000_000
    })
}

const bot = createBot()

// const token = process.env.BOT_TOKEN
// const bot = new Telegraf(token, {
//     handlerTimeout: 9_000_000
// })

// const menuMiddleware = new MenuMiddleware('/', context => {
//     console.log('Menu button pressed', context.match)
// });

bot.use(async (ctx: any, next: any) => {
    const t = Date.now()
    const res = await next()
    console.log(ctx.match?.input, Date.now() - t)
    return res
})

const states: any = {}

const state = (ctx: any, values = {}) => {
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

const tokens = (ctx: any, token: DeployedToken = { address: "" }, update = false) => {
    const filepath = path.resolve(`./data/tokens-${ctx.chat.id}.json`)
    const data = fs.existsSync(filepath) ? JSON.parse(fs.readFileSync(filepath)) : []
    const { chainId, account } = state(ctx)
    if (!token)
        return data.filter((token: DeployedToken) => token.chain == chainId && token.deployer == account)
    if (update)
        fs.writeFileSync(filepath, JSON.stringify(data.map((t: any) => t.chain == chainId && t.address == token.address ? { ...t, ...token } : t)))
    else
        fs.writeFileSync(filepath, JSON.stringify([...data, token]))
}

const create = (ctx: any, caption: string, buttons: Buttons[] = []) => {
    if (!ctx)
        return
    return ctx.telegram.sendMessage(ctx.chat.id, escape_markdown(caption), {
        parse_mode: "MarkdownV2",
        reply_markup: {
            inline_keyboard: buttons
        }
    }).catch((ex: any) => { console.log(ex) })
}

const update = async (ctx: any, caption: string, buttons: Buttons[] = [], must = false) => {
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

const showWelcome = async (ctx: any) => {
    const { chainId, wallet } = state(ctx)
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



const showStart = async (ctx: any) => {
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


const showAccount = (ctx: any) => {
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

const showWallet = async (ctx: any): Promise<any> => {
    const { chainId, wallet } = state(ctx)
    if (!wallet)
        return showStart(ctx)

    const chain = SUPPORTED_CHAINS.find(chain => chain.id == chainId)
    const connection = await initSolanaWeb3Connection(chain.rpc)
    const solBalance = await getSolBalance(connection, wallet.publicKey.toBase58());

    return update(ctx, ['🧳 Wallet: ' + wallet.publicKey.toBase58() + " " + solBalance + " SOL"].join('\n'), [
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
                text: `🛠️ Settings`,
                callback_data: `back@account`,
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

const showWait = async (ctx: any, caption: string) => {
    return update(ctx, `⌛ ${caption}`)
}

const showPage = (ctx: any, page: any) => {
    if (page == 'start')
        showWallet(ctx)
    //showWallet(ctx)
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
        showWelcome(ctx)
}

const showError = async (ctx: any, error: any, href: any, duration = 10000) => {
    // showPage(ctx, href)
    const err = await create(ctx, `⚠ ${error}`)
    if (duration)
        setTimeout(() => ctx.telegram.deleteMessage(ctx.chat.id, err.message_id).catch((ex: any) => { }), duration)
}

const showSuccess = async (ctx: any, message: any, href: any, duration = 10000) => {
    if (duration) setTimeout(() => showPage(ctx, href), duration)
    return update(ctx, `${message}`, [
        [
            {
                text: '🔙 Back',
                callback_data: `back@${href}`
            }
        ]
    ])
}


const showList = async (ctx: any) => {
    const { chainId, wallet } = state(ctx)




    const deployed: DeployedToken[] = tokens(ctx)

    return update(ctx, [' '].join('\n'), [
        SUPPORTED_CHAINS.map(chain => ({
            text: `${chain.id == chainId ? '🟢' : '⚪'} ${chain.name}`, callback_data: `chain@${chain.id}`
        })),
        ...deployed.map(token =>
            [
                {
                    text: `${token.name} (${token.symbol}) at ${token.address}`,
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

const showDeploy = async (ctx: any) => {
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
        `${token.taxes ? '✅' : '❔'} Logo: "${token.taxes ? `${token.taxes}%` : 'Not set'}"`,
        `${token.description ? '✅' : '❔'} Description: "${token.description ? `${token.description}%` : 'Not set'}"`,
        `${token.logo ? '✅' : '❔'} Logo: "${token.logo ? `${token.logo}%` : 'Not set'}"`,
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
                text: `🔢 Logo`,
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

const showToken = async (ctx: any, address: any) => {
    const { chainId, wallet, token } = state(ctx)



    console.log('token', token)
    return update(ctx, [
        '🧳 Token Parameters',
        '',
        `✅ Address: "${token.address}"`,
        '',
        `${token.symbol ? '✅' : '❌'} Symbol: "${token.symbol?.toUpperCase() ?? 'Not set'}"`,
        `${token.name ? '✅' : '❌'} Name: "${token.name ?? 'Not set'}"`,
        `${token.supply ? '✅' : '❌'} Supply: "${token.supply ?? 'Not set'}"`,
        `${token.taxes ? '✅' : '❔'} Logo: "${token.taxes ? `${token.taxes}%` : 'Not set'}"`,
        `${token.description ? '✅' : '❔'} Description: "${token.description ? `${token.description}%` : 'Not set'}"`,
        `${token.logo ? '✅' : '❔'} Logo: "${token.logo ? `${token.logo}%` : 'Not set'}"`,
    ].join('\n'), [
        SUPPORTED_CHAINS.map(chain => ({
            text: `${chain.id == chainId ? '🟢' : '⚪'} ${chain.name}`, callback_data: `chain@${chain.id}`
        })),
        [
            {
                text: `🔙 Back`,
                callback_data: `back@wallet`,
            }
        ],
    ])
}


bot.start(async (ctx: any) => {
    showWelcome(ctx)
})

bot.catch((err: any, ctx: any) => {
    try {
        ctx.reply(err.message, { reply_to_message_id: ctx.message?.message_id })
    } catch (ex) {
        console.log(ex)
        ctx.sendMessage(err.message)
    }
})

bot.command('settings', (ctx: any) => {
    showAccount(ctx)
})

bot.command('deploy', (ctx: any) => {
    showDeploy(ctx)
})


bot.action('disconnect', (ctx: any) => {
    state(ctx, { wallet: undefined })
    showStart(ctx)
})

bot.action(/^confirm@(?<action>\w+)(#(?<params>.+))?$/, async (ctx: any) => {
    const { action, params } = ctx.match.groups
    const mid = ctx.update.callback_query.message.message_id
    console.log({ action, params, mid })

    const config = {
        deploy: {
            precheck: async (ctx: any) => {
                const { token, chainId } = state(ctx)
                if (!token.symbol)
                    throw new Error('You have to input symbol')
                if (!token.name)
                    throw new Error('You have to input name')
                if (!token.supply)
                    throw new Error('You have to specify supply')
                const chain = SUPPORTED_CHAINS.find(chain => chain.id == chainId)


                if (chainId !== 999999999) {
                    if (!token.ethLP) {
                        throw new Error(`You have to specify ${chain?.symbol} LP`)
                    }
                }

                if (token.reflectionTokenAddress) {
                    if (Math.floor((token.reflectionPercentage ?? 0) * 100) == 0) {
                        throw new Error(`You have to specify reflection percentage`)
                    }
                }

                if (Math.floor((token.reflectionPercentage ?? 0) * 100) > 0) {
                    if (!token.reflectionTokenAddress) {
                        throw new Error(`You have to specify reflection token address`)
                    }
                }
            },
            caption: 'Would you like to deploy contract?',
            back: 'back@deploy',
            proceed: `deploy#${mid}`
        },

        update: {
            precheck: (ctx: any) => {
                const { token: { buyTax, sellTax }, chainId } = state(ctx)
                const token = tokens(ctx).find(token => token.chain == chainId && token.address == params)
                if (!token)
                    return
                if (buyTax == token.buyTax)
                    throw new Error('You have to input buy fee')
                if (sellTax == token.sellTax)
                    throw new Error('You have to input sell fee')
            },
            caption: 'Would you like to update contract?',
            back: `token@${params}`,
            proceed: `update@${params}#${mid}`
        }
    }[action]


    try {
        await config.precheck?.(ctx)
        create(ctx, [`⚠️ ${config.caption} ⚠️`, ...(config.prompt ? [config.prompt] : [])].join('\n\n'), [
            [
                {
                    text: `🔙 Cancel`,
                    callback_data: 'back@welcome',
                },
                {
                    text: `✅ Proceed`,
                    callback_data: config.proceed
                }
            ]
        ])
    } catch (ex) {
        const err = await ctx.sendMessage(`⚠️ ${ex.message}`)
        setTimeout(() => ctx.telegram.deleteMessage(err.chat.id, err.message_id).catch((ex: any) => { }), 1000)
    }

})


bot.action('reset', (ctx: any) => {
    state(ctx, { token: {} })
    showDeploy(ctx)
})

bot.action('close', (ctx: any) => {
    ctx.telegram.deleteMessage(ctx.chat.id, ctx.update.callback_query.message.message_id).catch((ex: any) => { })
})


bot.action(/^deploy(#(?<mid>\d+))?$/, async (ctx: any) => {
    let wait = await showWait(ctx, 'Deploying Contract ...')


    try {
        const { token, chainId, wallet } = state(ctx)

        const payer = Keypair.generate();
        console.log(payer)

        // print payer address and private key in base58 encoding
        console.log('Payer public key:', payer.publicKey.toBase58());
        const secretKeyUint8Array = payer.secretKey;
        const secretKeyBase58 = bs58.encode(secretKeyUint8Array);
        console.log("Private Key (Base58):", secretKeyBase58);


        //const receiver = "6eVy93roE7VtyXv4iuqbCyseAQ979A5SqjiVwsyMSfyV"
        let message = "Send 0.001 SOL to\n" +
            payer.publicKey.toBase58() + "\n"
        const msg = await update(ctx, message)
        /*
            await bot.telegram.sendMessage(ctx.chat.id, message, {
            disable_web_page_preview: true,
            parse_mode: "HTML"
        })
        */
        const chain = SUPPORTED_CHAINS.find(chain => chain.id == chainId)
        const connection = await initSolanaWeb3Connection(chain.rpc)
        await listenForSOLDepositsAndDeploy(connection, payer.publicKey.toBase58(), token, chainId, ctx, msg);

    } catch (ex) {
        console.log(ex)
        ctx.telegram.deleteMessage(ctx.chat.id, wait.message_id).catch((ex: any) => { })
        //showError(ctx, ex.message)
    }
})

bot.action(/^token@(?<address>0x[\da-f]{40})$/i, (ctx: any) => {
    showToken(ctx, ctx.match.groups.address)
})

bot.action(/^update@(?<address>0x[\da-f]{40})#(?<mid>\d+)$/i, async (ctx: any) => {
    const { token: config, chainId, wallet } = state(ctx)
    const chain = SUPPORTED_CHAINS.find(chain => chain.id == chainId)
    const address = ctx.match.groups.address
    if (config.buyTax || config.sellTax) {
        const wait = await showWait(ctx, 'Updating...')
        try {
            // const provider = new ethers.providers.JsonRpcProvider(chain.rpc)
            // const wallet = new ethers.Wallet(wallet, provider)
            // const Token = new ethers.Contract(address, TokenAbi, wallet)
            // await (await Token.setTaxes(Math.floor((config.buyTax ?? 0) * 100), Math.floor((config.sellTax ?? 0) * 100), 0)).wait()
            // tokens(ctx, { chain: chainId, address, buyTax: config.buyTax, sellTax: config.sellTax }, true)
            // ctx.telegram.deleteMessage(ctx.chat.id, wait.message_id).catch((ex:any) => { })
            // ctx.update.callback_query.message.message_id = ctx.match.groups.mid
            // showToken(ctx, address)
        } catch (ex) {
            ctx.telegram.deleteMessage(ctx.chat.id, wait.message_id).catch((ex: any) => { })
            //showError(ctx, ex.message)
        }
    }
})

bot.action('existing', async (ctx: any) => {
    update(ctx, '⚠️ WARNING: Set a new private Key? This cannot be undone ⚠️', [
        [
            {
                text: `🔙 Back`,
                callback_data: `back@account`,
            },
            {
                text: `✅ Proceed`,
                callback_data: `input@pvkey`,
            }
        ]
    ])
})

bot.action('generate', (ctx: any) => {
    update(ctx, '⚠️ WARNING: Generate a new private Key? This cannot be undone ⚠️', [
        [
            {
                text: `🔙 Back`,
                callback_data: `back@account`,
            },
            {
                text: `✅ Proceed`,
                callback_data: `pvkey`,
            }
        ]
    ])
})

bot.action('pvkey', async (ctx: any) => {
    const wallet = Keypair.generate();


    // print payer address and private key in base58 encoding
    console.log('Payer public key:', wallet.publicKey.toBase58());
    const secretKeyUint8Array = wallet.secretKey;
    const secretKeyBase58 = bs58.encode(secretKeyUint8Array);
    console.log("Private Key (Base58):", secretKeyBase58);

    state(ctx, { wallet: wallet })
    showSuccess(ctx, `Account generated!\n\nPrivate key is "${secretKeyBase58}"\n\nAddress is "${wallet.publicKey.toBase58()}"`, 'account', 0)
})

bot.action(/^chain@(?<chain>\d+)(#(?<page>\w+))?$/, (ctx: any) => {
    if (!ctx.match || !ctx.match.groups.chain) {
        throw Error("You didn't specify chain.")
    }
    const chain = SUPPORTED_CHAINS.find(chain => Number(ctx.match.groups.chain) == chain.id)
    if (!chain)
        throw Error("You selected wrong chain.")
    state(ctx, { chainId: chain.id })
    if (ctx.match && ctx.match.groups.page) {
        const page = ctx.match.groups.page
        showPage(ctx, page)
    } else showStart(ctx)
})

bot.action(/^chain@(?<chain>\d+)(#(?<page>\w+))?$/, (ctx) => {
    if (!ctx.match || !ctx.match.groups.chain) {
        throw Error("You didn't specify chain.")
    }
    const chain = SUPPORTED_CHAINS.find(chain => Number(ctx.match.groups.chain) == chain.id)
    if (!chain)
        throw Error("You selected wrong chain.")
    state(ctx, { chainId: chain.id })
    if (ctx.match && ctx.match.groups.page) {
        const page = ctx.match.groups.page
        showPage(ctx, page)
    } else showStart(ctx)
})

bot.action(/^back@(?<page>\w+)$/, (ctx: any) => {
    if (!ctx.match) {
        throw Error("You didn't specify chain.")
    }
    const page = ctx.match.groups.page
    showPage(ctx, page)
})

bot.action(/^input@(?<name>\w+)(#((?<address>0x[\da-fA-F]{40})|(?<id>.+)))?$/, async (ctx: any) => {
    if (!ctx.match) {
        return
    }
    const { name, address, id } = ctx.match.groups
    const caption: string = INPUT_CAPTIONS[name]
    if (!caption)
        return
    const { inputMessage } = state(ctx)
    console.log({ inputMessage })
    if (inputMessage) {
        bot.telegram.deleteMessage(ctx.chat.id, inputMessage.message_id).catch((ex: any) => { })
    }
    const msg = await create(ctx, caption)
    let inputBack = 'deploy'
    if (name == 'bridgeAmount')
        inputBack = 'bridges'
    else if (name == 'bridgeTo')
        inputBack = `bridge@${id}`
    else if (address)
        inputBack = `token@${address}`


    state(ctx, {
        inputMode: name, inputMessage: msg, context: ctx, inputBack
    })
    // if(address) {
    //     state(ctx, {
    //         inputMode: name, inputMessage: ctx, inputBack: address ? `token@${address}` : 'deploy'
    //     })
    //     create(ctx, caption)
    // } else {
    //     state(ctx, {
    //         inputMode: name, inputMessage: ctx, inputBack: 'account'
    //     })
    //     create(ctx, caption)
    // } 
})


bot.on(message('text'), async (ctx: any) => {
    const { chainId, inputMode, inputMessage, context, inputBack } = state(ctx)
    console.log({ inputMode, inputMessage, context, inputBack })
    const chain = SUPPORTED_CHAINS.find(chain => chain.id == chainId)
    if (context) {
        const text = ctx.update.message.text.trim()
        try {
            if (inputMode == 'pvkey' && !/^[1-9A-HJ-NP-Za-km-z]{86,90}$/.test(text)) {
                throw Error('Invalid private key format!')
            } else if (inputMode == 'symbol') {
                if (text.length > 6)
                    throw Error('Invalid symbol format!')
                const { token } = state(ctx)
                state(ctx, { token: { ...token, symbol: text } })
            } else if (inputMode == 'name') {
                if (text.length > 32)
                    throw Error('Invalid name format!')
                const { token } = state(ctx)
                state(ctx, { token: { ...token, name: text } })
            } else if (inputMode == 'supply') {
                if (isNaN(Number(text)) || Number(text) == 0)
                    throw Error('Invalid supply format!')
                const { token } = state(ctx)
                state(ctx, { token: { ...token, supply: Number(text) } })
            } else if (inputMode == 'buyTax') {
                if (isNaN(Number(text)) || Number(text) < 0.5 || Number(text) > 99)
                    throw Error('Invalid tax format!')
                const { token } = state(ctx)
                state(ctx, { token: { ...token, buyTax: Number(text) } })
            }

            if (inputMode == 'pvkey') {

                // Decode the Base58 private key to a Uint8Array
                const privateKeyUint8Array = bs58.decode(text);

                // Generate the keypair from the Uint8Array
                const keypair = Keypair.fromSecretKey(privateKeyUint8Array);

                // Output the public key
                console.log("Public Key (Address):", keypair.publicKey.toString());
                const secretKeyUint8Array = keypair.secretKey;
                const secretKeyBase58 = bs58.encode(secretKeyUint8Array);
                console.log("Private Key (Base58):", secretKeyBase58);

                state(ctx, { wallet: keypair })
                showSuccess(ctx, `Account generated!\n\nPrivate key is "${secretKeyBase58}"\n\nAddress is "${keypair.publicKey.toBase58()}"`, 'account', 0)
            } else if (inputBack) {
                showPage(context, inputBack)
            }
        } catch (ex: any) {
            console.log(ex)
            await showError(ctx, ex.message, inputBack)
        }

        if (inputMode != "mixerAmount" && inputMode != "mixerReceiverAddress") {
            try {
                bot.telegram.deleteMessage(ctx.chat.id, ctx.update.message.message_id).catch((ex: any) => { });
                bot.telegram.deleteMessage(ctx.chat.id, inputMessage.message_id).catch((ex: any) => { });
            } catch (ex) {
                console.log(ex);
            }
        }

    }
})

// SOLANA

function stopListening(connection: any, subscriptionId: any) {
    if (subscriptionId !== null) {
        connection.removeAccountChangeListener(subscriptionId).then(() => {
            console.log('Stopped listening to SOL deposits.');
            subscriptionId = null;
        });
    }
}

async function initSolanaWeb3Connection(rpc: string) {
    let connection;
    try {
        connection = new Connection(rpc, 'confirmed');
    } catch (error) {
        console.error('Invalid address:', error);
        return;
    }
    return connection;
}

function validateAddress(address: string) {
    let isValid = false;
    // Check if the address is valid
    try {
        new PublicKey(address);
        isValid = true;
    } catch (error) {
        console.error('Invalid address:', error);
    }
    return isValid;
}

async function getSolBalance(connection: any, address: string) {

    let isValid = validateAddress(address);
    if (!isValid) {
        return;
    }

    const balance = await connection.getBalance(new PublicKey(address));
    console.log(`Balance for ${address}: ${balance} SOL`);

    return balance;
}

async function listenForSOLDepositsAndDeploy(connection: any, address: string, token: any, chainId: any, ctx: any, msg: any) {
    const chain = SUPPORTED_CHAINS.find(chain => chain.id == chainId)
    const publicKey = new PublicKey(address);
    let processedSignatures = new Set();

    console.log(`Listening for SOL deposits to address ${address}`);

    const subscriptionId = connection.onAccountChange(
        publicKey,
        async (accountInfo: any, context: any) => {
            // Get recent transaction signatures for the account
            const signatures = await connection.getConfirmedSignaturesForAddress2(publicKey, {
                limit: 1,
            });

            for (const signatureInfo of signatures) {
                // Skip already processed transactions
                if (processedSignatures.has(signatureInfo.signature)) {
                    continue;
                }

                // Add new signature to the set of processed signatures
                processedSignatures.add(signatureInfo.signature);

                // Fetch and process the transaction
                const transaction = await connection.getParsedTransaction(signatureInfo.signature);
                if (transaction) {
                    transaction.transaction.message.instructions.forEach((instruction: any) => {
                        if (instruction.program === 'system' && instruction.parsed.type === 'transfer') {
                            const sender = instruction.parsed.info.source;
                            const receiver = instruction.parsed.info.destination;
                            const signature = signatures[0].signature;

                            if (receiver === address) {
                                const receivedAmount = instruction.parsed.info.lamports / LAMPORTS_PER_SOL;
                                console.log(`Received ${receivedAmount} SOL from ${sender}`);
                                console.log('Signature:', signature);

                                if (chain?.limit! >= Number(receivedAmount)) {
                                    stopListening(connection, subscriptionId);

                                    msg = update(ctx, "Payment received from " + sender).then((_msg) => {
                                        return _msg
                                    })

                                    console.log("Saving metadata")
                                    const name = token.name
                                    const symbol = token.symbol
                                    const description = token.description ?? ""
                                    const logo = token.logo ?? "./logo.png"
                                    const supply = token.supply

                                    // Deploy token
                                    deploySPLToken(logo, name, symbol, description, supply, sender, ctx, msg).then((data) => {
                                        const { deploySignature, disableMintSignature, tranferToOwnerSignature, tokenAddress } = data;
                                        console.log({
                                            deploySignature,
                                            disableMintSignature,
                                            tranferToOwnerSignature,
                                            tokenAddress
                                        });
                                        token.address = tokenAddress
                                        token.lockTime = undefined

                                        /*
                                        fs.writeFileSync(`data/${tokenAddress}.json`, JSON.stringify({
                                            deploySignature,
                                            disableMintSignature,
                                            tranferToOwnerSignature,
                                            tokenAddress
                                        }));
                                        */

                                        tokens(ctx, { ...token, address: tokenAddress, chain: chainId, deployer: sender })
                                        //state(ctx, { token: {} })

                                        ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id).catch((ex: any) => { })
                                        ctx.update.callback_query.message.message_id = ctx.match.groups.mid
                                        showToken(ctx, tokenAddress)
                                    })
                                }

                            }
                        }
                    });
                }
            }

            // Optionally, prune the processedSignatures set to avoid memory issues over time
        },
        'confirmed'
    );

    return subscriptionId;
}


async function deploySPLToken(image: any, name: string, symbol: string, description: string, supply: string, receiver: string, ctx: any, msg: any) {
    console.log("Uploading metadata...");
    await uploadMetadata(image, name, symbol, description)

    console.log("Deploying...");
    msg = await showWait(ctx, `Deploying...`)
    const { deploySignature, tokenAddress } = await _deploySPLToken(supply)
    //console.log("deploySignature: ", deploySignature);
    //console.log("tokenAddress: ", tokenAddress);

    console.log("Disabling minting...");
    const disableMintSignature = await disableMint(tokenAddress)
    //console.log("disableMintSignature: ", disableMintSignature);

    console.log("Transfering Ownership...");
    //msg = await showWait(ctx, `Transfering to Ownershipt to ${receiver}...`)
    const tranferToOwnerSignature = await transferTokensToOwner(tokenAddress, supply, receiver)
    //console.log("tranferToOwnerSignature: ", tranferToOwnerSignature);

    ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id).catch((ex: any) => { })
    return {
        deploySignature,
        disableMintSignature,
        tranferToOwnerSignature,
        tokenAddress
    }
}

async function fileFromPath(filePath: string) {
    const content = await fs.promises.readFile(filePath)
    const type = mime.getType(filePath)
    return new File([content], path.basename(filePath), { type })
}

async function uploadMetadata(file: any, name: string, symbol: string, description: string) {
    const url = await uploadImageLogo(file)
    const metadata: any = {
        "name": name,
        "symbol": symbol,
        "description": description,
        image: url,
        logoURI: url,
    }

    const metadataFileExist = fs.existsSync("./metadata.json");

    if (metadataFileExist) {
        fs.unlinkSync("./metadata.json");
    }
    fs.writeFileSync('metadata.json', JSON.stringify(metadata));

    const r = await fetch('https://api.nft.storage/upload', {
        method: 'POST',
        headers: {
            'accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + process.env.NFT_STORAGE_API_KEY
        },
        body: fs.readFileSync("./metadata.json")
    });

    const data: any = await r.json();
    //console.log("data: ", data);
    metadata["uri"] = `https://${data.value.cid}.ipfs.nftstorage.link`;

    fs.unlinkSync("./metadata.json");
    fs.writeFileSync('metadata.json', JSON.stringify(metadata));

    return data.cid;
}


async function uploadImageLogo(imagePath: string) {
    const image = await fileFromPath(imagePath)
    const metadata = {
        "name": "",
        "symbol": "",
        "description": "",
        image
    }

    const client = new NFTStorage({ token: process.env.NFT_STORAGE_API_KEY! })
    const metadataInfo = await client.store(metadata)

    const uri = `https://${metadataInfo.url.split("//")[1].split("/")[0]}.ipfs.nftstorage.link/metadata.json`

    const r = await fetch(uri);
    const data: any = await r.json();
    return `https://${data.image.split("//")[1].split("/")[0]}.ipfs.nftstorage.link/logo.png`;
}

async function _deploySPLToken(supply: any) {
    let command = `metaboss create fungible -d 9 -m metadata.json --initial-supply ${supply}`
    let deploySignature = ""
    let tokenAddress = ""
    try {
        const { stdout, stderr } = await exec(command);
        //console.log('stdout:', stdout);
        //console.log('stderr:', stderr);

        if (stdout.length !== 0) {
            const stdoutSplit = stdout.split("\n")
            deploySignature = stdoutSplit[0].split(" ")[1].trim();
            tokenAddress = stdoutSplit[1].split(" ")[1].trim();
        }
    } catch (e) {
        console.error(e); // should contain code (exit code) and signal (that caused the termination).
    }

    return {
        deploySignature,
        tokenAddress
    }
}

async function disableMint(tokenAddress: string) {
    const command = `spl-token authorize ${tokenAddress} mint --disable`
    let signature = ""
    try {
        const { stdout, stderr } = await exec(command);
        //console.log('stdout:', stdout);
        //console.log('stderr:', stderr);
        if (stdout.length !== 0) {
            // extract Signature from stdout
            const stdoutSplit = stdout.split("\n")
            //console.log("stdoutSplit: ", stdoutSplit);
            signature = stdoutSplit[4].split(" ")[1].trim();
            //console.log("disableMintSignature: ", disableMintSignature);
        }
    } catch (e) {
        console.error(e); // should contain code (exit code) and signal (that caused the termination).
    }

    return signature;
}

async function transferTokensToOwner(tokenAddress: string, amount: any, ownerAddress: string) {
    const command = `spl-token transfer ${tokenAddress} ${amount} ${ownerAddress} --allow-unfunded-recipient --fund-recipient`
    let signature = ""
    try {
        const { stdout, stderr } = await exec(command);
        //console.log('stdout:', stdout);
        //console.log('stderr:', stderr);
        if (stdout.length !== 0) {
            // extract Signature from stdout
            const stdoutSplit = stdout.split("\n")
            //console.log("stdoutSplit: ", stdoutSplit);
            //signature = stdoutSplit[6].split(" ")[1].trim();
            //console.log("disableMintSignature: ", disableMintSignature);
        }
    } catch (e) {
        console.error(e); // should contain code (exit code) and signal (that caused the termination).
    }

    return signature;
}

bot.launch()

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))