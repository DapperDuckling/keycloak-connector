// Adapted from: https://github.com/nodejs/node/issues/47478
// Suppress Node.js warning about experimental VM API

const originalEmit = process.emit;
process.emit = function (event, error) {
    if (
        event === 'warning' &&
        error.name === 'ExperimentalWarning' &&
        error.message.includes('VM Modules is an experimental feature')
    ) {
        return false;
    }

    return originalEmit.apply(process, arguments);
};