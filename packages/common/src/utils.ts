
// Source: jose (epoch.js)
export const epoch = (date: Date = new Date()) => Math.floor(date.getTime() / 1000);


export function isDev() {
    return typeof process !== 'undefined' && process.env?.["NODE_ENV"] === "development";
}

export const isObject = (obj: unknown): obj is Record<never, never> => obj === Object(obj);

export type Deferred<T> = {
    promise: Promise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: unknown) => void;
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

class URL_polyfill extends URL {
    static override canParse = (str: string) => {
        if (typeof URL.canParse === "function") {
            return URL.canParse(str);
        }

        // Polyfill
        try {
            new URL(str);
            return true;
        } catch (e) {
            return false;
        }
    }
}
export {URL_polyfill as URL};

// Polyfill for browsers
export const decodePayloadFromBase64 = (base64: string): Record<string, any> => {
    const binary = atob(base64);
    const uint8 = Uint8Array.from(binary, c => c.charCodeAt(0));
    const json = new TextDecoder().decode(uint8);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return JSON.parse(json);
}
