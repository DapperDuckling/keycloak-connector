import {Result} from "ioredis";

export type SetIfLockedArgs = [lockKey: string, key: unknown, lockValue: string, ...args: unknown];
export type DelIfLocked = [numKeys: number, lockKey: string, ...keys: unknown, lockValue: string, ...args: unknown];

declare module "ioredis" {
    interface RedisCommander<Context> {
        setIfLocked(...args: SetIfLockedArgs): Result<string, Context>,
        delIfLocked(...args: DelIfLocked): Result<string, Context>,
    }
}