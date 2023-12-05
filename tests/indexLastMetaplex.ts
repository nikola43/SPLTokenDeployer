import { Transaction, SystemProgram, Keypair, Connection, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
import { MINT_SIZE, TOKEN_PROGRAM_ID, createInitializeMintInstruction, getMinimumBalanceForRentExemptMint, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createMintToInstruction } from '@solana/spl-token';
import { DataV2, createCreateMetadataAccountV3Instruction } from '@metaplex-foundation/mpl-token-metadata';
import { bundlrStorage, keypairIdentity, Metaplex, UploadMetadataInput } from '@metaplex-foundation/js';
const bs58 = require('bs58');
import secret from './my-keypair.json';

const endpoint = 'https://example.solana-devnet.quiknode.pro/000000/'; //Replace with your RPC Endpoint
const solanaConnection = new Connection(endpoint);
//const userWallet = Keypair.fromSecretKey(new Uint8Array(secret));
const userWallet = importWallet("7biAatNGZT48M4n7bvKrz9k7CPvdDQkh3EsPRm7msgXj4GsFwf51CmF1kq8xZyWrbhmtJmy3Fwp6stcbXMwqzJF");


const metaplex = Metaplex.make(solanaConnection)
    .use(keypairIdentity(userWallet))
    .use(bundlrStorage({
        address: 'https://devnet.bundlr.network',
        providerUrl: endpoint,
        timeout: 60000,
    }));

const MINT_CONFIG = {
    numDecimals: 6,
    numberTokens: 1337
}

const MY_TOKEN_METADATA: UploadMetadataInput = {
    name: "Test Token",
    symbol: "TEST",
    description: "This is a test token!",
    image: "https://URL_TO_YOUR_IMAGE.png" //add public URL to image you'd like to use
}

const ON_CHAIN_METADATA = {
    name: MY_TOKEN_METADATA.name,
    symbol: MY_TOKEN_METADATA.symbol,
    uri: 'TO_UPDATE_LATER',
    sellerFeeBasisPoints: 0,
    creators: null,
    collection: null,
    uses: null
} as DataV2;

/**
 * 
 * @param wallet Solana Keypair
 * @param tokenMetadata Metaplex Fungible Token Standard object 
 * @returns Arweave url for our metadata json file
 */
const uploadMetadata = async (tokenMetadata: UploadMetadataInput): Promise<string> => {
    //Upload to Arweave
    const { uri } = await metaplex.nfts().uploadMetadata(tokenMetadata);
    console.log(`Arweave URL: `, uri);
    return uri;
}

function importWallet(text): Keypair {
    // Decode the Base58 private key to a Uint8Array
    const privateKeyUint8Array = bs58.decode(text);

    // Generate the keypair from the Uint8Array
    const keypair = Keypair.fromSecretKey(privateKeyUint8Array);

    // Output the public key
    //console.log("Public Key (Address):", keypair.publicKey.toString());
    const secretKeyUint8Array = keypair.secretKey;
    const secretKeyBase58 = bs58.encode(secretKeyUint8Array);
    //console.log("Private Key (Base58):", secretKeyBase58);

    return keypair;
}

const createNewMintTransaction = async (connection: Connection, payer: Keypair, mintKeypair: Keypair, destinationWallet: PublicKey, mintAuthority: PublicKey, freezeAuthority: PublicKey) => {
    //Get the minimum lamport balance to create a new account and avoid rent payments
    const requiredBalance = await getMinimumBalanceForRentExemptMint(connection);
    //metadata account associated with mint
    //const metadataPDA = await metaplex.nfts().pdas().metadata({ mint: mintKeypair.publicKey });
    //get associated token account of your wallet
    const tokenATA = await getAssociatedTokenAddress(mintKeypair.publicKey, destinationWallet);


    const mplProgramId = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
    const mint = new PublicKey("8Lw2vWmtXbHGj6PYEnRXtFwrnjz2sS7CtoRdHGRq9ndA");
    const [metadataPDA] = PublicKey.findProgramAddressSync([
        Buffer.from("metadata"),
        mplProgramId.toBytes(),
        mint.toBytes()
    ], mplProgramId);


    const createNewTokenTransaction = new Transaction().add(
        SystemProgram.createAccount({
            fromPubkey: payer.publicKey,
            newAccountPubkey: mintKeypair.publicKey,
            space: MINT_SIZE,
            lamports: requiredBalance,
            programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMintInstruction(
            mintKeypair.publicKey, //Mint Address
            MINT_CONFIG.numDecimals, //Number of Decimals of New mint
            mintAuthority, //Mint Authority
            freezeAuthority, //Freeze Authority
            TOKEN_PROGRAM_ID),
        createAssociatedTokenAccountInstruction(
            payer.publicKey, //Payer 
            tokenATA, //Associated token account 
            payer.publicKey, //token owner
            mintKeypair.publicKey, //Mint
        ),
        createMintToInstruction(
            mintKeypair.publicKey, //Mint
            tokenATA, //Destination Token Account
            mintAuthority, //Authority
            MINT_CONFIG.numberTokens * Math.pow(10, MINT_CONFIG.numDecimals),//number of tokens
        ),
        createCreateMetadataAccountV3Instruction({
            metadata: metadataPDA,
            mint: mintKeypair.publicKey,
            mintAuthority: mintAuthority,
            payer: payer.publicKey,
            updateAuthority: mintAuthority,
        }, {
            createMetadataAccountArgsV3: {
                data: ON_CHAIN_METADATA,
                isMutable: true,
                collectionDetails: null
            }
        })
    );

    return createNewTokenTransaction;
}

const main = async () => {
    console.log(`---STEP 1: Uploading MetaData---`);
    //const userWallet = Keypair.fromSecretKey(new Uint8Array(secret));
    let metadataUri = await uploadMetadata(MY_TOKEN_METADATA);
    ON_CHAIN_METADATA.uri = metadataUri;

    console.log(`---STEP 2: Creating Mint Transaction---`);
    let mintKeypair = Keypair.generate();
    console.log(`New Mint Address: `, mintKeypair.publicKey.toString());

    const newMintTransaction: Transaction = await createNewMintTransaction(
        solanaConnection,
        userWallet,
        mintKeypair,
        userWallet.publicKey,
        userWallet.publicKey,
        userWallet.publicKey
    );

    console.log(`---STEP 3: Executing Mint Transaction---`);
    let { lastValidBlockHeight, blockhash } = await solanaConnection.getLatestBlockhash('finalized');
    newMintTransaction.recentBlockhash = blockhash;
    newMintTransaction.lastValidBlockHeight = lastValidBlockHeight;
    newMintTransaction.feePayer = userWallet.publicKey;
    const transactionId = await sendAndConfirmTransaction(solanaConnection, newMintTransaction, [userWallet, mintKeypair]);
    console.log(`Transaction ID: `, transactionId);
    console.log(`Succesfully minted ${MINT_CONFIG.numberTokens} ${ON_CHAIN_METADATA.symbol} to ${userWallet.publicKey.toString()}.`);
    console.log(`View Transaction: https://explorer.solana.com/tx/${transactionId}?cluster=devnet`);
    console.log(`View Token Mint: https://explorer.solana.com/address/${mintKeypair.publicKey.toString()}?cluster=devnet`)
}

// Execute the main function
main().then(() => {
    console.log('done');
}).catch((e) => {
    console.error(e);
});
