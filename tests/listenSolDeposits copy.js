const dotenv = require('dotenv');
const solanaWeb3 = require('@solana/web3.js');
dotenv.config();

async function main() {

    const receiver = "6eVy93roE7VtyXv4iuqbCyseAQ979A5SqjiVwsyMSfyV"

    try {
        const connection = await initSolanaWeb3Connection()
        await listenForSOLDeposits(connection, receiver);
    } catch (error) {
        console.error('Received:', error);
        return;
    }



}

function stopListening() {
    if (subscriptionId !== null) {
        connection.removeAccountChangeListener(subscriptionId).then(() => {
            console.log('Stopped listening to SOL deposits.');
            subscriptionId = null;
        });
    }
}


async function initSolanaWeb3Connection() {
    let connection;
    try {
        connection = new solanaWeb3.Connection(solanaWeb3.clusterApiUrl('devnet'), 'confirmed');
    } catch (error) {
        console.error('Invalid address:', error);
        return;
    }
    return connection;
}

function validateAddress(address) {
    let isValid = false;
    // Check if the address is valid
    try {
        new solanaWeb3.PublicKey(address);
        isValid = true;
    } catch (error) {
        console.error('Invalid address:', error);
    }
    return isValid;
}

async function getSolBalance(connection, address) {

    let isValid = validateAddress(address);
    if (!isValid) {
        return;
    }

    const balance = await connection.getBalance(new solanaWeb3.PublicKey(address));
    console.log(`Balance for ${address}: ${balance} SOL`);

    return balance;
}

async function listenForSOLDeposits(connection, address) {

    try {
        const publicKey = new solanaWeb3.PublicKey(address);
        let processedSignatures = new Set();

        console.log(`Listening for SOL deposits to address ${address}`);

        const subscriptionId = connection.onAccountChange(
            publicKey,
            async (accountInfo, context) => {
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
                        transaction.transaction.message.instructions.forEach((instruction) => {
                            if (instruction.program === 'system' && instruction.parsed.type === 'transfer') {
                                const sender = instruction.parsed.info.source;
                                const receiver = instruction.parsed.info.destination;
                                const signature = signatures[0].signature;

                                if (receiver === address) {
                                    console.log(`Received ${instruction.parsed.info.lamports / solanaWeb3.LAMPORTS_PER_SOL} SOL from ${sender}`);
                                    console.log('Signature:', signature);
                                }
                                throw new Error('Stop: ' + sender);
                            }
                        });
                    }
                }

                // Optionally, prune the processedSignatures set to avoid memory issues over time
            },
            'confirmed'
        );
    } catch (error) {
        console.error('Invalid address:', error);
    }
}

main().then(() => {
    console.log('done');
}).catch((e) => {
    console.error(e);
});
