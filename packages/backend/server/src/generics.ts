type ConstructorWithoutArgs<T> = new () => T;
type ConstructorWithArgs<T, A extends any[]> = new (...args: A) => T;

export type Constructor<T, A extends any[] = []> = ConstructorWithArgs<T, A> | ConstructorWithoutArgs<T>;
