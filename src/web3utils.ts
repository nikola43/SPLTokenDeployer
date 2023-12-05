import { ExtensionType, TOKEN_2022_PROGRAM_ID, createAssociatedTokenAccountIdempotent, createInitializeMintInstruction, createInitializeTransferFeeConfigInstruction, getAssociatedTokenAddress, getMintLen, getTransferFeeAmount, mintTo, unpackAccount, withdrawWithheldTokensFromAccounts } from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { AccountsAmount } from "./types";
import { showToken, showWait } from "./tgutils";
import { fileFromPath, tokens } from "./utils";
import { File, NFTStorage } from 'nft.storage';
import { METADATA_2022_PROGRAM_ID, METADATA_2022_PROGRAM_ID_TESTNET, SUPPORTED_CHAINS } from "./constants";
import { DataV2, createCreateMetadataAccountV3Instruction } from "@metaplex-foundation/mpl-token-metadata";

const fs = require("fs")

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

export async function initSolanaWeb3Connection(rpc: string): Promise<Connection> {
    let connection: Connection;
    try {
        connection = new Connection(rpc, 'confirmed');
    } catch (error) {
        console.error('Invalid address:', error);
        return;
    }
    return connection;
}

export async function getSolBalance(connection: Connection, address: string) {
    let balance = 0;
    try {
        let isValid = validateAddress(address);
        if (!isValid) {
            return 0;
        }
        balance = await connection.getBalance(new PublicKey(address));
        console.log(`Balance for ${address}: ${balance} SOL`);
    } catch (error) {
        console.error('Invalid address:', error);
    }
    return balance;
}

export async function getFeesAccounts(connection: Connection, mint: string): Promise<AccountsAmount> {
    console.log("getFeesAccounts")
    console.log({
        mint
    })
    const allAccounts = await connection.getProgramAccounts(TOKEN_2022_PROGRAM_ID, {
        commitment: 'confirmed',
        filters: [
            {
                memcmp: {
                    offset: 0,
                    bytes: mint.toString(),
                },
            },
        ],
    });

    console.log({
        allAccounts
    })

    const accountsToWithdrawFrom: PublicKey[] = [];
    let amount: bigint = BigInt("0");
    for (const accountInfo of allAccounts) {
        const account = unpackAccount(accountInfo.pubkey, accountInfo.account, TOKEN_2022_PROGRAM_ID);
        const transferFeeAmount = getTransferFeeAmount(account);
        console.log({
            transferFeeAmount
        })
        if (transferFeeAmount !== null && transferFeeAmount.withheldAmount > BigInt(0)) {
            amount = amount + transferFeeAmount.withheldAmount;
            console.log({
                T: transferFeeAmount.withheldAmount,
                amount
            })
            accountsToWithdrawFrom.push(accountInfo.pubkey);
        }
    }
    return { accounts: accountsToWithdrawFrom, amount };
}

export function stopListening(connection: Connection, subscriptionId: any) {
    if (subscriptionId !== null) {
        connection.removeAccountChangeListener(subscriptionId).then(() => {
            console.log('Stopped listening to SOL deposits.');
            subscriptionId = null;
        });
    }
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

export async function deploySPLToken(connection: Connection, image: any, name: string, symbol: string, description: string, supply: string, taxes: string, payer: Keypair, ctx: any, msg: any) {

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



export async function withdrawalFees(connection: Connection, payer: Keypair, mint: PublicKey, withdrawWithheldAuthority: Keypair, accountsToWithdrawFrom: PublicKey[]): Promise<string> {
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

export async function listenForSOLDepositsAndDeploy(connection: Connection, wallet: Keypair, token: any, chainId: any, ctx: any, msg: any) {
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
        },
        'confirmed'
    );

    return subscriptionId;
}


/*
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
*/