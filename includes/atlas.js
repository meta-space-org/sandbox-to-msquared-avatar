import { listTextureInfo } from '@gltf-transform/functions';
import { getPixels, savePixels } from 'ndarray-pixels';
import * as ndarrayD from 'ndarray';
const ndarray = ndarrayD.default;


export const atlasesMaterialMethods = {
    'base': {
        'set': 'setBaseColorTexture',
        'get': 'getBaseColorTexture'
    },
    'emissive': {
        'set': 'setEmissiveTexture',
        'get': 'getEmissiveTexture'
    }
};


const atlasesFill = {
    'base': [ 0, 0, 0, 255 ],
    'emissive': [ 0, 0, 0, 255 ]
};


export class Atlas {
    texture;
    data;
    ndata;
    mime = 'image/png';

    constructor(document, name, width, height) {
        this.texture = document.createTexture(name);

        const infos = listTextureInfo(this.texture);
        for(let n = 0; n < infos.length; n++) {
            infos[n].setMinFilter(9984);
            infos[n].setMagFilter(9728);
        }

        this.data = new Uint8Array(width * height * 4);
        this.ndata = ndarray(this.data, [width, height, 4]).transpose(1, 0);
    }

    fill(r = 0, g = 0, b = 0, a = 255) {
        for (let x = 0; x < this.ndata.shape[0]; ++x) {
            for (let y = 0; y < this.ndata.shape[1]; ++y) {
                this.ndata.set(x, y, 0, r);
                this.ndata.set(x, y, 1, g);
                this.ndata.set(x, y, 2, b);
                this.ndata.set(x, y, 3, a);
            }
        }
    }

    async copy(texture, x, y, targetSize) {
        const data = texture.getImage();
        const source = await getPixels(data, texture.getMimeType());
        const size = source.shape;

        for(let tx = 0; tx < targetSize; tx++) {
            for(let ty = 0; ty < targetSize; ty++) {
                const sx = Math.floor(tx * (size[0] / targetSize));
                const sy = Math.floor(ty * (size[1] / targetSize));

                this.ndata.set(tx + x, ty + y, 0, source.get(sx, sy, 0));
                this.ndata.set(tx + x, ty + y, 1, source.get(sx, sy, 1));
                this.ndata.set(tx + x, ty + y, 2, source.get(sx, sy, 2));
            }
        }
    }

    set(x, y, rgb) {
        this.ndata.set(x, y, 0, rgb[0]);
        this.ndata.set(x, y, 1, rgb[1]);
        this.ndata.set(x, y, 2, rgb[2]);
    }

    fillRect(x, y, width, height, rgb) {
        for(let sy = y; sy < y + height; sy++) {
            for(let sx = x; sx < x + width; sx++) {
                this.ndata.set(sx, sy, 0, rgb[0]);
                this.ndata.set(sx, sy, 1, rgb[1]);
                this.ndata.set(sx, sy, 2, rgb[2]);
            }
        }
    }

    async upload() {
        const png = await savePixels(this.ndata, this.mime);
        this.texture.setImage(png).setMimeType(this.mime);
    }
}


export const remapUvsToAtlas = (uvs, index, atlasWidth) => {
    const uv = [ 0, 0 ];
    let e = uvs.getCount();
    while(e--) {
        uvs.getElement(e, uv);

        // size
        uv[0] /= atlasWidth;
        uv[1] /= atlasWidth;
        // offset
        uv[0] += (index % atlasWidth) / atlasWidth;
        uv[1] += (Math.floor(index / atlasWidth)) / atlasWidth;

        uvs.setElement(e, uv);
    }
};


export const createAtlases = (document, size, material, slots) => {
    const atlases = { };
    
    // create atlases
    for(let i = 0; i < slots.length; i++) {
        const slot = slots[i];

        const atlas = new Atlas(document, `atlas-${slot}`, size, size);
        atlases[slot] = atlas;

        // fill
        const rgba = atlasesFill[slot];
        atlas.fill(rgba[0], rgba[1], rgba[2], rgba[3]);

        // set on main material
        material[atlasesMaterialMethods[slot].set](atlas.texture);
    }

    return atlases;
};


export const copyTexturesToAtlases = async (document, primitives, atlases, atlasWidth, targetAtlasSize) => {
    // copy textures into atlas
    for(let i = 0; i < primitives.length; i++) {
        const primitive = primitives[i];
        const material = primitive.materialOld;

        const offX = Math.round((i % atlasWidth) * (targetAtlasSize / atlasWidth));
        const offY = Math.round((Math.floor(i / atlasWidth)) * (targetAtlasSize / atlasWidth));

        for(let key in atlases) {
            const texture = material[atlasesMaterialMethods[key].get]();
            if (!texture) continue;
            atlases[key].fillRect(offX, offY, 64, 64, [
                Math.floor((i / primitives.length) * 255),
                Math.floor((i / primitives.length) * 255),
                Math.floor((i / primitives.length) * 255)
            ]);
            await atlases[key].copy(texture, offX, offY, Math.round(targetAtlasSize / atlasWidth));
        }
    }
};