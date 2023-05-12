export default () => {
    if (!process.env.seed) {
        process.env.seed = Math.ceil(Math.random() * Number.MAX_SAFE_INTEGER).toString(10);
    }
    console.log(`\nUsing seed: ${process.env.seed}`);
}