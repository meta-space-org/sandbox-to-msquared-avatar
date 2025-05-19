import { MaxRectsPacker } from 'maxrects-packer';
import { getPixels } from 'ndarray-pixels';


const SIZES = [ 64, 128, 256, 512, 1024, 2048, 4096 ];


export class Packer {
    width = 0;
    height = 0;
    list = [ ];
    packer;

    add(width, height, texture) {
        this.list.push({
            width: width,
            height: height,
            texture: texture
        });
    }

    calculate() {
        for(let i = 0; i < SIZES.length; i++) {
            const size = SIZES[i];
            const packer = new MaxRectsPacker(size, size, 0, {
                smart: true,
                square: true
            });
            packer.addArray(this.list.slice(0));
            if (packer.bins[0].rects.length === this.list.length) {
                this.packer = packer;
                this.width = this.packer.width;
                this.height = this.packer.height;
                break;
            }
        }
    }

    get rects() {
        return this.packer?.bins[0].rects ?? null;
    }
}


export const iterateTextures = async (primitives, slotMethod, onEachTexture) => {
    const primitiveToTexture = new Map();

    for(let p = 0; p < primitives.length; p++) {
        const primitive = primitives[p];

        const material = primitive.materialOld;
        if (!material) continue;

        const texture = material[slotMethod]();
        if (!texture) continue;

        primitiveToTexture.set(primitive, texture);

        const data = texture.getImage();
        const source = await getPixels(data, texture.getMimeType());
        const size = source.shape;

        onEachTexture(texture, size[0], size[1]);
    }

    return primitiveToTexture;
};