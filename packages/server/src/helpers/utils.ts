
// Source: jose (epoch.js)
export const epoch = (date: Date = new Date()) => Math.floor(date.getTime() / 1000);

export const promiseWait = <T>(promise: Promise<T>, waitUntil: number) => {
    // Construct sleep promise
    const sleepPromise = async () => {
        const remainingTime = waitUntil - (new Date()).getTime();
        await sleep(remainingTime);
        throw new Error('max function duration exceeded');
    };

    return Promise.race<T>([promise, sleepPromise()]);
}

export const sleep = (ms: number, extraVariability?: number) => new Promise<void>(resolve => {
    const timeout = Math.max(0, ms + (Math.random() * (extraVariability ?? 0)));
    setTimeout(resolve, timeout);
});

export function isDev() {
    return process && process?.env["NODE_ENV"] === "development";
}

export const isObject = (obj: unknown): obj is Record<any, any> => obj === Object(obj);