
// Source: jose (epoch.js)
export const epoch = (date: Date = new Date()) => Math.floor(date.getTime() / 1000);

/**
 * Waits until a specified unix timestamp, throws a WaitTimeoutError if expiry time is reached
 * @param promise
 * @param waitUntilMs
 * @throws Error
 */
export const promiseWait = async <T>(promise: Promise<T>, waitUntilMs: number): Promise<T> => {
    let nodeTimeout: NodeJS.Timeout | null = null;

    // Construct sleep promise
    const sleepPromise = async () => {
        const remainingTime = waitUntilMs - (new Date()).getTime();
        await sleep(remainingTime, undefined, (newNodeTimeout) => {
            nodeTimeout = newNodeTimeout;
        });
        throw new WaitTimeoutError();
    };

    const result = await Promise.race<T>([promise, sleepPromise()]);

    // Clear the timeout since the original promise was successful
    if (nodeTimeout) clearTimeout(nodeTimeout);

    // Return the actual result
    return result;
}

export const promiseWaitTimeout = <T>(promise: Promise<T>, timeoutMs: number) => {
    const waitUntilMs = (new Date()).getTime() + timeoutMs;
    return promiseWait(promise, waitUntilMs);
}

export const ttlFromExpiration = (expiration: number | undefined) => (expiration) ? Math.max(0, expiration - (new Date()).getTime()/1000) : undefined;

export class WaitTimeoutError extends Error {
    constructor() {
        super(`Ran out of time waiting for promise to finish`);
    }
}

export const sleep = (ms: number, extraVariability?: number, setNodeTimeout?: (nodeTimeout: NodeJS.Timeout) => void) => new Promise<true>(resolve => {
    const timeout = Math.max(0, ms + (Math.random() * (extraVariability ?? 0)));
    const nodeTimeout = setTimeout(() => resolve(true), timeout);
    setNodeTimeout?.(nodeTimeout);
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
