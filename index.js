const util = require('util');
const exec = util.promisify(require('child_process').exec);
const fs = require('fs');
const { NFTStorage, File } = require('nft.storage')
// The 'path' module provides helpers for manipulating filesystem paths
const path = require('path')

// The 'mime' npm package helps us set the correct file type on our File objects
const mime = require('mime')
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));



async function main() {

    const receiver = "6eVy93roE7VtyXv4iuqbCyseAQ979A5SqjiVwsyMSfyV"

    console.log("Saving metadata")
    const name = "Test img"
    const symbol = "img"
    const description = "img"
    const image = "./logo.png"
    await uploadMetadata(image, name, symbol, description)


    // Deploy token
    console.log("Deploying...");
    const supply = 100000000;
    const { deploySignature, tokenAddress } = await deploySPLToken(supply)
    console.log("deploySignature: ", deploySignature);
    console.log("tokenAddress: ", tokenAddress);

    console.log("Disabling minting...");
    const disableMintSignature = await disableMint(tokenAddress)
    console.log("disableMintSignature: ", disableMintSignature);

    console.log("Transfering to Owner...");
    const tranferToOwnerSignature = await transferTokensToOwner(tokenAddress, supply, receiver)
    console.log("tranferToOwnerSignature: ", tranferToOwnerSignature);
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
            'Authorization': 'Bearer WyIweGYzY2IyOWI5NGZiYmZlYTQyNmM1MWNlNGNlM2RmMWUzZDQ1YTE2ZWUzNmI1YTIxYTliY2U5MWQ5NGZkYTU0MzIzMDk0Njk0MWE3N2JiNTQwODg3ZWMwYjFhZGNmYWNkMDZlMGQwZWM2ZDE0OTU4OTdhMTk1MTkzY2E3NWUwOWE0MWMiLCJ7XCJpYXRcIjoxNzAxMTQ5NzQ0LFwiZXh0XCI6MTcwMTE1Njk0NCxcImlzc1wiOlwiZGlkOmV0aHI6MHhiZUJjMEIxMDQ5NGFiQkRlMmE1QzczZjA3NDA4MjkzQjM1Nzk5NjRBXCIsXCJzdWJcIjpcIkVER3Faa1Fpc2JsVUxVbUY4S2psYWlyZExfYWotMFVwb3VWbnhxZGlTbzA9XCIsXCJhdWRcIjpcIlpvYmw1QzJHRWVvT1dudXdpb0RURDRBSnd1NlhFTW5WSEttWjZWOFZZLUU9XCIsXCJuYmZcIjoxNzAxMTQ5NzQ0LFwidGlkXCI6XCIyNTM2MTU2Ny1lYzRmLTQ4MzUtYWE0Yi0zYmE0MTRkMzQ2MTBcIixcImFkZFwiOlwiMHhjYTJkYTNjNDU4NTZiZjA0N2M0Y2ZhZjhmNzk3YjAzNGZlNDBlMzhmMDBmNzE4YjlkM2Q2NDkxMDhkNzQxOWQ3Mjg1OGE5ZWRlMmU2YjQ1OTFlZmU1NzFlODgxZGVhODk2NDFjNjE4OGY4MGJlNGMyODZiNDA4NzFjZDk4OTVjNDFiXCJ9Il0='
        },
        body: fs.readFileSync("./metadata.json")
    });

    const data = await r.json();
    console.log("data: ", data);
    metadata["uri"] = `https://${data.value.cid}.ipfs.nftstorage.link`;

    fs.unlinkSync("./metadata.json");
    fs.writeFileSync('metadata.json', JSON.stringify(metadata));

    return data.cid;
}


async function uploadImageLogo(imagePath) {
    const image = await fileFromPath(imagePath)
    const metadata = {
        "name": "",
        "symbol": "",
        "description": "",
        image
    }

    const client = new NFTStorage({ token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkaWQ6ZXRocjoweGJlQmMwQjEwNDk0YWJCRGUyYTVDNzNmMDc0MDgyOTNCMzU3OTk2NEEiLCJpc3MiOiJuZnQtc3RvcmFnZSIsImlhdCI6MTcwMTEzNjgwNjU2MCwibmFtZSI6InNvbGRlcGxveWVyIn0.-K9vkqe7B_oxuAbAS-rtrAAu3Xn16QTHUBFxpC9xe9c" })
    const metadataInfo = await client.store(metadata)

    const uri = `https://${metadataInfo.url.split("//")[1].split("/")[0]}.ipfs.nftstorage.link/metadata.json`

    const r = await fetch(uri);
    const data = await r.json();
    return `https://${data.image.split("//")[1].split("/")[0]}.ipfs.nftstorage.link/logo.png`;
}

async function deploySPLToken(supply) {
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
