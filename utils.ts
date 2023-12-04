import { clusterApiUrl, Connection, Keypair, PublicKey } from "@solana/web3.js";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { createMetadataAccountV3 } from "@metaplex-foundation/mpl-token-metadata";
import { fromWeb3JsKeypair, fromWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import { createSignerFromKeypair } from "@metaplex-foundation/umi";
import { base58 } from '@metaplex-foundation/umi/serializers';

const uploadMetadataForToken = async (tokenAddress: PublicKey, kPair: Keypair, offChainMetadata: any, uri: string) => {
    const endpoint = clusterApiUrl('devnet');
    const umi = createUmi(endpoint)
    const web3jsKeyPair = kPair

    const keypair = fromWeb3JsKeypair(web3jsKeyPair);
    const signer = createSignerFromKeypair(umi, keypair);
    umi.identity = signer;
    umi.payer = signer;

    let CreateMetadataAccountV3Args = {
        //accounts
        mint: fromWeb3JsPublicKey(new PublicKey(tokenAddress)),
        mintAuthority: signer,
        payer: signer,
        updateAuthority: fromWeb3JsKeypair(web3jsKeyPair).publicKey,
        data: {
            name: offChainMetadata.name,
            symbol: offChainMetadata.symbol,
            uri: uri,
            sellerFeeBasisPoints: 0,
            creators: null,
            collection: null,
            uses: null
        },
        isMutable: false,
        collectionDetails: null,
    }

    let instruction = createMetadataAccountV3(
        umi,
        CreateMetadataAccountV3Args
    )

    const transaction = await instruction.buildAndSign(umi);
    const transactionSignature = await umi.rpc.sendTransaction(transaction);
    const signature = base58.deserialize(transactionSignature);
    console.log({ signature })
}

/*
module.exports = {
    uploadMetadataForToken
}
*/

export default uploadMetadataForToken

