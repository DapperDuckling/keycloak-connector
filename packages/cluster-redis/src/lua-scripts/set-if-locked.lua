local lockKey = KEYS[1]
local clientId = ARGV[1]
local dataKey = KEYS[2]
local value = ARGV[2]
local options = cjson.decode(ARGV[3] or "{}") -- Use an empty JSON object if third argument is not provided

local currentLock = redis.call("GET", lockKey)

if currentLock == clientId then
    -- Lock matches, perform the SET operation with options
    local args = {}

    if options["ex"] then
        table.insert(args, "EX")
        table.insert(args, options["ex"])
    end

    if options["px"] then
        table.insert(args, "PX")
        table.insert(args, options["px"])
    end

    if options["nx"] then
        table.insert(args, "NX")
    end

    if options["xx"] then
        table.insert(args, "XX")
    end

    redis.call("SET", dataKey, value, unpack(args))
    return "OK"
else
    -- Lock doesn't match, return null
    return nil
end