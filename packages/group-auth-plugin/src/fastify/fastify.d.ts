import type {GroupAuthPlugin} from "../group-auth-plugin.js";
import type {GroupAuthData} from "../types.js";
import type {FastifyRegister} from "fastify";

declare module 'fastify' {
    interface FastifyRequest {
        kccGroupAuthData: GroupAuthData;
    }

    interface FastifyInstance {
        kccGroupAuth: ReturnType<GroupAuthPlugin['exposedEndpoints']>;
    }
}

// export const groupAuthFastifyPlugin: FastifyRegister<GroupAuthData>;
export default groupAuthFastifyPlugin;
