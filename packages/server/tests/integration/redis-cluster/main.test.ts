import './dot-env.js'; // Must be the first import
import { EventEmitter } from 'node:events';
import {makeFastifyServer, startFastifyServer} from "./fastify-server.js";
import {makeExpressServer, startExpressServer} from "./express-server.js";
import {numberOfServers, promptPromise} from "./orchestrator.js";

EventEmitter.setMaxListeners(1000);
EventEmitter.defaultMaxListeners = 1000;

export const loggerOpts = {
    msgPrefix: "base",
    level: "debug",
    // level: "warn",
    transport: {
        target: 'pino-pretty',
        options: {
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
        },
    },
};

function buildServer(port: number, serverType: string) {
    let makeServerPromise;
    let startServerPromise;

    let makeServerFunc;
    let startServerFunc: (port: number, server: any) => Promise<void>;

    switch (serverType) {
        case 'fastify':
            makeServerFunc = makeFastifyServer;
            startServerFunc = startFastifyServer;
            break;
        case 'express':
            makeServerFunc = makeExpressServer;
            startServerFunc = startExpressServer;
            break;
        default:
            throw new Error('Unknown server type');
    }

    makeServerPromise = makeServerFunc(port);
    startServerPromise = makeServerPromise.then(server => startServerFunc(port, server));

    return {
        makeServerPromise,
        startServerPromise,
    }
}

// Make all our servers
const makeServerPromises: any[] = [];
const startServerPromises: any[] = [];
let portNumber = 3005;
for (const [serverType, count] of Object.entries(numberOfServers)) {
    for (let i=0; i<count; i++) {
        const {makeServerPromise, startServerPromise} = buildServer(portNumber++, serverType);
        makeServerPromises.push(makeServerPromise);
        startServerPromises.push(startServerPromise);
    }
}

// Wait for the servers to get created
await Promise.all(makeServerPromises);

// Start all servers
try {
    console.log(`Let it rip`);
    await Promise.all([...startServerPromises, promptPromise]);
    console.log('fin');
} catch (e) {
    console.log('error fin');
}