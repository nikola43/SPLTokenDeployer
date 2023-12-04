const util = require('util');
const exec = util.promisify(require('child_process').exec);
const fs = require('fs');
const { NFTStorage, File } = require('nft.storage')
const path = require('path')
const mime = require('mime')
const dotenv = require('dotenv');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

dotenv.config();
async function main() {

    const receiver = "6eVy93roE7VtyXv4iuqbCyseAQ979A5SqjiVwsyMSfyV"

    console.log("Saving metadata")
    const name = "Test img"
    const symbol = "img"
    const description = "img"
    const image = "./logo.png"
    const supply = 100000000;

    // Deploy token
    const { disableMintSignature, tranferToOwnerSignature, tokenAddress } = await deploySPLToken(image, name, symbol, description, supply, receiver)
    console.log({
        deploySignature,
        disableMintSignature,
        tranferToOwnerSignature,
        tokenAddress
    });

    fs.writeFileSync(`data/${tokenAddress}.json`, JSON.stringify({
        deploySignature,
        disableMintSignature,
        tranferToOwnerSignature,
        tokenAddress
    }));
}

async function deploySPLToken(image, name, symbol, description, supply, receiver) {
    console.log("Uploading metadata...");
    const uri = await uploadMetadata(image, name, symbol, description)

    console.log("Deploying...");
    const { tokenAddress } = await _deploySPLToken(supply, name, symbol, uri)
    //console.log("deploySignature: ", deploySignature);
    //console.log("tokenAddress: ", tokenAddress);

    console.log("Disabling minting...");
    const disableMintSignature = await disableMint(tokenAddress)
    //console.log("disableMintSignature: ", disableMintSignature);

    console.log("Transfering to Owner...");
    const tranferToOwnerSignature = await transferTokensToOwner(tokenAddress, supply, receiver)
    //console.log("tranferToOwnerSignature: ", tranferToOwnerSignature);

    return {
        disableMintSignature,
        tranferToOwnerSignature,
        tokenAddress
    }
}

async function fileFromPath(filePath) {
    const content = await fs.promises.readFile(filePath)
    const type = mime.getType(filePath)
    return new File([content], path.basename(filePath), { type })
}

async function uploadMetadata(file, name, symbol, description) {
    const url = await uploadImageLogo(file)
    const metadata = {
        "name": name,
        "symbol": symbol,
        "description": description,
        image: url,
        logoURI: url,
    }
    fs.unlinkSync("./metadata.json");
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

    const data = await r.json();
    //console.log("data: ", data);
    metadata["uri"] = `https://${data.value.cid}.ipfs.nftstorage.link`;

    fs.unlinkSync("./metadata.json");
    fs.writeFileSync('metadata.json', JSON.stringify(metadata));

    return `https://${data.value.cid}.ipfs.nftstorage.link`
}


async function uploadImageLogo(imagePath) {
    const image = await fileFromPath(imagePath)
    const metadata = {
        "name": "",
        "symbol": "",
        "description": "",
        image
    }

    const client = new NFTStorage({ token: process.env.NFT_STORAGE_API_KEY })
    const metadataInfo = await client.store(metadata)

    const uri = `https://${metadataInfo.url.split("//")[1].split("/")[0]}.ipfs.nftstorage.link/metadata.json`
    console.log("uri: ", uri);

    const r = await fetch(uri);
    const data = await r.json();
    return `https://${data.image.split("//")[1].split("/")[0]}.ipfs.nftstorage.link/logo.png`;
}

async function _deploySPLToken(supply, name, symbol, uri) {
    let command = `spl-token --program-id TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb create-token --enable-metadata --transfer-fee 200 ${supply}`
    let deploySignature = ""
    let tokenAddress = ""
    try {
        const { stdout, stderr } = await exec(command);
        //console.log('stdout:', stdout);
        //console.log('stderr:', stderr);

        if (stdout.length !== 0) {
            const stdoutSplit = stdout.split("\n")
            deploySignature = stdoutSplit[0].split(" ")[1].trim();
            console.log({
                r: stdoutSplit[1].split(" ")
            })
            tokenAddress = stdoutSplit[1].split(" ")[10].trim();
        }
    } catch (e) {
        console.error(e); // should contain code (exit code) and signal (that caused the termination).
    }

    command = `spl-token create-account ${tokenAddress}`
    let account = ""
    try {
        const { stdout, stderr } = await exec(command);
        //console.log('stdout:', stdout);
        //console.log('stderr:', stderr);

        if (stdout.length !== 0) {
            const stdoutSplit = stdout.split("\n")
            console.log("stdoutSplit: ", stdoutSplit)
            //deploySignature = stdoutSplit[0].split(" ")[1].trim();
            account = stdoutSplit[0].split(" ")[2].trim();
            console.log("account: ", account)
        }
    } catch (e) {
        console.error(e); // should contain code (exit code) and signal (that caused the termination).
    }

    command = `spl-token mint ${account} ${supply} }`
    try {
        const { stdout, stderr } = await exec(command);
        //console.log('stdout:', stdout);
        //console.log('stderr:', stderr);

        if (stdout.length !== 0) {
            const stdoutSplit = stdout.split("\n")
            console.log("stdoutSplit: ", stdoutSplit)
            //deploySignature = stdoutSplit[0].split(" ")[1].trim();
            //tokenAddress = stdoutSplit[1].split(" ")[1].trim();
        }
    } catch (e) {
        console.error(e); // should contain code (exit code) and signal (that caused the termination).
    }

    command = `spl-token initialize-metadata ${tokenAddress} ${name} ${symbol} ${uri}`
    try {
        const { stdout, stderr } = await exec(command);
        //console.log('stdout:', stdout);
        //console.log('stderr:', stderr);

        if (stdout.length !== 0) {
            const stdoutSplit = stdout.split("\n")
            console.log("stdoutSplit: ", stdoutSplit)
            //deploySignature = stdoutSplit[0].split(" ")[1].trim();
            //tokenAddress = stdoutSplit[1].split(" ")[1].trim();
        }
    } catch (e) {
        console.error(e); // should contain code (exit code) and signal (that caused the termination).
    }

    return {
        tokenAddress
    }
}

async function disableMint(tokenAddress) {
    command = `spl-token authorize ${tokenAddress} mint --disable`
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

async function transferTokensToOwner(tokenAddress, amount, ownerAddress) {
    command = `spl-token transfer ${tokenAddress} ${amount} ${ownerAddress} --allow-unfunded-recipient --fund-recipient`
    let signature = ""
    try {
        const { stdout, stderr } = await exec(command);
        //console.log('stdout:', stdout);
        //console.log('stderr:', stderr);
        if (stdout.length !== 0) {
            // extract Signature from stdout
            const stdoutSplit = stdout.split("\n")
            //console.log("stdoutSplit: ", stdoutSplit);
            signature = stdoutSplit[6].split(" ")[1].trim();
            //console.log("disableMintSignature: ", disableMintSignature);
        }
    } catch (e) {
        console.error(e); // should contain code (exit code) and signal (that caused the termination).
    }

    return signature;
}

main().then(() => {
    console.log('done');
}).catch((e) => {
    console.error(e);
});
