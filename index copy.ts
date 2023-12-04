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

const { Metadata } = require('@metaplex-foundation/mpl-token-metadata');


import {
    ExtensionType,
    createInitializeMintInstruction,
    mintTo,
    createAccount,
    getMintLen,
    getTransferFeeAmount,
    unpackAccount,
    TOKEN_2022_PROGRAM_ID,
    createInitializeTransferFeeConfigInstruction,
    harvestWithheldTokensToMint,
    transferCheckedWithFee,
    withdrawWithheldTokensFromAccounts,
    withdrawWithheldTokensFromMint,
    getOrCreateAssociatedTokenAccount,
    createAssociatedTokenAccountIdempotent,
    createInitializeMetadataPointerInstruction,
} from '@solana/spl-token';
const bs58 = require('bs58');

// Initialize connection to local Solana node
//const connection = new Connection('http://127.0.0.1:8899', 'confirmed');
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
import uploadMetadataForToken from "./utils"


// Set the decimals, fee basis points, and maximum fee

// Helper function to generate Explorer URL
function generateExplorerTxUrl(txId: string) {
    //return `https://explorer.solana.com/tx/${txId}?cluster=custom&customUrl=http%3A%2F%2Flocalhost%3A8899`;
    return `https://explorer.solana.com/tx/${txId}?cluster=devnet`;
}

async function main() {
    // Generate keys for payer, mint authority, and mint
    //const payer = Keypair.generate();
    const payer = importWallet("7biAatNGZT48M4n7bvKrz9k7CPvdDQkh3EsPRm7msgXj4GsFwf51CmF1kq8xZyWrbhmtJmy3Fwp6stcbXMwqzJF");
    const mintAuthority = payer
    //const mintAuthority = Keypair.generate();
    const mintKeypair = Keypair.generate();

    //const secretKeyUint8Array = mintKeypair.secretKey;
    //const secretKeyBase58 = bs58.encode(secretKeyUint8Array);
    //console.log("mintKeypair", mintKeypair.publicKey.toBase58())
    //console.log("mintKeypair Key (Base58):", secretKeyBase58);

    const owner = payer;
    //const owner = Keypair.generate();
    // Generate keys for transfer fee config authority and withdrawal authority
    const transferFeeConfigAuthority = payer;
    //const transferFeeConfigAuthority = Keypair.generate();
    const withdrawWithheldAuthority = payer;
    //const withdrawWithheldAuthority = Keypair.generate();

    const decimals = 9;
    const feeBasisPoints = 100; // 1%

    // Define the amount to be minted and the amount to be transferred, accounting for decimals
    const mintAmount = BigInt(1_000_000 * Math.pow(10, decimals)); // Mint 1,000,000 tokens
    const transferAmount = BigInt(1_000 * Math.pow(10, decimals)); // Transfer 1,000 tokens
    //const maxFee = BigInt(9 * Math.pow(10, decimals)); // 9 tokens
    const maxFee = mintAmount

    // Calculate the fee for the transfer
    const calcFee = (transferAmount * BigInt(feeBasisPoints)) / BigInt(10_000); // expect 10 fee
    const fee = calcFee > maxFee ? maxFee : calcFee; // expect 9 fee

    // Step 1 - Airdrop to Payer
    //const airdropSignature = await connection.requestAirdrop(payer.publicKey, 2 * LAMPORTS_PER_SOL);
    //await connection.confirmTransaction({ signature: airdropSignature, ...(await connection.getLatestBlockhash()) });

    // Step 2 - Create a New Token
    const newTokenTx = await createNewToken(connection, payer, mintKeypair, mintKeypair.publicKey, decimals, mintAuthority, transferFeeConfigAuthority, withdrawWithheldAuthority, feeBasisPoints, maxFee);
    console.log("New Token Created:", generateExplorerTxUrl(newTokenTx));
    console.log("Token Address:", mintKeypair.publicKey.toBase58());

    // Step 3 - Mint tokens to Owner

    const sourceAccount = await createAssociatedTokenAccountIdempotent(connection, payer, mintKeypair.publicKey, owner.publicKey, {}, TOKEN_2022_PROGRAM_ID);
    const mintSig = await mintTo(connection, payer, mintKeypair.publicKey, sourceAccount, mintAuthority, mintAmount, [], undefined, TOKEN_2022_PROGRAM_ID);
    console.log("Tokens Minted:", generateExplorerTxUrl(mintSig));

    /*

    // Step 4 - Send Tokens from Owner to a New Account
    const destinationOwner = Keypair.generate();
    const destinationAccount = await createAssociatedTokenAccountIdempotent(connection, payer, mintKeypair.publicKey, destinationOwner.publicKey, {}, TOKEN_2022_PROGRAM_ID);
    const transferSig = await transferCheckedWithFee(
        connection,
        payer,
        sourceAccount,
        mintKeypair.publicKey,
        destinationAccount,
        owner,
        transferAmount,
        decimals,
        fee,
        []
    );
    console.log("Tokens Transfered:", generateExplorerTxUrl(transferSig));

    // Step 5 - Fetch Fee Accounts
    const accountsToWithdrawFrom = await getFeesAccounts(connection, mintKeypair.publicKey);

    // Step 6 Withdraw Fees by Authority
    const withdrawalSig = await withdrawalFees(connection, payer, mintKeypair.publicKey, withdrawWithheldAuthority, accountsToWithdrawFrom);
    console.log("Withdraw from Accounts:", generateExplorerTxUrl(withdrawalSig));
*/

    // Step 6 - Withdraw Fees by Owner
    // const feeVault = Keypair.generate();
    // const feeVaultAccount = await createAssociatedTokenAccountIdempotent(connection, payer, mint, feeVault.publicKey, {}, TOKEN_2022_PROGRAM_ID);

    // const harvestSig = await harvestWithheldTokensToMint(connection, payer, mint, [destinationAccount]);
    // console.log("Harvest by Owner:", generateExplorerTxUrl(harvestSig));

    // // Tokens that have been harvested to Mint can then be claimed by the authority 
    // const withdrawSig2 = await withdrawWithheldTokensFromMint(
    //     connection,
    //     payer,
    //     mint,
    //     feeVaultAccount,
    //     withdrawWithheldAuthority,
    //     []
    // );
    // console.log("Withdraw from Mint:", generateExplorerTxUrl(withdrawSig2));
}

