import { TOKEN_2022_PROGRAM_ID, getTransferFeeAmount, unpackAccount } from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";
import { AccountsAmounts } from "./types";

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

export async function getFeesAccounts(connection: Connection, mint: string): Promise<AccountsAmounts> {
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

    const accountsAmounts: AccountsAmounts = { accounts: accountsToWithdrawFrom, amount }
    return accountsAmounts;
}