import './dot-env.js'; // Must be the first import
import { EventEmitter } from 'node:events';
import {makeFastifyServer, startFastifyServer} from "./fastify-server.js";
import {makeExpressServer, startExpressServer} from "./express-server.js";
import {numberOfServers, promptPromise} from "./orchestrator.js";
import {sleep} from "@dapperduckling/keycloak-connector-server";
import type {Express} from "express-serve-static-core";
import type {FastifyInstance} from "fastify";

EventEmitter.setMaxListeners(10000);
EventEmitter.defaultMaxListeners = 10000;

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

type MakeServerFunction = typeof makeFastifyServer | typeof makeExpressServer;
type MakeServerPromise = () => Promise<Express | FastifyInstance>;
type StartServerFunction = (port: number, server: any) => Promise<void>;
type StartServerFactory = (server: Express | FastifyInstance) => StartServerFunction;
type BuildServerComponents = {
    makeServerPromise: MakeServerPromise
    startServerFactory: StartServerFactory
}



function buildServer(port: number, serverType: string): BuildServerComponents {
    let makeServerPromise: MakeServerPromise;
    let startServerFactory: StartServerFactory;

    let makeServerFunc: MakeServerFunction;
    let startServerFunc: StartServerFunction;

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

    makeServerPromise = () => makeServerFunc(port);
    startServerFactory = (server: Express | FastifyInstance) => {
        return () => startServerFunc(port, server);
    }

    return {
        makeServerPromise,
        startServerFactory,
    }
}

// Build all our servers
const buildServerComponents: BuildServerComponents[] = [];
const startServerFunctions: any[] = [];
let portNumber = 3005;
for (const [serverType, count] of Object.entries(numberOfServers)) {
    for (let i=0; i<count; i++) {
        const serverComponents = buildServer(portNumber++, serverType);
        buildServerComponents.push(serverComponents);
    }
}

// Initialize all the servers
for (const serverComponents of buildServerComponents) {
    const server = await serverComponents.makeServerPromise();
    const startServerPromiseFunc = serverComponents.startServerFactory(server);
    startServerFunctions.push(startServerPromiseFunc);
    await sleep(10);
}

// Start all servers
try {
    await sleep(1500);
    console.log('Starting servers...');
    let delay = 0;
    await Promise.all([promptPromise, ...startServerFunctions.map(fn => sleep(delay++).then(() => fn()))]);
    console.log('fin');
} catch (e) {
    console.log('error fin');
}
