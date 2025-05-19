import { promises as fs } from 'fs';
import { vec3, mat4 } from 'gl-matrix';
import { NodeIO, Logger } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS, KHRMaterialsEmissiveStrength } from '@gltf-transform/extensions';
import { prune, unpartition, transformMesh, mergeDocuments, joinPrimitives } from '@gltf-transform/functions';

import { Packer, iterateTextures } from './includes/packer.js';
import { Atlas, remapUvsToAtlas } from './includes/atlas.js';
import { inspect, humanFileSize, parseArgs } from './includes/utils.js';

import tPose from './data/t-pose.json' with { type: 'json' };
import jointsTuples from './data/joints-map.json' with { type: 'json' };
import jointsToRemove from './data/joints-remove.json' with { type: 'json' };


const start = performance.now();

const options = await parseArgs();
const numberFormatter = new Intl.NumberFormat();
const scale = 0.0352;


const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);


// load file
const sizeBefore = (await fs.stat(options.file)).size;
const main = await io.read(options.file);
main.setLogger(new Logger(Logger.Verbosity.ERROR));


// register emissive strenth extension
const emissiveStrengthExtension = main.createExtension(KHRMaterialsEmissiveStrength);


// load msquared skeleton
const documentDonor = await io.read('./data/skeleton.glb');
documentDonor.setLogger(new Logger(Logger.Verbosity.ERROR));


// merge documents
mergeDocuments(main, documentDonor);


const root = main.getRoot();
const skin = root.listSkins()[0];

// compute lists of nodes based on scenes
const scenes = root.listScenes();
const scene = scenes[0];
const sceneDonor = scenes[1];

const nodes = [ ];
const nodesDonor = [ ];


// collect nodes from both scenes
const collectNodes = (node, list) => {
    list.push(node);
    const children = node.listChildren();
    for(let i = 0; i < children.length; i++) {
        collectNodes(children[i], list);
    }
}

{
    const children = scene.listChildren();
    for(let i = 0; i < children.length; i++)
        collectNodes(children[i], nodes);
}

{
    const children = sceneDonor.listChildren();
    for(let i = 0; i < children.length; i++)
        collectNodes(children[i], nodesDonor);
}


// reparent donor skeleton
const jointsIndex = { };
const skinRoot = sceneDonor.listChildren()[0];
scene.addChild(skinRoot);
skin.setSkeleton(skinRoot);


// destroy donor scene
sceneDonor.detach();
sceneDonor.dispose();


// remove joints
{
    const joints = skin.listJoints();
    const jointsIndex = { };
    for(let i = 0; i < joints.length; i++) {
        jointsIndex[joints[i].getName()] = joints[i];
    }

    for(let i = 0; i < jointsToRemove.length; i++) {
        const joint = jointsIndex[jointsToRemove[i]];
        if (!joint) continue;

        const parent = joint.getParentNode();
        parent.removeChild(joint);
        skin.removeJoint(joint);
        joint.detach();
        joint.dispose();
    }
}


// recalculate inverse matrices
{
    const accessor = skin.getInverseBindMatrices();
    const joints = skin.listJoints();
    const raw = new Float32Array(joints.length * 16);
    accessor.setArray(raw);
    for(let i = 0; i < joints.length; i++) {
        accessor.setElement(i, mat4.invert([], joints[i].getWorldMatrix()));
    }
}


// index joints
{
    const joints = skin.listJoints();
    for(let i = 0; i < joints.length; i++) {
        jointsIndex[joints[i].getName()] = i;
    }
}


