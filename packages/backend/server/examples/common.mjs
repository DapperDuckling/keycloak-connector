import pino from "pino";

export function isDev() {
    return typeof process !== 'undefined' && process.env?.["NODE_ENV"] === "development";
}

export const pinoLoggerOptions = {
    level: isDev() ? 'debug' : 'info',
    transport: {
        target: 'pino-pretty',
        options: {
            translateTime: 'UTC:yyyy-mm-dd HH:MM:ss.l o',
        }
    }
}

export const getPinoLogger = pino(pinoLoggerOptions);

const responseHeader =  `
    <style>
        a {
            margin: 0 10px;
        }
    </style>
    <h2>Super Simple Keycloak Connector Server Example</h2>
    <div>
        Navigate to:
        <a href="/">Public</a>
        <a href="/no-role-required">No Role Required</a>
        <a href="/cool-guy">"COOL_GUY" Required</a>
        <a href="/auth/login">Login</a>
        <a href="/auth/logout">Logout</a>
    </div>`;

export const responses = {
    public: `${responseHeader}<h4>I am a public route and no authentication nor authorization is required to reach me.</h4>`,
    noRole: `${responseHeader}<h4>This route only requires a user to login (authenticate) to access.</h4>`,
    coolGuy: `${responseHeader}<h4>This route requires an end-user to have the "COOL_GUY" role.</h4>`,
}
