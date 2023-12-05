import {
    Connection,
    Keypair,
    LAMPORTS_PER_SOL,
    PublicKey,
    sendAndConfirmTransaction,
    SystemProgram,
    Transaction
} from '@solana/web3.js';

import {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    createAssociatedTokenAccountIdempotent,
    createInitializeMintInstruction,
    createInitializeTransferFeeConfigInstruction,
    ExtensionType,
    getAssociatedTokenAddress,
    getMintLen,
    getTransferFeeAmount,
    mintTo,
    TOKEN_2022_PROGRAM_ID,
    unpackAccount,
    withdrawWithheldTokensFromAccounts
} from '@solana/spl-token';
import { createCreateMetadataAccountV3Instruction, DataV2 } from "@metaplex-foundation/mpl-token-metadata";
import axios from 'axios';
import fetch from 'node-fetch';
import { File, NFTStorage } from 'nft.storage';

const { Telegraf } = require("telegraf")
const { message } = require("telegraf/filters")
const fs = require("fs")
const path = require("path")
const bs58 = require('bs58');
const mime = require('mime')
const dotenv = require("dotenv")
dotenv.config()


import { SUPPORTED_CHAINS, INPUT_CAPTIONS, METADATA_2022_PROGRAM_ID, METADATA_2022_PROGRAM_ID_TESTNET } from "./constants"
import { Buttons, DeployedToken, AccountsAmounts } from "./types"
import { escape_markdown, tokens, } from "./utils"
import { update, create, showWelcome, showStart, showWallet, showAccount, showPage, showSuccess, showDeploy } from "./tgutils"
import { state, states } from "./state"
import { getFeesAccounts, getSolBalance, initSolanaWeb3Connection } from './web3utils';

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

bot.use(async (ctx: any, next: any) => {
    const t = Date.now()
    const res = await next()
    console.log(ctx.match?.input, Date.now() - t)
    return res
})





const showWait = async (ctx: any, caption: string) => {
    return update(ctx, `⌛ ${caption}`)
}



