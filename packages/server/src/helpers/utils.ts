
// Source: jose (epoch.js)
export const epoch = (date: Date = new Date()) => Math.floor(date.getTime() / 1000);

/**
 * Waits until a specified unix timestamp, throws a WaitTimeoutError if expiry time is reached
 * @param promise
 * @param waitUntilMs
 * @throws Error
 */
export const promiseWait = <T>(promise: Promise<T>, waitUntilMs: number) => {
    // Construct sleep promise
    const sleepPromise = async () => {
        const remainingTime = waitUntilMs - (new Date()).getTime();
        await sleep(remainingTime);
        throw new WaitTimeoutError();
    };

    return Promise.race<T>([promise, sleepPromise()]);
}

export class WaitTimeoutError extends Error {
    constructor() {
        super(`Ran out of time waiting for promise to finish`);
    }
}

export const sleep = (ms: number, extraVariability?: number) => new Promise<true>(resolve => {
    const timeout = Math.max(0, ms + (Math.random() * (extraVariability ?? 0)));
    setTimeout(() => resolve(true), timeout);
});

export function isDev() {
    return process && process?.env["NODE_ENV"] === "development";
}

export const isObject = (obj: unknown): obj is Record<never, never> => obj === Object(obj);

export type Deferred<T> = {
    promise: Promise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: never) => void;
}
export const deferredFactory = <T = unknown>(): Deferred<T> => {
    const result = {};
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    result.promise = new Promise(function(resolve, reject) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        result.resolve = resolve;
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        result.reject = reject;
    });
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return result;
};