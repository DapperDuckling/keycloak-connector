#!lua name=redis_cluster_provider

local function setIfLocked(keys, args)
    local key = KEYS[1]
    local value = ARGV[1]
    local lockKey = KEYS[2]
    local clientId = ARGV[2]

    -- Check if the lock is held by the current client
    local lockValue = redis.call('get', lockKey)
    if lockValue ~= clientId then
        return nil
    end

    -- The lock is held by the current client, perform the set
    redis.call('set', key, value)
    return "OK"
end

redis.register_function('setIfLocked', setIfLocked)