const showError = async (ctx: any, error: any, href: any, duration = 10000) => {
    // showPage(ctx, href)
    const err = await create(ctx, `⚠ ${error}`)
    if (duration)
        setTimeout(() => ctx.telegram.deleteMessage(ctx.chat.id, err.message_id).catch((ex: any) => { }), duration)
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
    const { token, chainId } = state(ctx)
    const mid = ctx.update.callback_query.message.message_id
    console.log({ action, params, mid })
    const chain = SUPPORTED_CHAINS.find(chain => chain.id == chainId)


    const config = {
        deploy: {
            precheck: async (ctx: any) => {

                if (!token.symbol)
                    throw new Error('You have to input symbol')
                if (!token.name)
                    throw new Error('You have to input name')
                if (!token.supply)
                    throw new Error('You have to specify supply')


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
    let wait = await showWait(ctx, 'Checking account balance...')


    try {
        const { token, chainId, wallet } = state(ctx)
        const chain = SUPPORTED_CHAINS.find(chain => chain.id == chainId)
        const connection = await initSolanaWeb3Connection(chain.rpc)
        const solBalance = await getSolBalance(connection, wallet.publicKey.toBase58());
        const limit = chain.limit

        if (solBalance < limit) {
            wait = await showWait(ctx, `Send ${limit} SOL to\n` + wallet.publicKey.toBase58() + "\n")
            await listenForSOLDepositsAndDeploy(connection, wallet, token, chainId, ctx, wait);
        } else {

            console.log("Saving metadata")
            const name = token.name
            const symbol = token.symbol
            const description = token.description ?? ""
            const logo = token.logo ?? "./logo.png"
            const supply = token.supply
            const taxes = token.taxes ?? 0

            // Deploy token
            deploySPLToken(connection, logo, name, symbol, description, supply, taxes, wallet, ctx, wait).then((data) => {
                const { tokenAddress } = data;
                console.log({
                    tokenAddress
                });
                token.address = tokenAddress
                token.lockTime = undefined

                tokens(ctx, { ...token, address: tokenAddress, chain: chainId, deployer: wallet.publicKey.toBase58() })
                //state(ctx, { token: {} })

                ctx.telegram.deleteMessage(ctx.chat.id, wait.message_id).catch((ex: any) => { })
                ctx.update.callback_query.message.message_id = ctx.match.groups.mid
                showToken(ctx, tokenAddress)
            })
        }
    } catch (ex) {
        console.log(ex)
        ctx.telegram.deleteMessage(ctx.chat.id, wait.message_id).catch((ex: any) => { })
        //showError(ctx, ex.message)
    }
})

bot.action(/^token@(?<address>[A-Za-z0-9]{44})$/i, (ctx: any) => {
    console.log("token@" + ctx.match.groups.address)
    showToken(ctx, ctx.match.groups.address)
})

bot.action(/^refresh@(?<address>[A-Za-z0-9]{44})$/i, (ctx: any) => {
    const address = ctx.match.groups.address
    showWait(ctx, 'Refreshing...').then((_msg) => {
        showToken(ctx, address)
    })
})

bot.action(/^withdraw@(?<address>[A-Za-z0-9]{44})$/i, (ctx: any) => {
    const address = ctx.match.groups.address
    const { chainId, wallet } = state(ctx)
    const chain = SUPPORTED_CHAINS.find(chain => chain.id == chainId)
    showWait(ctx, 'Claiming...').then((_msg) => {

        initSolanaWeb3Connection(chain.rpc).then((_connection) => {
            const mintPublicKey = new PublicKey(address)
            const accountsAmounts = getFeesAccounts(_connection, mintPublicKey.toString()).then((_accountsAmounts) => {
                _accountsAmounts
                console.log({
                    accountsAmounts
                })
                withdrawalFees(_connection, wallet, mintPublicKey, wallet, _accountsAmounts.accounts).then((tx) => {
                    return tx
                })
                showToken(ctx, address)
            })
        })
    })


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
    console.log({
        ctx
    })
    bot.telegram.deleteMessage(ctx.chat.id, ctx.update.update_id).catch((ex: any) => { });
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
    console.log({
        cq: ctx.update.callback_query
    })
    bot.telegram.deleteMessage(ctx.chat.id, ctx.update.callback_query.message.message_id).catch((ex: any) => { })
    console.log({
        ctx
    })
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
            } else if (inputMode == 'taxes') {
                if (isNaN(Number(text)) || Number(text) > 100 || Number(text) < 0)
                    throw Error('Invalid taxes format!')
                const { token } = state(ctx)
                state(ctx, { token: { ...token, taxes: Number(text) } })
            } else if (inputMode == 'description') {
                if (text.length > 64)
                    throw Error('Invalid description format!')
                const { token } = state(ctx)
                state(ctx, { token: { ...token, description: text } })
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
                console.log({
                    context, inputBack
                })
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

function stopListening(connection: Connection, subscriptionId: any) {
    if (subscriptionId !== null) {
        connection.removeAccountChangeListener(subscriptionId).then(() => {
            console.log('Stopped listening to SOL deposits.');
            subscriptionId = null;
        });
    }
}


async function getTokenBalance(connection: Connection, walletAddress: string, tokenAddress: string): Promise<number> {
    // The wallet address
    const wallet = new PublicKey(walletAddress);

    // The SPL Token Address
    const tokenMintAddress = new PublicKey(tokenAddress);

    // Find the associated token address
    const associatedTokenAddress = await getAssociatedTokenAddress(
        tokenMintAddress,
        wallet,
        false,
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_2022_PROGRAM_ID
    );

    // Get the account info
    const accountInfo = await connection.getParsedAccountInfo(associatedTokenAddress);
    const balance = accountInfo.value.lamports / LAMPORTS_PER_SOL;

    console.log('Balance:', balance);
    return balance
}

async function listenForSOLDepositsAndDeploy(connection: Connection, wallet: Keypair, token: any, chainId: any, ctx: any, msg: any) {
    const chain = SUPPORTED_CHAINS.find(chain => chain.id == chainId)
    let processedSignatures = new Set();

    console.log(`Listening for SOL deposits to address ${wallet.publicKey.toBase58()}`);

    const subscriptionId = connection.onAccountChange(
        wallet.publicKey,
        async (accountInfo: any, context: any) => {
            // Get recent transaction signatures for the account
            const signatures = await connection.getConfirmedSignaturesForAddress2(wallet.publicKey, {
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

                            if (receiver === wallet.publicKey.toBase58()) {
                                const receivedAmount = instruction.parsed.info.lamports / LAMPORTS_PER_SOL;
                                console.log(`Received ${receivedAmount} SOL from ${sender}`);
                                console.log('Signature:', signature);

                                console.log({
                                    cLimit: chain?.limit,
                                    received: Number(receivedAmount)
                                })

                                if (Number(receivedAmount) >= chain?.limit!) {
                                    stopListening(connection, subscriptionId);

                                    msg = showWait(ctx, `Payment received ${receivedAmount} SOL from ${sender}`).then((_msg) => {
                                        return _msg
                                    })

                                    console.log("Saving metadata")
                                    const name = token.name
                                    const symbol = token.symbol
                                    const description = token.description ?? ""
                                    const logo = token.logo ?? "./logo.png"
                                    const supply = token.supply
                                    const taxes = token.taxes ?? 0

                                    // Deploy token
                                    deploySPLToken(connection, logo, name, symbol, description, supply, taxes, wallet, ctx, msg).then((data) => {
                                        const { tokenAddress } = data;
                                        console.log({
                                            tokenAddress
                                        });
                                        token.address = tokenAddress
                                        token.lockTime = undefined

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


async function deploySPLToken(connection: Connection, image: any, name: string, symbol: string, description: string, supply: string, taxes: string, payer: Keypair, ctx: any, msg: any) {

    msg = showWait(ctx, `Uploading metadata...`).then((_msg) => {
        return _msg
    })

    const decimals = 9;
    const feeBasisPoints = Number(taxes) * 100; // 1%
    const uri = await uploadMetadata(image, name, symbol, description, feeBasisPoints)
    console.log("Metadata uploaded:", uri);

    // Generate keys for payer, mint authority, and mint
    const mintAuthority = payer
    //const mintAuthority = Keypair.generate();
    const mintKeypair = Keypair.generate();
    const owner = payer;
    //const owner = Keypair.generate();
    // Generate keys for transfer fee config authority and withdrawal authority
    const transferFeeConfigAuthority = payer;
    //const transferFeeConfigAuthority = Keypair.generate();
    const withdrawWithheldAuthority = payer;
    //const withdrawWithheldAuthority = Keypair.generate();



    const mintAmount = BigInt(Number(supply) * Math.pow(10, decimals)); // Mint 1,000,000 tokens
    //const maxFee = BigInt(9 * Math.pow(10, decimals)); // 9 tokens
    const maxFee = mintAmount

    // Step 2 - Create a New Token

    msg = showWait(ctx, `Deploying....`).then((_msg) => {
        return _msg
    })

    const newTokenTx = await createNewToken(connection, payer, mintKeypair, mintKeypair.publicKey, decimals, mintAuthority, transferFeeConfigAuthority, withdrawWithheldAuthority, feeBasisPoints, maxFee, image, name, symbol, description, uri);
    //console.log("New Token Created:", generateExplorerTxUrl(newTokenTx));
    console.log("Token Address:", mintKeypair.publicKey.toBase58());

    // Step 3 - Mint tokens to Owner
    const sourceAccount = await createAssociatedTokenAccountIdempotent(connection, payer, mintKeypair.publicKey, owner.publicKey, {}, TOKEN_2022_PROGRAM_ID);
    const mintSig = await mintTo(connection, payer, mintKeypair.publicKey, sourceAccount, mintAuthority, mintAmount, [], undefined, TOKEN_2022_PROGRAM_ID);
    //console.log("Tokens Minted:", generateExplorerTxUrl(mintSig));

    console.log({
        msg
    })
    ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id).catch((ex: any) => { })
    //ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id).catch((ex: any) => { })

    return {
        tokenAddress: mintKeypair.publicKey.toBase58()
    }
}



async function withdrawalFees(connection: Connection, payer: Keypair, mint: PublicKey, withdrawWithheldAuthority: Keypair, accountsToWithdrawFrom: PublicKey[]): Promise<string> {
    const feeVault = Keypair.generate();
    const feeVaultAccount = await createAssociatedTokenAccountIdempotent(connection, payer, mint, feeVault.publicKey, {}, TOKEN_2022_PROGRAM_ID);
    const withdrawSig1 = await withdrawWithheldTokensFromAccounts(
        connection,
        payer,
        mint,
        feeVaultAccount,
        withdrawWithheldAuthority,
        [],
        accountsToWithdrawFrom
    );
    return withdrawSig1;
}

async function createNewToken(connection: Connection, payer: Keypair, mintKeypair: Keypair, mint: PublicKey, decimals: number, mintAuthority: Keypair, transferFeeConfigAuthority: Keypair, withdrawWithheldAuthority: Keypair, feeBasisPoints: number, maxFee: bigint, image: any, name: string, symbol: string, description: string, uri): Promise<string> {
    // Define the extensions to be used by the mint
    const extensions = [
        ExtensionType.TransferFeeConfig,
    ];

    //Create token metadata
    const [metadataPDA] = PublicKey.findProgramAddressSync([Buffer.from("metadata"), metadataProgram(connection).toBuffer(), mint.toBuffer()], metadataProgram(connection))

    const ON_CHAIN_METADATA = {
        name: name,
        symbol: symbol,
        uri: uri,
        sellerFeeBasisPoints: feeBasisPoints,
        uses: null,
        creators: null,
        collection: null,
    } as DataV2;

    // Calculate the length of the mint
    const mintLen = getMintLen(extensions);
    const mintLamports = await connection.getMinimumBalanceForRentExemption(mintLen);
    const mintTransaction = new Transaction().add(
        SystemProgram.createAccount({
            fromPubkey: payer.publicKey,
            newAccountPubkey: mint,
            space: mintLen,
            lamports: mintLamports,
            programId: TOKEN_2022_PROGRAM_ID,
        }),
        createInitializeTransferFeeConfigInstruction(
            mint,
            transferFeeConfigAuthority.publicKey,
            withdrawWithheldAuthority.publicKey,
            feeBasisPoints,
            maxFee,
            TOKEN_2022_PROGRAM_ID
        ),
        createInitializeMintInstruction(mint, decimals, mintAuthority.publicKey, null, TOKEN_2022_PROGRAM_ID),
        createCreateMetadataAccountV3Instruction({
            metadata: metadataPDA,
            mint: mint,
            mintAuthority: payer.publicKey,
            payer: payer.publicKey,
            updateAuthority: payer.publicKey,
        }, {
            createMetadataAccountArgsV3:
            {
                data: ON_CHAIN_METADATA,
                isMutable: true,
                collectionDetails: null
            }
        }, metadataProgram(connection)),
    );
    return await sendAndConfirmTransaction(connection, mintTransaction, [payer, mintKeypair], undefined);
}

async function fileFromPath(filePath: string) {
    const content = await fs.promises.readFile(filePath)
    const type = mime.getType(filePath)
    return new File([content], path.basename(filePath), { type })
}

async function uploadMetadata(file: any, name: string, symbol: string, description: string, feeBasisPoints: number) {
    const url = await uploadImageLogo(file)
    const metadata: any = {
        "name": name,
        "symbol": symbol,
        "description": description,
        "seller_fee_basis_points": feeBasisPoints,
        image: url
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

    return `https://${data.value.cid}.ipfs.nftstorage.link`
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
    const imageName = imagePath.split("/")[2]
    return `https://${data.image.split("//")[1].split("/")[0]}.ipfs.nftstorage.link/${imageName}`;
}



function metadataProgram(connection: Connection): PublicKey {
    const isDevnet = connection.rpcEndpoint.indexOf("devnet") > -1;
    return isDevnet ? METADATA_2022_PROGRAM_ID_TESTNET : METADATA_2022_PROGRAM_ID
}

bot.on('photo', async (ctx) => {
    const photos = ctx.message.photo;
    const fileId = photos[photos.length - 1].file_id;
    console.log(ctx.message)

    try {
        const url = await bot.telegram.getFileLink(fileId);
        const response = await axios.get(url, { responseType: 'stream' });
        const fileName = `../data/images/image_${ctx.chat.id}.jpg`;

        // Saving the image to disk
        const filePath = path.join(__dirname, fileName);
        const writer = fs.createWriteStream(filePath);

        response.data.pipe(writer);

        writer.on('finish', () => {
            //ctx.reply('Image saved to disk!')
        });
        writer.on('error', (error) => {
            console.error('Error saving image:', error);
            ctx.reply('Error saving image to disk.');
        });

        bot.telegram.deleteMessage(ctx.chat.id, ctx.update.message.message_id).catch((ex: any) => { });
        bot.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id).catch((ex: any) => { })

        const { token, context } = state(ctx)
        state(ctx, { token: { ...token, logo: `data/images/image_${ctx.chat.id}.jpg` } })
        showPage(context, "deploy")
    } catch (error) {
        console.error('Error downloading image:', error);
        ctx.reply('Error downloading image.');
    }
});

bot.launch()

process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))

function showToken(ctx: any, tokenAddress: string) {
    throw new Error('Function not implemented.');
}
