

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
        throw new WaitTimeoutError(remainingTime);
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
    waitedTimeSec: number;
    constructor(waitedTimeMs: number) {
        super(`Ran out of time waiting for promise to finish`);
        this.waitedTimeSec = waitedTimeMs / 1000;
    }
}

export const sleep = (ms: number, extraVariability?: number, setNodeTimeout?: (nodeTimeout: NodeJS.Timeout) => void) => new Promise<true>(resolve => {
    const timeout = Math.max(0, ms + (Math.random() * (extraVariability ?? 0)));
    const nodeTimeout = setTimeout(() => resolve(true), timeout);
    setNodeTimeout?.(nodeTimeout);
});

export const debounce = <T extends (...args: any[]) => void>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    return (...args: Parameters<T>) => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            func(...args);
        }, wait);
    };
};
