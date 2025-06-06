import {WaitTimeoutError} from "./errors.js";
import {jwtVerify} from "jose";
import type {JWK, JWTVerifyOptions} from "jose";

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
    if (nodeTimeout !== null) clearTimeout(nodeTimeout);

    // Return the actual result
    return result;
}

export const promiseWaitTimeout = <T>(promise: Promise<T>, timeoutMs: number) => {
    const waitUntilMs = (new Date()).getTime() + timeoutMs;
    return promiseWait(promise, waitUntilMs);
}

export const ttlFromExpiration = (expiration: number | undefined) => (expiration) ? Math.max(0, expiration - (new Date()).getTime()/1000) : undefined;

export const sleep = (ms: number, extraVariability?: number, setNodeTimeout?: (nodeTimeout: NodeJS.Timeout) => void) => new Promise<true>(resolve => {
    const timeout = Math.max(0, ms + (Math.random() * (extraVariability ?? 0)));
    const nodeTimeout = setTimeout(() => resolve(true), timeout);
    setNodeTimeout?.(nodeTimeout);
});

export const throttle = <T extends (...args: any[]) => void>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void => {
    let lastCall = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    return (...args: Parameters<T>) => {
        const now = Date.now();
        const remaining = wait - (now - lastCall);

        if (remaining <= 0) {
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            lastCall = now;
            func(...args);
        } else if (!timeoutId) {
            timeoutId = setTimeout(() => {
                lastCall = Date.now();
                timeoutId = null;
                func(...args);
            }, remaining);
        }
    };
};


export const jwtVerifyMultiKey = async (
    jwt: string,
    keys: JWK[],
    options?: JWTVerifyOptions,
) => {
    let lastError;
    for (const key of keys) {
        try {
            return await jwtVerify(jwt, key, options);
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError;
};