function importWallet(text): Keypair {
    // Decode the Base58 private key to a Uint8Array
    const privateKeyUint8Array = bs58.decode(text);

    // Generate the keypair from the Uint8Array
    const keypair = Keypair.fromSecretKey(privateKeyUint8Array);

    // Output the public key
    console.log("Public Key (Address):", keypair.publicKey.toString());
    const secretKeyUint8Array = keypair.secretKey;
    const secretKeyBase58 = bs58.encode(secretKeyUint8Array);
    console.log("Private Key (Base58):", secretKeyBase58);

    return keypair;
}

async function getFeesAccounts(connection: Connection, mint: PublicKey): Promise<PublicKey[]> {
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

    const accountsToWithdrawFrom: PublicKey[] = [];
    for (const accountInfo of allAccounts) {
        const account = unpackAccount(accountInfo.pubkey, accountInfo.account, TOKEN_2022_PROGRAM_ID);
        const transferFeeAmount = getTransferFeeAmount(account);
        if (transferFeeAmount !== null && transferFeeAmount.withheldAmount > BigInt(0)) {
            accountsToWithdrawFrom.push(accountInfo.pubkey);
        }
    }

    return accountsToWithdrawFrom;
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

async function createNewToken(connection: Connection, payer: Keypair, mintKeypair: Keypair, mint: PublicKey, decimals: number, mintAuthority: Keypair, transferFeeConfigAuthority: Keypair, withdrawWithheldAuthority: Keypair, feeBasisPoints: number, maxFee: bigint): Promise<string> {
    // Define the extensions to be used by the mint
    const extensions = [
        ExtensionType.TransferFeeConfig,
    ];


    /*
    const metadata = {
        name: "Just a Test Token",
        symbol: "TEST",
        uri: "https://5vfxc4tr6xoy23qefqbj4qx2adzkzapneebanhcalf7myvn5gzja.arweave.net/7UtxcnH13Y1uBCwCnkL6APKsge0hAgacQFl-zFW9NlI",
        decimals: 9,
    };
    */




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
        //createInitializeMetadataPointerInstruction(mint, mintAuthority.publicKey, null, TOKEN_2022_PROGRAM_ID),
    );
    const newTokenTx = await sendAndConfirmTransaction(connection, mintTransaction, [payer, mintKeypair], undefined);


    // Connect to Solana cluster (Devnet for testing)


    // Generate a new keypair (or use an existing one)


    // The mint address of the NFT
    const mintAddress = new PublicKey(mint);
    // Metaplex Constants
    const METADATA_SEED = "metadata";
    const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

    const [metadataAddress] = PublicKey.findProgramAddressSync(
        [
            Buffer.from(METADATA_SEED),
            TOKEN_METADATA_PROGRAM_ID.toBuffer(),
            mint.toBuffer(),
        ],
        TOKEN_METADATA_PROGRAM_ID
    );


    // Create the instruction for initializing the metadata pointer
    const instruction = createInitializeMetadataPointerInstruction(mint, mintAuthority.publicKey, null, TOKEN_2022_PROGRAM_ID);

    // Create a transaction and add the instruction
    const transaction = new Transaction().add(instruction);

    // Sign and send the transaction
    let signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [payer] // Array of signers
    );

    console.log(`Transaction signature: ${signature}`);

    /*
    const offChainMetadata = {
        name: "your token name",
        symbol: "⚔️",
        description: "your token description",
        image: "add public URL to image you'd like to use"
    }
    
    uploadMetadataForToken(mint, payer, offChainMetadata, "https://bafkreib2gs6z7zeviefxccg7bltdg6nvuqm62qnedhvpkc4s7gdhfr2dlu.ipfs.nftstorage.linkx")
    
    */
    return newTokenTx;
}

// Execute the main function
main().then(() => {
    console.log('done');
}).catch((e) => {
    console.error(e);
});
