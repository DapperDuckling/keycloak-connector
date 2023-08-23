import {Result} from "ioredis";

declare module "ioredis" {
    interface RedisCommander<Context> {
        setIfLocked(...args: SetIfLockedArgs): Result<string, Context>,
        delIfLocked(...args: DelIfLocked): Result<string, Context>,
    }
}