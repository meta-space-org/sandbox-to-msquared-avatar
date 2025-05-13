import { promises as fs } from 'fs';
import { NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';


const GLB_LOAD_PATH = '../data/spawn_land.glb';
const GLB_SAVE_PATH = '../data/spawn_land-processed.glb';


const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);

const main = await io.read(GLB_LOAD_PATH);
const root = main.getRoot();


// process msquared animation file to remove translation from non-pelvis
const animations = root.listAnimations();
let i = animations.length;
while(i--) {
    const channels = animations[i].listChannels();
    let c = channels.length;
    while(c--) {
        const target = channels[c].getTargetNode();
        console.log(target.getName())
        if (target.getName() === 'pelvis') {
            const path = channels[c].getTargetPath();

            if (path === 'scale') {
                // remove scale keyframes
                animations[i].removeChannel(channels[c]);
                channels[c].detach();
                channels[c].dispose();
            }
        } else {
            // keep only rotation keyframes
            const path = channels[c].getTargetPath();
            if (path !== 'rotation') {
                animations[i].removeChannel(channels[c]);
                channels[c].detach();
                channels[c].dispose();
            }
        }
    }
}


const glb = await io.writeBinary(main);
await fs.writeFile(GLB_SAVE_PATH, glb);