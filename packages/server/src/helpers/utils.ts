
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function isDev() {
    return process && process?.env["NODE_ENV"] === "development";
}

export const isObject = (obj: unknown): obj is Record<any, any> => obj === Object(obj);