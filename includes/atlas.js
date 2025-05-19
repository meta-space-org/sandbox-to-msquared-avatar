import { getPixels, savePixels } from 'ndarray-pixels';
import * as ndarrayD from 'ndarray';
const ndarray = ndarrayD.default;


export class Atlas {
    texture;
    data;
    ndata;
    mime = 'image/png';

    constructor(document, name, width, height, channel = 0) {
        this.texture = document.createTexture(name);
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

    async copy(texture, x, y) {
        const data = texture.getImage();
        const source = await getPixels(data, texture.getMimeType());
        const size = source.shape;

        for(let tx = 0; tx < size[0]; tx++) {
            for(let ty = 0; ty < size[1]; ty++) {
                this.ndata.set(tx + x, ty + y, 0, source.get(tx, ty, 0));
                this.ndata.set(tx + x, ty + y, 1, source.get(tx, ty, 1));
                this.ndata.set(tx + x, ty + y, 2, source.get(tx, ty, 2));
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

    get width() {
        return this.ndata.shape[0]
    }

    get height() {
        return this.ndata.shape[1];
    }
}


export const remapUvsToAtlas = (uvs, packer, rect) => {
    const uv = [ 0, 0 ];
    let e = uvs.getCount();
    while(e--) {
        uvs.getElement(e, uv);

        // size
        uv[0] *= rect.width / packer.width;
        uv[1] *= rect.height / packer.height;
        // offset
        uv[0] += rect.x / packer.width;
        uv[1] += rect.y / packer.height;

        uvs.setElement(e, uv);
    }
};