// remove animations
const animations = root.listAnimations();
let i = animations.length;
while(i--) {
    const channels = animations[i].listChannels();
    let c = channels.length;
    while(c--) {
        const target = channels[c].getTargetNode();
        if (target.getName() === 'Controller-Global') {
            const path = channels[c].getTargetPath();

            if (path === 'scale') {
                // remove scale keyframes
                animations[i].removeChannel(channels[c]);
                channels[c].detach();
                channels[c].dispose();
            } else if (path === 'translation') {
                // scale hips translation keyframes
                const sampler = channels[c].getSampler();
                const accessor = sampler.getOutput();
                
                const element = [];
                for (let e = 0; e < accessor.getCount(); e++) {
                    accessor.getElement(e, element);
                    vec3.scale(element, element, scale);
                    accessor.setElement(e, element);
                }
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

    // remove animation tracks
    const samplers = animations[i].listSamplers();
    let s = samplers.length;
    while(s--) {
        samplers[s].detach();
        samplers[s].dispose();
    }
    animations[i].detach();
    animations[i].dispose();
}


// transform world node
const worldNode = nodes.filter((node) => {
    return node.getName() === 'World-Global' || node.getName() === 'Root-Global'
})?.[0];
worldNode.setScale([ 1, 1, 1 ]);
worldNode.setRotation([ 0, 0, 0, 1 ]);


// transform skeleton to msquared T-Pose
for(let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const name = node.getName();

    if (name === worldNode.getName())
        continue;

    const raw = tPose[name];

    if (raw) {
        node.setTranslation(raw.position);
        node.setRotation(raw.rotation);
    } else {
        const pos = node.getTranslation();
        node.setTranslation(vec3.scale([], pos, scale));
    }
}


// process meshes
for(let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const mesh = node.getMesh();
    const parent = node.getParentNode();

    if (mesh) {
        // reparent to the root
        const worldTransform = node.getWorldMatrix();
        parent.removeChild(node);

        scene.addChild(node);
        node.setMatrix(worldTransform);

        // scale meshes down
        transformMesh(mesh, mat4.fromScaling([], [ scale, scale, scale ]));

        // handle deeper hierarchy
        let jointIndex;
        let parentNode = parent;
        while(parentNode) {
            const name = parentNode.getName();
            const index = jointsIndex[jointsTuples[name]];
            if (isNaN(index)) {
                parentNode = parentNode.getParentNode();
                continue;
            }
            jointIndex = index;
            break;
        }

        if (!isNaN(jointIndex)) {
            node.setSkin(skin);

            // skinning
            // we skin whole mesh to their parent node as in the hierarchy
            const primitives = mesh.listPrimitives();
            for(let p = 0; p < primitives.length; p++) {
                const primitive = primitives[p];

                const positions = primitive.getAttribute('POSITION');

                const joints_0 = main.createAccessor('JOINTS_0');
                const weights_0 = main.createAccessor('WEIGHTS_0');

                joints_0.setType('VEC4');
                weights_0.setType('VEC4');

                const joints_0_array = new Uint8Array(positions.getCount() * 4);
                const weights_0_array = new Float32Array(positions.getCount() * 4);

                for(let w = 0; w < positions.getCount(); w++) {
                    joints_0_array[w * 4 + 0] = jointIndex;
                    weights_0_array[w * 4 + 0] = 1;
                }

                joints_0.setArray(joints_0_array);
                weights_0.setArray(weights_0_array);

                primitive.setAttribute('JOINTS_0', joints_0);
                primitive.setAttribute('WEIGHTS_0', weights_0);

                transformMesh(mesh, worldTransform);

                node.setMatrix(mat4.identity([]));
            }
        }
    } else if (node.getName().endsWith('-Local')) {
        // nodes that are not skeleton and without meshes should be removed
        parent.removeChild(node);
        node.detach();
        node.dispose();
    }
}


// delete old skeleton
worldNode.detach();
worldNode.dispose();


// merge meshes
if (options.merge) {
    // create new node
    const model = main.createNode('model');
    model.setSkin(skin);
    scene.addChild(model);

    // new single mesh
    const mesh = main.createMesh('mesh');
    model.setMesh(mesh);

    // new material
    const material = main.createMaterial('material');
    material.setMetallicFactor(0);
    material.setEmissiveFactor([ 10, 10, 10 ]);

    // set emissive strength
    const emissiveStrength = emissiveStrengthExtension.createEmissiveStrength().setEmissiveStrength(5.0);
    material.setExtension('KHR_materials_emissive_strength', emissiveStrength);

    // collect primitives
    // remember old material, apply new material
    const allPrimitives = [ ];
    for(let n = 0; n < nodes.length; n++) {
        const mesh = nodes[n].getMesh();
        if (!mesh) continue;
        const primitives = mesh.listPrimitives();
        for(let p = 0; p < primitives.length; p++) {
            primitives[p].materialOld = primitives[p].getMaterial();
            primitives[p].setMaterial(material);
            allPrimitives.push(primitives[p]);
        }
    }

    
    // create packers
    const packerAlbedo = new Packer();
    const packerEmissive = new Packer();


    // texture indices
    const textureToRectAlbedo = new Map();
    const textureToRectEmissive = new Map();


    // collect textures data
    const primitiveToTextureAlbedo = await iterateTextures(allPrimitives, 'getBaseColorTexture', (texture, width, height) => {
        packerAlbedo.add(width, height, texture);
    });
    const primitiveToTextureEmissive = await iterateTextures(allPrimitives, 'getEmissiveTexture', (texture, width, height) => {
        packerEmissive.add(width, height, texture);
    });


    // calculate packing
    packerAlbedo.calculate();
    packerEmissive.calculate();


    // create atlases
    const atlasAlbedo = new Atlas(main, 'albedo', packerAlbedo.width, packerAlbedo.height);
    const atlasEmissive = new Atlas(main, 'emissive', packerEmissive.width, packerEmissive.height, 1);


    // fill atlases
    atlasAlbedo.fill();
    atlasEmissive.fill();


    // copy textures into atlases
    for(let i = 0; i < packerAlbedo.rects.length; i++) {
        const rect = packerAlbedo.rects[i];
        textureToRectAlbedo.set(rect.texture, rect);
        await atlasAlbedo.copy(rect.texture, rect.x, rect.y);
    }
    for(let i = 0; i < packerEmissive.rects.length; i++) {
        const rect = packerEmissive.rects[i];
        textureToRectEmissive.set(rect.texture, rect);
        await atlasEmissive.copy(rect.texture, rect.x, rect.y);
    }


    // convert atlases to files
    await atlasAlbedo.upload();
    await atlasEmissive.upload();


    // set material textures
    material.setBaseColorTexture(atlasAlbedo.texture);
    material.setEmissiveTexture(atlasEmissive.texture);


    // get texture infos
    const infoAlbedo = material.getBaseColorTextureInfo();
    const infoEmissive = material.getEmissiveTextureInfo();


    // set texture filtering
    infoAlbedo.setMinFilter(9984);
    infoAlbedo.setMagFilter(9728);
    infoEmissive.setMinFilter(9984);
    infoEmissive.setMagFilter(9728);
    infoEmissive.setTexCoord(1);


    // remap UVs to atlas
    for(let p = 0; p < allPrimitives.length; p++) {
        const primitive = allPrimitives[p];

        const textureAlbedo = primitiveToTextureAlbedo.get(primitive);
        if (textureAlbedo) {
            const rect = textureToRectAlbedo.get(textureAlbedo);
            if (rect) {
                const uv = primitive.getAttribute('TEXCOORD_0');
                if (uv) remapUvsToAtlas(uv, packerAlbedo, rect);
            }
        }

        const textureEmissive = primitiveToTextureEmissive.get(primitive);
        if (textureEmissive) {
            const rect = textureToRectEmissive.get(textureEmissive);
            if (rect) {
                const uv = primitive.getAttribute('TEXCOORD_1');
                if (uv) remapUvsToAtlas(uv, packerEmissive, rect);
            }
        }
    }


    // joint primitives together
    const primitive = joinPrimitives(allPrimitives);
    mesh.addPrimitive(primitive);

    // remove old nodes
    for(let n = 0; n < nodes.length; n++) {
        const mesh = nodes[n].getMesh();
        if (!mesh) continue;

        scene.removeChild(nodes[n]);
        nodes[n].detach();
        nodes[n].dispose();
    }

    // remove old meshes
    for(let i = 0; i < allPrimitives.length; i++) {
        allPrimitives[i].detach();
        allPrimitives[i].dispose();
    }
}


// cleanup
await main.transform(unpartition());
await main.transform(prune());


// save
const glb = await io.writeBinary(main);
await fs.writeFile(options.output, glb);
const stat = await fs.stat(options.output);
const sizeAfter = stat.size;


// inspect
const data = inspect(main);


if (!options.silent) {
    console.log(`Sizes:`);
    console.log(`    Before\t${humanFileSize(sizeBefore)}`);
    console.log(`    After\t${humanFileSize(sizeAfter)}`);
    console.log(`    Difference\t${-Math.floor(((sizeBefore - sizeAfter) / sizeBefore) * 100)}%`);
    console.log(`    Meshes\t${humanFileSize(data.sizes.meshes)}`);
    console.log(`    Textures\t${humanFileSize(data.sizes.textures)}`);
    console.log(`    VRAM\t${humanFileSize(data.sizes.vram)}`);
    
    if (options.inspect) console.log(JSON.stringify(data.data, null, 4));

    console.log('Elapsed:', numberFormatter.format(Math.round(performance.now() - start)) + 'ms');
}