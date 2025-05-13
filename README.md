# Sandbox.game > MSquared avatar converter

Loads GLTF of humanoids, e.g. from [this collection](https://opensea.io/collection/the-sandbox-s-assets?traits=[{%22traitType%22:%22Category+(level+0)%22,%22values%22:[%22Humanoids%22]}]).
Reparents nodes with meshes to the root.
Rigs the meshes based on original hierarchy.
Replaces skeleton with MSquared one.
Optionally merges meshes into a single one with texture atlasing.

In the result, we get a small GLB (99%+ size reduction), with one mesh and two textures (albedo, emissive), and simplified MSquared skin, so UE5 animations can be applied on it.


# Usage

```posh
npm install
node main.js --file ./path/to/file.gltf --output ./path/to/output.glb --merge
```


# Options

## --help
Print possible options.

## --file
GLB/GLTF file to convert.

## --output
A path for output GLB.

## --merge
Default false.  
If enabled, then all meshes will be merged into a single one. All textures will be merged into an Atlases based on slots: base, emissive.

## --inspect
Default false.  
Print resulting GLBs structure: scenes, meshes, materials, textures.

## --silent
Default false.
If set, then console logs will be only errors.


# Models Download

To get models from OpenSea, you need to:
1. Find desired model from [the collection](https://opensea.io/collection/the-sandbox-s-assets?traits=[{%22traitType%22:%22Category+(level+0)%22,%22values%22:[%22Humanoids%22]}])
2. In the top right corner, hit three dots and select "View Original Media"
3. New tab will have url like: "https://www.sandbox.game/model-viewer-light/?assetId=79610d33-3b3c-45a5-9d39-9d93d6774991", copy assetId
4. Then open new tab with link: https://public-assets.sandbox.game/assets/ASSET_ID/gltf replace "ASSET_ID", e.g.: https://public-assets.sandbox.game/assets/79610d33-3b3c-45a5-9d39-9d93d6774991/gltf

