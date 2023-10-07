local lockKey = KEYS[1]
local clientId = ARGV[1]
local dataKey = KEYS[2]
local value = ARGV[2]
local options = cjson.decode(ARGV[3] or "{}") -- Use an empty JSON object if third argument is not provided

local currentLock = redis.call("GET", lockKey)

local function convertKeysToUpperCase(inputTable)
    local outputTable = {}
    for key, value in pairs(inputTable) do
        if type(key) == "string" then
            outputTable[key:upper()] = value
        else
            outputTable[key] = value
        end
    end
    return outputTable
end

-- Convert all the incoming keys to upper case
options = convertKeysToUpperCase(options)

if currentLock == clientId then
    -- Lock matches, perform the SET operation with options
    local args = {}

    if options["EX"] then
        table.insert(args, "EX")
        table.insert(args, options["EX"])
    end

    if options["PX"] then
        table.insert(args, "PX")
        table.insert(args, options["PX"])
    end

    if options["NX"] then
        table.insert(args, "NX")
    end

    if options["XX"] then
        table.insert(args, "XX")
    end

    redis.call("SET", dataKey, value, unpack(args))
    return "OK"
else
    -- Lock doesn't match, return null
    return nil
end