
// Source: jose (epoch.js)
export const epoch = (date: Date = new Date()) => Math.floor(date.getTime() / 1000);


export function isDev() {
    return typeof process !== 'undefined' && process.env?.["NODE_ENV"] === "development";
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
