import { promises as fs } from 'fs';
import path from 'path';
import express from 'express';
import convert from './main.js';


const PORT = 3000;
const app = express();
const pathGltf = '../glb-sandbox-batch/gltf';
const pathGlb = '../glb-sandbox-batch/glb';


app.get('/', async (req, res) => {
    // ?id - should be provided
    if (!req.query?.id) {
        return res.status(400).json({
            error: true,
            status: 400,
            message: 'missing asset id'
        });
    }

    const assetId = req.query.id;

    // validate GUID
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(assetId)) {
        return res.status(400).json({
            error: true,
            status: 400,
            message: 'invalid asset id'
        });
    }

    // options
    const options = {
        file: path.resolve(path.join(pathGltf, assetId + '.gltf')),
        output: path.resolve(path.join(pathGlb, assetId + '.glb')),
        merge: true,
        silent: true
    };

    // if not forced, check if output file already exists
    if (!req.query.force) {
        try {
            await fs.stat(options.output);
            // if it does, just send it
            return res.download(options.output);
        } catch(ex) {
            // it might not exist
            // that is a valid case
        }
    }

    // check if GLTF file exists
    try {
        await fs.stat(options.file);
    } catch(ex) {
        return res.status(404).json({
            error: true,
            status: 404,
            message: 'GLTF file is not found'
        });
    }

    // convert
    try {
        const converted = await convert(options);

        if (!converted) {
            return res.status(400).json({
                error: true,
                status: 400,
                message: 'failed to convert asset'
            });
        }

        // send file
        res.download(options.output);
    } catch(ex) {
        return res.status(500).json({
            error: true,
            status: 400,
            code: ex.code,
            message: ex.message,
            stack: ex.stack.split('\n')
        });
    }
});

app.listen(PORT, () => console.log(`Server ready on port ${PORT}.`));


export default app;