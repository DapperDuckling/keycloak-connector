
export const setImmediate = (handler: () => any) => setTimeout(handler, 0);

export const rateLimit = <T extends (...args: any[]) => void>(func: T, delay: number) => {
    let timeout: NodeJS.Timeout | undefined = undefined;
    let lastTime = 0;

    return function(...args: Parameters<T>) {
        let now = Date.now();

        if (now - lastTime > delay) {
            // Enough time has passed, call the function immediately
            lastTime = now;
            func(...args);
        } else if (timeout) {
            // A timeout already exists, do nothing
            return;
        } else {
            // Not timeout exists and not enough time has passed, set a timeout
            timeout = setTimeout(() => {
                timeout = undefined;
                lastTime = Date.now();
                func(...args);
            }, delay);
        }
    };
};
