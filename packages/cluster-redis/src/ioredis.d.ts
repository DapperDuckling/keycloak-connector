import {Result} from "ioredis";

export type SetIfLockedArgs = [lockKey: string, lockValue: string, ...args: unknown];
export type DelIfLocked = [lockKey: string, lockValue: string, ...args: unknown];

declare module "ioredis" {
    interface RedisCommander<Context> {
        setIfLocked(...args: SetIfLockedArgs): Result<string, Context>,
        delIfLocked(...args: DelIfLocked): Result<string, Context>,
    }
}