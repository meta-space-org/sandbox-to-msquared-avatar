import { promises as fs } from 'fs';
import { NodeIO, Logger } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, unpartition } from '@gltf-transform/functions';


const GLB_LOAD_PATH = '../data/SK_BodyA_ArmsHeadless_04.glb';
const GLB_SAVE_PATH = '../data/skeleton.glb';


const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);


// load msquared model with skeleton
const main = await io.read(GLB_LOAD_PATH);
main.setLogger(new Logger(Logger.Verbosity.DEBUG));


const root = main.getRoot();
const scenes = root.listScenes();
const scene = scenes[0];
const nodes = root.listNodes();


// reparent skeleton root
const nodeRoot = nodes.filter((node) => { return node.getName() === 'root' })[0];
nodeRoot.getParentNode().removeChild(nodeRoot);
scene.addChild(nodeRoot);


// remove model node
const nodeModel = scene.listChildren()[0];
scene.removeChild(nodeModel);


// remove meshes
const meshes = root.listMeshes();
for(let i = 0; i < meshes.length; i++) {
    meshes[i].detach();
    meshes[i].dispose();
}


// clean up
await main.transform(unpartition());
await main.transform(prune());


// save
const glb = await io.writeBinary(main);
await fs.writeFile(GLB_SAVE_PATH, glb);