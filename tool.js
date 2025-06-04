import { parseArgs } from './includes/utils.js';
import convert from './main.js';


const start = performance.now();

const options = await parseArgs();
const numberFormatter = new Intl.NumberFormat();


const converted = await convert(options);
if (!converted) {
    if (!options.silent) console.log('failed to convert', options);
    process.exit(1);
}


if (!options.silent)
    console.log('Elapsed:', numberFormatter.format(Math.round(performance.now() - start)) + 'ms');