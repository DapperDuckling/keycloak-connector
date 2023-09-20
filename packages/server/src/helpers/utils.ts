
// Source: jose (epoch.js)
export const epoch = (date: Date = new Date()) => Math.floor(date.getTime() / 1000);

export const promiseWait = <T>(promise: Promise<T>, start: number, maxDuration: number) => {
    // Construct sleep promise
    const elapsedTime = (new Date()).getTime() - start;
    const sleepPromise = async () => {
        await sleep(maxDuration - elapsedTime);
        throw new Error('max function duration exceeded');
    };

    return Promise.race<T>([promise, sleepPromise()]);
}

export const sleep = (ms: number, extraVariability?: number) => new Promise<void>(resolve => {
    const timeout = ms + (Math.random() * (extraVariability ?? 0));
    setTimeout(resolve, timeout);
});

export function isDev() {
    return process && process?.env["NODE_ENV"] === "development";
}

export const isObject = (obj: unknown): obj is Record<any, any> => obj === Object(obj);