if redis.call("get",KEYS[1]) == ARGV[1] then
    return redis.call("del", unpack(KEYS, 2))
else
    return nil
end