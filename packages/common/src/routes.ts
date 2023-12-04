import {RouteUrlDefaults} from "./defaults.js";
import type {CustomRouteUrl, RouteEnum} from "./types.js";

export const getRoutePath = (route: RouteEnum, routePaths?: CustomRouteUrl) => {
    const prefix = routePaths?._prefix ?? RouteUrlDefaults._prefix;
    const routePath = routePaths?.[route] ?? RouteUrlDefaults[route];

    if (routePath === undefined) console.error(`Could not find route path for ${route}`);

    return `${prefix}${routePath}`;
}
