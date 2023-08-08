
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function isDev() {
    return process && process?.env["NODE_ENV"] === "development";
}

