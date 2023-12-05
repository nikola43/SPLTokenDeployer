//Imports
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { createMetadataAccountV3, CreateMetadataAccountV3InstructionAccounts, CreateMetadataAccountV3InstructionArgs } from '@metaplex-foundation/mpl-token-metadata'
import { clusterApiUrl, PublicKey, Keypair, Transaction, Connection, sendAndConfirmTransaction } from '@solana/web3.js';
import { fromWeb3JsPublicKey, toWeb3JsPublicKey, fromWeb3JsKeypair } from '@metaplex-foundation/umi-web3js-adapters'
import { createSignerFromKeypair } from '@metaplex-foundation/umi';


const bs58 = require('bs58');

function importWallet(text): Keypair {
    // Decode the Base58 private key to a Uint8Array
    const privateKeyUint8Array = bs58.decode(text);

    // Generate the keypair from the Uint8Array
    const keypair = Keypair.fromSecretKey(privateKeyUint8Array);
    console.log({ keypair })

    // Output the public key
    //console.log("Public Key (Address):", keypair.publicKey.toString());
    const secretKeyUint8Array = keypair.secretKey;
    const secretKeyBase58 = bs58.encode(secretKeyUint8Array);
    //console.log("Private Key (Base58):", secretKeyBase58);

    return keypair;
}


const uploadMetadataForToken = async (offChainMetadata: any) => {


    //const keypairk: Keypair = importWallet("7biAatNGZT48M4n7bvKrz9k7CPvdDQkh3EsPRm7msgXj4GsFwf51CmF1kq8xZyWrbhmtJmy3Fwp6stcbXMwqzJF");
    //const keypair: Keypair = Keypair.fromSecretKey(keypairk.secretKey);

    //Connection and Umi instance
    const endpoint = clusterApiUrl("devnet");
    const umi = createUmi(endpoint)
    const connection = new Connection(endpoint);
    //const secret = importWallet("7biAatNGZT48M4n7bvKrz9k7CPvdDQkh3EsPRm7msgXj4GsFwf51CmF1kq8xZyWrbhmtJmy3Fwp6stcbXMwqzJF").secretKey;
    //const keypair: Keypair = Keypair.fromSecretKey(Uint8Array.from(secret));
    //const web3jsKeyPair = importWallet("7biAatNGZT48M4n7bvKrz9k7CPvdDQkh3EsPRm7msgXj4GsFwf51CmF1kq8xZyWrbhmtJmy3Fwp6stcbXMwqzJF");
    //const keypair = fromWeb3JsKeypair(web3jsKeyPair)



    //Constants
    const mplProgramId = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
    const mint = new PublicKey("BX2iLD559nN4NgWfPCAcR8LRwgqtJHjgGEZjvFmp6Wki");
    const [metadata] = PublicKey.findProgramAddressSync([
        Buffer.from("metadata"),
        mplProgramId.toBytes(),
        mint.toBytes()
    ], mplProgramId);

    //const web3jsKeyPair = Keypair.generate();
    const keypairk: Keypair = importWallet("7biAatNGZT48M4n7bvKrz9k7CPvdDQkh3EsPRm7msgXj4GsFwf51CmF1kq8xZyWrbhmtJmy3Fwp6stcbXMwqzJF");
    const keypair2: Keypair = Keypair.fromSecretKey(keypairk.secretKey);

    const keypair = fromWeb3JsKeypair(keypair2);

    const signer = createSignerFromKeypair(umi, keypair);
    umi.identity = signer;
    umi.payer = signer;


    //Metadata Account IX Args
    const args: CreateMetadataAccountV3InstructionArgs = {
        data: {
            name: "My Token",
            symbol: "TOKN",
            uri: "",
            sellerFeeBasisPoints: 0,
            collection: null,
            creators: [
                { address: keypair.publicKey, verified: true, share: 100 }
            ],
            uses: null
        },
        isMutable: true,
        collectionDetails: null
    }

    //The tx builder expects the type of mint authority and signer to be `Signer`, so built a dummy Signer instance

    /*
    const signer = {
        publicKey: fromWeb3JsPublicKey(keypair.publicKey),
        signTransaction: null,
        signMessage: null,
        signAllTransactions: null
    }
    */

    signer.publicKey = fromWeb3JsPublicKey(keypairk.publicKey);

    //Metadata account IX Accounts
    const accounts: CreateMetadataAccountV3InstructionAccounts = {
        metadata: fromWeb3JsPublicKey(metadata),
        mint: fromWeb3JsPublicKey(mint),
        payer: signer,
        mintAuthority: signer,
        updateAuthority: keypair.publicKey
    }

    //Arguments merged to match the parameter required by the method
    const fullArgs = { ...accounts, ...args }

    const metadataBuilder = createMetadataAccountV3(umi, fullArgs);

    (async () => {
        const ix: any = metadataBuilder.getInstructions()[0];
        ix.keys = ix.keys.map(key => {
            const newKey = { ...key };
            newKey.pubkey = toWeb3JsPublicKey(key.pubkey);
            return newKey;
        });

        const tx = new Transaction().add(ix);
        const sig = await sendAndConfirmTransaction(connection, tx, [keypairk]);

        console.log(sig)
    })()
}


(async () => {
    const offChainMetadata = {
        name: "your token name",
        symbol: "⚔️",
        description: "your token description",
        image: "https://bafybeic2hxzdvmwhefjunq75bnnghic3kvfcppgazkq4fhe4pj6zmj5v2i.ipfs.nftstorage.link/logo.png"
    }
    await uploadMetadataForToken(offChainMetadata);
})()